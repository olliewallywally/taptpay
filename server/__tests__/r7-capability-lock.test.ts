import './support/test-env';
import fs from 'node:fs';
import nativeConfig from '../../capacitor.config';
import { loadConfig } from '../config';
test('D13 cannot be enabled with a bare feature flag even in the test environment', () => {
  expect(() =>
    loadConfig({ ...process.env, FEATURE_TAP_TO_PAY: 'true' })
  ).toThrow(/FEATURE_TAP_TO_PAY/);
});
test('native navigation retains only the own origin and existing cookie-bound Apple sign-in host', () => {
  expect(nativeConfig.server?.url).toBe('https://taptpay.co.nz/app-login');
  expect(nativeConfig.server?.cleartext).toBe(false);
  expect(nativeConfig.server?.allowNavigation).toEqual(['appleid.apple.com']);
});
test('no unsupported bridge, simulated native implementation or placeholder wallet consumer remains', () => {
  for (const p of [
    'client/src/plugins/TaptPayPlugin.ts',
    'src/plugins/TapToPayPlugin.swift',
    'client/src/components/native-payment-buttons.tsx',
    'client/src/components/digital-wallet-buttons.tsx',
  ])
    expect(fs.existsSync(p)).toBe(false);
  for (const p of [
    'client/src/pages/merchant-terminal.tsx',
    'client/src/pages/merchant-terminal-mobile.tsx',
    'client/src/pages/merchant-terminal-mobile-v2.tsx',
  ]) {
    const source = fs.readFileSync(p, 'utf8');
    expect(source).not.toMatch(
      /SIM_TOKEN_|window\.TaptPay|nfc-sessions\/.+complete|api\/merchants\/.*nfc-pay/
    );
  }
});
