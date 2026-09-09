import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const REPOSITORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = new Set(['local', 'ci', 'staging', 'production']);
const fail = (code) => { throw new Error(code); };

export function parseBackupArguments(argv) {
  const options = {};
  const allowed = new Set(['target', 'expected-host', 'expected-database', 'recipient', 'output']);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    const value = argv[i + 1];
    if (!argv[i].startsWith('--') || !allowed.has(key) || key in options || !value || value.startsWith('--')) {
      fail('BACKUP_INVALID_ARGUMENTS');
    }
    options[key] = value;
  }
  if (Object.keys(options).length !== allowed.size || !TARGETS.has(options.target)) fail('BACKUP_INVALID_ARGUMENTS');
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(options.recipient)) fail('BACKUP_INVALID_RECIPIENT');
  if (!path.isAbsolute(options.output) || !options.output.endsWith('.sql.gpg')) fail('BACKUP_INVALID_OUTPUT');
  return options;
}

export function validateBackupConnection(options, env) {
  let url;
  try { url = new URL(env.BACKUP_DATABASE_URL); } catch { fail('BACKUP_INVALID_CONNECTION'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || url.hash) fail('BACKUP_INVALID_CONNECTION');
  let database;
  try { database = decodeURIComponent(url.pathname.slice(1)); } catch { fail('BACKUP_INVALID_CONNECTION'); }
  if (url.host !== options['expected-host'] || database !== options['expected-database'] || !database) {
    fail('BACKUP_TARGET_MISMATCH');
  }
  // Libpq query options can override the apparent host/db/user. Accept only
  // bounded transport settings, once each; never service/host/dbname.
  const queryKeys = [...url.searchParams.keys()];
  if (new Set(queryKeys).size !== queryKeys.length || queryKeys.some((key) => !['sslmode', 'connect_timeout'].includes(key))) {
    fail('BACKUP_INVALID_CONNECTION');
  }
  const ssl = url.searchParams.get('sslmode');
  if (options.target !== 'local' && ssl !== 'verify-full') fail('BACKUP_TLS_REQUIRED');
  if (ssl !== null && !['disable', 'require', 'verify-ca', 'verify-full'].includes(ssl)) fail('BACKUP_INVALID_CONNECTION');
  const timeout = url.searchParams.get('connect_timeout');
  if (timeout !== null && (!/^[1-9]\d*$/.test(timeout) || Number(timeout) > 60)) fail('BACKUP_INVALID_CONNECTION');
  if (options.target === 'local' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    fail('BACKUP_TARGET_MISMATCH');
  }
  return url.toString();
}

function processResult(child, code) {
  return new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error(code)));
    child.once('close', (status) => status === 0 ? resolve() : reject(new Error(code)));
  });
}

/** No ambient DB/provider credentials reach either subprocess. */
export async function encryptedDump({ connection, recipient, output, env, signal, timeoutMs = 30 * 60_000 }) {
  let file;
  let dump;
  let encrypt;
  let timeout;
  let forceStop;
  let completed = false;
  let operations = [];
  const stop = () => {
    for (const child of [dump, encrypt]) {
      if (child && child.exitCode === null) child.kill('SIGTERM');
    }
    forceStop ??= setTimeout(() => {
      for (const child of [dump, encrypt]) {
        if (child && child.exitCode === null) child.kill('SIGKILL');
      }
    }, 2_000);
    forceStop.unref();
  };
  try {
    signal?.throwIfAborted();
    // Exclusive creation rejects existing files and symlinks, including dangling ones.
    file = await fs.open(output, 'wx', 0o600);
    const childEnv = { PATH: env.PATH, LANG: 'C', LC_ALL: 'C' };
    const dumpEnv = {
      ...childEnv,
      PGDATABASE: connection,
      PGCONNECT_TIMEOUT: '30',
      ...(new URL(connection).searchParams.get('sslmode') === 'verify-full'
        ? { PGSSLROOTCERT: 'system' }
        : {}),
    };
    dump = spawn('pg_dump', ['--no-owner', '--no-privileges', '--no-password'], {
      env: dumpEnv,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    encrypt = spawn('gpg', ['--batch', '--no-tty', '--no-options', '--encrypt', '--recipient', recipient, '--output', '-'], {
      env: { ...childEnv, ...(env.GNUPGHOME ? { GNUPGHOME: env.GNUPGHOME } : {}), ...(env.HOME ? { HOME: env.HOME } : {}) },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    operations = [
      processResult(dump, 'BACKUP_DUMP_FAILED'),
      processResult(encrypt, 'BACKUP_ENCRYPTION_FAILED'),
      pipeline(dump.stdout, encrypt.stdin),
      pipeline(encrypt.stdout, new Writable({
        write(chunk, _encoding, callback) {
          file.writeFile(chunk).then(() => callback(), callback);
        },
      })),
    ];
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    let timedOut = false;
    timeout = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    await Promise.all(operations);
    if (timedOut || signal?.aborted) fail('BACKUP_CANCELLED');
    if ((await file.stat()).size === 0) fail('BACKUP_EMPTY_OUTPUT');
    await file.sync();
    completed = true;
  } catch {
    stop();
    await Promise.allSettled(operations);
    // Never propagate subprocess errors, URIs, paths or provider output.
    fail('BACKUP_FAILED');
  } finally {
    clearTimeout(timeout);
    clearTimeout(forceStop);
    signal?.removeEventListener('abort', stop);
    if (file) {
      await file.close();
      if (!completed) await fs.unlink(output);
    }
  }
}

export async function runBackup(argv, {
  env = process.env, input = process.stdin, output = process.stdout,
  confirm, execute = encryptedDump, signal,
} = {}) {
  if (env.CI !== undefined || !input.isTTY || !output.isTTY) fail('BACKUP_OPERATOR_ONLY');
  const options = parseBackupArguments(argv);
  const connection = validateBackupConnection(options, env);
  let parent;
  try { parent = await fs.realpath(path.dirname(options.output)); } catch { fail('BACKUP_INVALID_OUTPUT'); }
  const repository = await fs.realpath(REPOSITORY);
  const relative = path.relative(repository, parent);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    fail('BACKUP_OUTPUT_IN_REPOSITORY');
  }
  const destination = path.join(parent, path.basename(options.output));
  const required = `BACKUP ${options.target}`;
  const ask = confirm ?? (async () => {
    const reader = createInterface({ input, output });
    try { return await reader.question(`Type ${required} to create the approved encrypted backup: `, { signal }); }
    finally { reader.close(); }
  });
  if (await ask() !== required) fail('BACKUP_NOT_CONFIRMED');
  await execute({ connection, recipient: options.recipient, output: destination, env, signal });
  output.write('Encrypted backup created. Restore/decrypt verification remains required.\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  try { await runBackup(process.argv.slice(2), { signal: controller.signal }); }
  catch (error) {
    const code = /^BACKUP_[A-Z_]+$/.test(error.message) ? error.message : 'BACKUP_FAILED';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  } finally {
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
  }
}
