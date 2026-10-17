import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const hook = path.resolve('scripts/r8-package-network-guard.mjs');
for (const [name, source, kind] of [
  [
    'expected optional parent pipe',
    'net.connect({path:process.env.R8_PACKAGE_EXPECTED_TSX_IPC})',
    'optional-tsx-ipc-refused',
  ],
  [
    'other Unix socket',
    "net.connect({path:'/tmp/unowned-synthetic-socket'})",
    'unexpected-ipc',
  ],
  ['TCP socket', "net.connect({host:'127.0.0.1',port:1})", 'tcp'],
  ['TLS socket', "tls.connect({host:'127.0.0.1',port:1})", 'tls'],
])
  test(
    'package guard refuses ' + name + ' even if caller swallows the error',
    () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'taptpay-package-guard-')),
        report = path.join(dir, 'report');
      try {
        writeFileSync(report, '');
        const child = spawnSync(
          process.execPath,
          [
            '--import',
            hook,
            '--input-type=module',
            '-e',
            `import net from 'node:net';import tls from 'node:tls';let refused=false;try{${source}}catch{refused=true}if(!refused)process.exit(2);`,
          ],
          {
            env: {
              PATH: process.env.PATH,
              R8_PACKAGE_GUARD_REPORT: report,
              R8_PACKAGE_EXPECTED_TSX_IPC: path.join(dir, 'owned.pipe'),
            },
            encoding: 'utf8',
            timeout: 5000,
          }
        );
        assert.equal(child.status, 0);
        assert.equal(child.stderr, '');
        assert.deepEqual(
          readFileSync(report, 'utf8').trim().split('\n').map(JSON.parse),
          [{ kind }]
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  );
