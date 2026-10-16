import test from 'node:test';
import assert from 'node:assert/strict';
import {assertBrowserClean} from './verify-browser-clean.mjs';
const clean = () => ({pageErrors: [], consoleErrors: [], failed: [], pending: new Set()});
test('a required request that never answers cannot pass a browser check', async () => {
  const watch = clean(); watch.pending.add({});
  await assert.rejects(async () => assertBrowserClean(watch, {timeoutMs: 30}), /UNSETTLED_REQUIRED_REQUEST/);
});
test('requests may settle within the deadline but errors during that wait still fail', async () => {
  const watch = clean(); watch.pending.add({});
  const timer = setTimeout(() => {watch.pending.clear(); watch.pageErrors.push('synthetic late failure');}, 20);
  try {await assert.rejects(async () => assertBrowserClean(watch, {timeoutMs: 1000}), /UNEXPECTED_PAGE_ERROR/);}
  finally {clearTimeout(timer);}
});
test('a clean browser check waits for required requests to finish', async () => {
  const watch = clean(); watch.pending.add({});
  const timer = setTimeout(() => watch.pending.clear(), 20);
  try {await assertBrowserClean(watch, {timeoutMs: 1000}); assert.equal(watch.pending.size, 0);}
  finally {clearTimeout(timer);}
});
