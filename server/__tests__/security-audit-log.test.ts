import './support/test-env';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createSecurityAuditLogger } from '../security-audit-log';

jest.mock('../email-service', () => ({ sendPasswordResetEmail: jest.fn() }));
import { logSecurityEvent } from '../auth';

let tempDir: string;
beforeEach(() => { tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taptpay-audit-test-')); });
afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

it('does not perform blocking disk I/O while recording an authentication event', () => {
  const append = jest.spyOn(fs, 'appendFileSync').mockImplementation(() => undefined);
  logSecurityEvent('LOGIN_SUCCESS', { email: 'owner@example.test', userId: 12 });
  expect(append).not.toHaveBeenCalled();
});

it('writes events in order, redacts sensitive fields and does not mutate caller details', async () => {
  const filePath = path.join(tempDir, 'logs', 'audit.log');
  const logger = createSecurityAuditLogger({ filePath });
  const details = { email: 'a@example.test', nested: { password: 'secret-password', token: 'secret-token' },
    event: 'overridden', timestamp: 'overridden', userId: 4 };
  logger.log('LOGIN_SUCCESS', details);
  logger.log('LOGOUT', { email: 'owner@example.test' });
  expect(await logger.close()).toBe(true);
  const raw = fs.readFileSync(filePath, 'utf8');
  const rows = raw.trim().split('\n').map((line) => JSON.parse(line));
  expect(rows.map((row) => row.event)).toEqual(['LOGIN_SUCCESS', 'LOGOUT']);
  expect(rows[0]).toMatchObject({ email: '***@example.test', userId: 4,
    nested: { password: '[REDACTED]', token: '[REDACTED]' } });
  expect(rows[0].timestamp).not.toBe('overridden');
  expect(rows[1].email).toBe('ow***@example.test');
  expect(raw).not.toContain('secret-password'); expect(raw).not.toContain('secret-token');
  expect(details.nested.token).toBe('secret-token');
  expect(fs.statSync(filePath).mode & 0o777).toBe(0o600);
});

it('reports an actual failed disk append without leaking error or event details', async () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  const logger = createSecurityAuditLogger({ filePath: tempDir }); // append to directory -> EISDIR
  logger.log('LOGIN_FAILURE', { email: 'private@example.test', token: 'private-token' });
  expect(await logger.close()).toBe(false);
  expect(error).toHaveBeenCalledWith('[SECURITY_LOG_ERROR] reason=write_failed count=1');
  const diagnostics = JSON.stringify(error.mock.calls);
  expect(diagnostics).not.toMatch(/private|EISDIR/);
  expect(diagnostics).not.toContain(tempDir);
});

it.each([
  { maxQueuedEvents: 2 },
  { maxQueuedBytes: 150 },
])('bounds a stalled sink by %p including the in-flight event', async (limit) => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  let release!: () => void;
  const stalled = new Promise<void>((resolve) => { release = resolve; });
  const lines: string[] = [];
  const logger = createSecurityAuditLogger({ filePath: 'unused', ...limit,
    writeLine: async (line) => { lines.push(line); await stalled; } });
  for (let n = 0; n < 100; n++) logger.log('EVENT', { n });
  expect(lines).toHaveLength(1);
  release();
  expect(await logger.close()).toBe(false);
  expect(lines).toHaveLength(2);
  expect(lines.map((line) => JSON.parse(line).n)).toEqual([0, 1]);
});

it('bounds shutdown time when the disk never completes', async () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  const logger = createSecurityAuditLogger({ filePath: 'unused', writeLine: () => new Promise(() => {}) });
  logger.log('EVENT', { token: 'private-token' });
  expect(await logger.close(10)).toBe(false);
  expect(error).toHaveBeenCalledWith(expect.stringContaining('reason=shutdown_timeout pending=1'));
  logger.log('LATE_EVENT', {});
  expect(error).toHaveBeenCalledWith('[SECURITY_LOG_ERROR] reason=logger_closed count=1');
});

it('handles circular and oversized event details with bounded output', async () => {
  const lines: string[] = [];
  const logger = createSecurityAuditLogger({ filePath: 'unused', writeLine: async (line) => { lines.push(line); } });
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  logger.log('CIRCULAR', cycle);
  logger.log('LARGE', Object.fromEntries(Array.from({ length: 32 }, (_, n) => [`field${n}`, 'x'.repeat(10000)])));
  expect(await logger.close()).toBe(true);
  expect(JSON.parse(lines[0]).self).toBe('[CIRCULAR]');
  expect(JSON.parse(lines[1]).details).toBe('[OMITTED_TOO_LARGE]');
  expect(lines.every((line) => Buffer.byteLength(line) <= 16 * 1024)).toBe(true);
});

it.each([false, true])('drains audit events on real SIGTERM (failed disk: %s)', (failDisk) => {
  if (failDisk) fs.mkdirSync(path.join(tempDir, 'logs', 'security-audit.log'), { recursive: true });
  const moduleUrl = (name: string) => JSON.stringify(pathToFileURL(path.resolve(__dirname, '..', name)).href);
  const script = `
    import { createServer } from 'node:http';
    process.chdir(${JSON.stringify(tempDir)});
    const { writeSecurityAuditEvent } = await import(${moduleUrl('security-audit-log.ts')});
    const { setupGracefulShutdown } = await import(${moduleUrl('port-manager.ts')});
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    setupGracefulShutdown(server, server.address().port);
    for (let n = 0; n < 200; n++) writeSecurityAuditEvent('SHUTDOWN_TEST', { n });
    process.kill(process.pid, 'SIGTERM');
  `;
  const result = spawnSync(process.execPath, ['--import=tsx', '--input-type=module', '-e', script], {
    cwd: path.resolve(__dirname, '../..'), env: { APP_ENV: 'test', ENV_VALIDATION_MODE: 'audit' },
    encoding: 'utf8', timeout: 10000,
  });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status).toBe(failDisk ? 1 : 0);
  if (failDisk) expect(result.stderr).toContain('reason=write_failed');
  else {
    const rows = fs.readFileSync(path.join(tempDir, 'logs', 'security-audit.log'), 'utf8').trim().split('\n');
    expect(rows.map((line) => JSON.parse(line).n)).toEqual(Array.from({ length: 200 }, (_, n) => n));
  }
});
