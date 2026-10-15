import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { artifactFiles, verifyArtifacts } from './verify-r7-artifacts.mjs';
test('exact snapshots pass; changed and stale/malicious files fail', async () => {
  const root = await mkdtemp(join(tmpdir(), 'r7-artifacts-')),
    build = join(root, 'build'),
    snapshot = join(root, 'snapshot');
  try {
    await mkdir(build);
    await writeFile(
      join(build, 'index.html'),
      '<script src="/main.js"></script>'
    );
    await writeFile(join(build, 'main.js'), 'console.log("synthetic")');
    await cp(build, snapshot, { recursive: true });
    await cp(snapshot, join(build, 'app'), { recursive: true });
    assert.equal((await verifyArtifacts({ build, snapshot })).webFiles, 2);
    await writeFile(join(build, 'app', 'main.js'), 'stale served copy');
    await assert.rejects(
      verifyArtifacts({ build, snapshot }),
      /SERVED_SNAPSHOT_NOT_SOURCE_BUILD/
    );
    await cp(snapshot, join(build, 'app'), { recursive: true });
    await writeFile(join(snapshot, 'main.js'), 'changed');
    await assert.rejects(
      verifyArtifacts({ build, snapshot }),
      /SNAPSHOT_NOT_SOURCE_BUILD/
    );
    await writeFile(join(snapshot, 'main.js'), 'const token="SIM_TOKEN_stale"');
    await assert.rejects(
      artifactFiles(snapshot),
      /UNSUPPORTED_PAYMENT_ARTIFACT/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('native config cannot broaden navigation even when assets match', async () => {
  const root = await mkdtemp(join(tmpdir(), 'r7-native-')),
    build = join(root, 'build'),
    snapshot = join(root, 'snapshot'),
    native = join(root, 'native'),
    nativeConfig = join(root, 'config.json');
  try {
    await mkdir(build);
    await writeFile(join(build, 'index.html'), '<title>Synthetic</title>');
    await cp(build, snapshot, { recursive: true });
    await cp(snapshot, join(build, 'app'), { recursive: true });
    await cp(build, native, { recursive: true });
    // Capacitor CLI creates exactly these empty compatibility placeholders.
    for (const name of ['cordova.js', 'cordova_plugins.js'])
      await writeFile(join(native, name), '');
    const config = {
      server: {
        url: 'https://taptpay.co.nz/app-login',
        cleartext: false,
        allowNavigation: ['appleid.apple.com', 'sec.windcave.com'],
      },
    };
    await writeFile(nativeConfig, JSON.stringify(config));
    assert.equal(
      (await verifyArtifacts({ build, snapshot, native, nativeConfig }))
        .nativeChecked,
      true
    );
    await writeFile(join(native, 'cordova.js'), 'unexpected executable bridge');
    await assert.rejects(
      verifyArtifacts({ build, snapshot, native, nativeConfig }),
      /NATIVE_NOT_SOURCE_BUILD/
    );
    await writeFile(join(native, 'cordova.js'), '');
    await writeFile(join(native, 'unexpected.js'), 'console.log("extra")');
    await assert.rejects(
      verifyArtifacts({ build, snapshot, native, nativeConfig }),
      /NATIVE_NOT_SOURCE_BUILD/
    );
    await rm(join(native, 'unexpected.js'));
    config.server.allowNavigation = ['*.replit.app'];
    await writeFile(nativeConfig, JSON.stringify(config));
    await assert.rejects(
      verifyArtifacts({ build, snapshot, native, nativeConfig })
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
