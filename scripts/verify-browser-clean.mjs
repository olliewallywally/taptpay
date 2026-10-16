import assert from 'node:assert/strict';
/** @param {{pageErrors: unknown[], consoleErrors: unknown[], failed: unknown[], pending: Set<unknown>}} watch */
export async function assertBrowserClean(watch, {timeoutMs = 5000} = {}) {
  const until = performance.now() + timeoutMs;
  while (watch.pending.size && performance.now() < until)
    await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(watch.pending.size, 0, 'UNSETTLED_REQUIRED_REQUEST');
  assert.deepEqual(watch.pageErrors, [], 'UNEXPECTED_PAGE_ERROR');
  assert.deepEqual(watch.consoleErrors, [], 'UNEXPECTED_CONSOLE_ERROR');
  assert.deepEqual(watch.failed, [], 'UNEXPECTED_FAILED_REQUEST');
}
