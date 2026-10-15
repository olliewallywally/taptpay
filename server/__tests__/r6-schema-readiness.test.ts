import './support/test-env';
import fs from 'node:fs';
import {
  SchemaReadinessMonitor,
  READINESS_SCHEMA_DIGEST,
} from '../schema-readiness';

afterEach(() => jest.useRealTimers());
it('uses the reviewed schema digest, never a target-learned baseline', () => {
  const recorded = JSON.parse(
    fs.readFileSync(
      'docs/evidence/remediation-v2-2/r6/R6-through-0049a-fingerprint-2026-10-15.json',
      'utf8'
    )
  );
  expect(READINESS_SCHEMA_DIGEST).toBe(recorded.digest);
});
it('invalidates drift immediately, recovers after validation and expires old success', async () => {
  let now = 0;
  const check = jest
    .fn()
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false)
    .mockResolvedValue(true);
  const state = new SchemaReadinessMonitor(check, {
    clock: () => now,
    maxAgeMs: 90,
  });
  expect(state.valid()).toBe(false);
  expect(await state.refresh()).toBe(true);
  expect(state.valid()).toBe(true);
  expect(await state.refresh()).toBe(false);
  expect(state.valid()).toBe(false);
  expect(await state.refresh()).toBe(true);
  now = 90;
  expect(state.valid()).toBe(false);
  expect(await state.refresh()).toBe(true);
  state.stop();
  expect(state.valid()).toBe(false);
  expect(await state.refresh()).toBe(false);
});
it('bounds stalled refresh and does not accumulate physical checks or revive a late success', async () => {
  jest.useFakeTimers();
  let finish!: (ok: boolean) => void;
  const check = jest.fn(
    () =>
      new Promise<boolean>(r => {
        finish = r;
      })
  );
  const state = new SchemaReadinessMonitor(check, { timeoutMs: 20 }),
    first = state.refresh(),
    second = state.refresh();
  expect(second).toBe(first);
  await jest.advanceTimersByTimeAsync(20);
  expect(await first).toBe(false);
  expect(state.valid()).toBe(false);
  expect(await state.refresh()).toBe(false);
  expect(check).toHaveBeenCalledTimes(1);
  state.stop();
  let drained = false;
  const drain = state.drain().then(() => {
    drained = true;
  });
  expect(drained).toBe(false);
  finish(true);
  await drain;
  expect(state.valid()).toBe(false);
});
