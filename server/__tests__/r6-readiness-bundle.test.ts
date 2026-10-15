import './support/test-env';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildSync } from 'esbuild';

it('bundled readiness imports only pure catalog logic and cannot invoke the operator CLI', () => {
  const folder = fs.mkdtempSync(
    path.join(process.cwd(), 'node_modules/.r6-readiness-bundle-')
  );
  try {
    const outfile = path.join(folder, 'bundle.mjs');
    buildSync({
      stdin: {
        contents: `import {verifyReadinessSchema} from './server/schema-readiness.ts';
      await verifyReadinessSchema({connect:async()=>{throw Error('explicit_nonconnecting_pool');}}).catch(()=>undefined);
      console.log('BUNDLED_READINESS_LOADED');`,
        resolveDir: process.cwd(),
        loader: 'ts',
      },
      outfile,
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
      logLevel: 'silent',
    });
    const result = spawnSync(process.execPath, [outfile], {
      cwd: process.cwd(),
      env: { APP_ENV: 'test', ENV_VALIDATION_MODE: 'audit' },
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect({
      status: result.status,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    }).toEqual({ status: 0, stdout: 'BUNDLED_READINESS_LOADED', stderr: '' });
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
