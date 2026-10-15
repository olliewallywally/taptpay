/** Read-only integrity checks for the source-built web/native release candidate. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, lstat } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
export async function artifactFiles(directory, { excludeApp = false } = {}) {
  const root = resolve(directory),
    files = {};
  assert.ok((await lstat(root)).isDirectory(), 'ARTIFACT_ROOT_NOT_DIRECTORY');
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (excludeApp && path === root && entry.name === 'app') continue;
      const full = join(path, entry.name);
      assert.equal(
        (await lstat(full)).isSymbolicLink(),
        false,
        'ARTIFACT_SYMLINK'
      );
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const bytes = await readFile(full),
          name = relative(root, full).replaceAll('\\', '/');
        if (/\.(?:js|html)$/.test(name))
          assert.ok(
            !/SIM_TOKEN_|STUB_TOKEN_|window\.TaptPay/.test(
              bytes.toString('utf8')
            ),
            'UNSUPPORTED_PAYMENT_ARTIFACT'
          );
        files[name] = createHash('sha256').update(bytes).digest('hex');
      } else throw Error('ARTIFACT_NOT_REGULAR');
    }
  }
  await walk(root);
  assert.ok(files['index.html'], 'ARTIFACT_INDEX_MISSING');
  return Object.fromEntries(
    Object.entries(files).sort(([a], [b]) => a.localeCompare(b))
  );
}
export async function verifyArtifacts({
  build,
  snapshot,
  native,
  nativeConfig,
}) {
  const expected = await artifactFiles(build, { excludeApp: true }),
    actual = await artifactFiles(snapshot);
  assert.deepEqual(actual, expected, 'SNAPSHOT_NOT_SOURCE_BUILD');
  assert.deepEqual(
    await artifactFiles(join(build, 'app')),
    expected,
    'SERVED_SNAPSHOT_NOT_SOURCE_BUILD'
  );
  if (native) {
    // @capacitor/cli createEmptyCordovaJS adds only these zero-byte files.
    // Require their exact contents; never ignore arbitrary native additions.
    const emptySha256 = createHash('sha256').update('').digest('hex');
    assert.deepEqual(
      await artifactFiles(native),
      {
        ...(await artifactFiles(build)),
        'cordova.js': emptySha256,
        'cordova_plugins.js': emptySha256,
      },
      'NATIVE_NOT_SOURCE_BUILD'
    );
    const config = JSON.parse(await readFile(nativeConfig, 'utf8'));
    assert.equal(config.server.url, 'https://taptpay.co.nz/app-login');
    assert.equal(config.server.cleartext, false);
    assert.deepEqual(config.server.allowNavigation, ['appleid.apple.com', 'sec.windcave.com']);
  }
  return {
    webFiles: Object.keys(expected).length,
    nativeChecked: !!native,
    unsupportedPaymentMarkers: 0,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    assert.ok(
      args.length === 0 || (args.length === 1 && args[0] === '--native'),
      'INVALID_ARTIFACT_ARGUMENTS'
    );
    const report = await verifyArtifacts({
      build: 'dist/public',
      snapshot: 'client/public/app',
      ...(args.length
        ? {
            native: 'ios/App/App/public',
            nativeConfig: 'ios/App/App/capacitor.config.json',
          }
        : {}),
    });
    console.log(JSON.stringify(report));
  } catch {
    console.error('R7_ARTIFACT_VERIFICATION_FAILED');
    process.exitCode = 1;
  }
}
