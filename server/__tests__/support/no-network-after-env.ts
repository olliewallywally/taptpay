/**
 * R1-T1 — fails any server test that reached for the network (see
 * ./no-network.ts, which refuses and records it). Wired as a
 * `setupFilesAfterEnv` entry in jest.server.config.cjs.
 */
import { assertNoNetworkViolations, noteCurrentTest } from "./no-network";

beforeEach(() => {
  noteCurrentTest(expect.getState().currentTestName);
});

// Here, not at the refusal, because the code under test may swallow the error:
// `fetch` reports it as "fetch failed", and a route may turn that into a 502.
afterEach(() => {
  assertNoNetworkViolations();
});

// Work a test leaves running (a route that replies first and works after) can
// reach out once the test's own check has passed.
afterAll(() => {
  noteCurrentTest(undefined);
  assertNoNetworkViolations();
});
