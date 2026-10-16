import test from 'node:test';
import assert from 'node:assert/strict';
import {ESLint} from 'eslint';
import {newFindings} from './verify-lint.mjs';
const lint = new ESLint();
test('TypeScript type names are handled by its parser and tsc, not JS no-undef', async () => {
  const [result] = await lint.lintText('interface Merchant { id: number }\nexport const id = (m: Merchant): number => m.id;\n', {filePath: 'shared/r8-lint-probe.ts'});
  assert.deepEqual(result.messages.filter(m => m.severity === 2), []);
});
test('JavaScript undefined names remain errors', async () => {
  const [result] = await lint.lintText('export const id = unboundMerchant.id;\n', {filePath: 'scripts/r8-lint-probe.mjs'});
  assert.ok(result.messages.some(m => m.ruleId === 'no-undef' && m.severity === 2));
});
test('conditional React hooks remain errors', async () => {
  const [result] = await lint.lintText('import {useState} from "react";\nexport function Probe({on}: {on: boolean}) { if (on) useState(0); return null; }', {filePath: 'client/src/r8-lint-probe.tsx'});
  assert.ok(result.messages.some(m => m.ruleId === 'react-hooks/rules-of-hooks' && m.severity === 2));
});
test('Jest globals are available only in test files', async () => {
  const source = 'test("probe", () => { expect(1).toBe(1); });';
  const [inside] = await lint.lintText(source, {filePath: 'client/src/__tests__/r8-lint-probe.test.js'});
  assert.deepEqual(inside.messages.filter(m => m.severity === 2), []);
  const [outside] = await lint.lintText(source, {filePath: 'client/src/r8-lint-probe.js'});
  assert.ok(outside.messages.some(m => m.ruleId === 'no-undef'));
});
test('the lint baseline cannot hide another occurrence or a changed finding', () => {
  const row = {file: 'a.ts', rule: 'no-empty', digest: 'a'};
  assert.equal(newFindings([row], [row]).length, 0);
  assert.equal(newFindings([row, row], [row]).length, 1);
  assert.equal(newFindings([{...row, digest: 'b'}], [row]).length, 1);
  assert.equal(newFindings([{...row, file: 'b.ts'}], [row]).length, 1);
});
