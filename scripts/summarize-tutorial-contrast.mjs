import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tutorialStepsForDevice } from '../client/src/features/tutorial/tutorial-registry.ts';
import { structuralTarget } from './accessibility-audit.mjs';
import { TUTORIAL_CONTRAST_PROBE_SHA256 } from './tutorial-contrast.mjs';

const [root, priorReport, output] = process.argv.slice(2);
if (!root || !priorReport || !output || process.argv.length !== 5) throw new Error('usage: node --import tsx scripts/summarize-tutorial-contrast.mjs <artifact root> <prior summary.json> <output.json>');
const hash = data => createHash('sha256').update(data).digest('hex');
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const manifest = read(path.join(root, 'build-manifest.json'));
assert.equal(hash(JSON.stringify(Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)))), manifest.treeSHA256);
assert.equal(manifest.indexSHA256, manifest.files['index.html']);
for (const [file, digest] of Object.entries(manifest.files)) assert.equal(hash(readFileSync(path.join(manifest.buildDir, file))), digest, `immutable build changed: ${file}`);
for (const [file, digest] of Object.entries({ ...manifest.clientSource, ...manifest.scripts })) assert.equal(hash(readFileSync(file)), digest, `verified source changed: ${file}`);
const prior = read(priorReport);
const contexts = ['phone', 'tablet', 'desktop', 'desktop-short'];
const identity = cell => `${cell.size}:${cell.mode}:${cell.path}`;
const rawHashes = {};
const readArtifact = relative => {
  const file = path.join(root, relative);
  rawHashes[relative] = hash(readFileSync(file));
  return read(file);
};
const audit = report => {
  assert.equal(report?.engineVersion, '4.10.3');
  assert.ok(report.selectedRuleIds.length && report.passedRuleIds.length);
  assert.ok(report.selectedRuleIds.includes('aria-dialog-name'));
  assert.ok(report.selectedRuleIds.includes('target-size'));
  assert.ok(!report.selectedRuleIds.some(id => report.experimentalRuleIds.includes(id)));
  const rules = items => items.map(rule => ({ id: rule.id, impact: rule.impact, tags: rule.tags, nodes: rule.nodes.map(node => ({ target: structuralTarget(node.target), checkIds: node.checkIds })) }));
  return { engineVersion: report.engineVersion, engineSHA256: report.engineSHA256, evaluatorSHA256: report.evaluatorSHA256, selectedRuleIds: report.selectedRuleIds, experimentalRuleIds: report.experimentalRuleIds, passedRuleIds: report.passedRuleIds, violations: rules(report.violations), incomplete: rules(report.incomplete) };
};
const aggregate = cells => {
  const counts = field => {
    const byRule = {};
    for (const cell of cells) for (const rule of cell.audit[field]) {
      const count = byRule[rule.id] ??= { affectedCells: 0, repeatedNodes: 0 };
      count.affectedCells++; count.repeatedNodes += rule.nodes.length;
    }
    return byRule;
  };
  return { expected: cells.length, passed: cells.filter(c => !c.audit.violations.length).length, failed: cells.filter(c => c.audit.violations.length).length, violations: counts('violations'), incomplete: counts('incomplete') };
};
const normal = [], active = [], baseline = [], statuses = {};
let steps = 0, measurements = 0;
const ratios = {};
for (const context of contexts) {
  const normalReport = readArtifact(`normal/${context}/results.json`);
  assert.equal(normalReport.cells.length, 51);
  for (const cell of normalReport.cells) {
    assert.equal(cell.size, context);
    assert.ok(cell.faults.every(f => f.startsWith('accessibility:')), `non-accessibility normal fault: ${identity(cell)}`);
    normal.push({ size: cell.size, mode: cell.mode, path: cell.path, faults: cell.faults, sent: cell.sent, routes: cell.routes, audit: audit(cell.accessibility) });
  }
  const report = readArtifact(`active/${context}/tutorial-accessibility-results.json`);
  assert.equal(report.expected, 22); assert.equal(report.cells.length, 22);
  assert.equal(report.contrastProbeSHA256, TUTORIAL_CONTRAST_PROBE_SHA256);
  assert.equal(report.harnessSHA256, manifest.scripts['scripts/verify-r1-t10-tutorial-accessibility.ts']);
  for (const cell of report.cells) {
    assert.equal(cell.size, context); assert.deepEqual(cell.faults, []);
    assert.deepEqual(cell.cases.map(c => c.action), ['escape', 'complete']);
    for (const trial of cell.cases) {
      assert.deepEqual(trial.faults, []);
      for (const field of ['focusReturned', 'trap', 'visibleFocus', 'namedDialog']) assert.equal(trial[field], true, `${identity(cell)} ${field}`);
      assert.equal(trial.originKind, cell.size === 'phone' && cell.pageKey === 'retail-nfc' ? 'document' : 'control');
      const expectedSteps = trial.action === 'escape' ? 1 : tutorialStepsForDevice(cell.pageKey, context === 'phone' ? 'mobile' : context === 'tablet' ? 'tablet' : 'desktop').length;
      assert.equal(trial.contrast.length, expectedSteps);
      assert.deepEqual(trial.contrast.map(s => s.step), Array.from({ length: expectedSteps }, (_, i) => i));
      for (const sample of trial.contrast) {
        steps++;
        for (const focus of ['next', 'close']) {
          assert.equal(sample[focus].checks.length, 3);
          assert.deepEqual(sample[focus].checks.map(c => c.selector), ['.tutorial-eyebrow', '.tutorial-footer > span', `.tutorial-${focus}`]);
          for (const check of sample[focus].checks) {
            measurements++;
            assert.equal(check.minimum, check.kind === 'text' ? 4.5 : 3);
            assert.equal(check.pass, true, `${identity(cell)} shared tutorial contrast`);
            assert.ok(check.ratio >= check.minimum);
            if (check.kind === 'focus') { assert.equal(check.onCard, true); assert.ok(check.outlineWidth >= 2 && check.outlineOffset >= 0 && check.outlineStyle !== 'none'); }
            const count = ratios[check.selector] ??= { minimumObserved: Infinity, maximumObserved: 0, measurements: 0 };
            count.minimumObserved = Math.min(count.minimumObserved, check.ratio); count.maximumObserved = Math.max(count.maximumObserved, check.ratio); count.measurements++;
          }
        }
      }
    }
    active.push({ ...cell, audit: audit(cell.cases[0].audit), cases: cell.cases.map(({ audit: omitted, ...trial }) => trial), harnessSHA256: report.harnessSHA256, contrastProbeSHA256: report.contrastProbeSHA256 });
  }
  const before = readArtifact(`baseline/${context}/tutorial-accessibility-results.json`);
  assert.equal(before.expected, 1); assert.equal(before.cells.length, 1);
  assert.equal(before.contrastProbeSHA256, report.contrastProbeSHA256); assert.equal(before.harnessSHA256, report.harnessSHA256);
  const oldCell = before.cells[0], newCell = active.find(c => identity(c) === identity(oldCell));
  assert.ok(newCell); assert.deepEqual(oldCell.faults, []);
  let failedMeasurements = 0, matchingGeometry = 0;
  for (const trial of oldCell.cases) {
    assert.deepEqual(trial.faults, []); assert.equal(trial.focusReturned, true);
    const updated = newCell.cases.find(c => c.action === trial.action);
    assert.equal(trial.contrast.length, updated.contrast.length);
    for (const [i, sample] of trial.contrast.entries()) for (const focus of ['next', 'close']) {
      assert.deepEqual(sample[focus].card, updated.contrast[i][focus].card);
      assert.deepEqual(sample[focus].checks.map(c => c.rect), updated.contrast[i][focus].checks.map(c => c.rect));
      matchingGeometry++;
      assert.ok(sample[focus].checks.every(c => !c.pass));
      failedMeasurements += sample[focus].checks.length;
    }
  }
  baseline.push({ ...oldCell, audit: audit(oldCell.cases[0].audit), cases: oldCell.cases.map(({ audit: omitted, ...trial }) => trial), failedMeasurements, matchingGeometry });
  statuses[context] = readArtifact(`status-${context}.json`);
  assert.equal(statuses[context].baselineExitCode, 1);
  assert.equal(statuses[context].normalExitCode, normalReport.cells.some(c => c.faults.length) ? 1 : 0);
  assert.equal(statuses[context].activeExitCode, report.cells.some(c => c.cases[0].audit.violations.length) ? 1 : 0);
}
assert.equal(new Set(normal.map(identity)).size, 204); assert.equal(new Set(active.map(identity)).size, 88);
assert.equal(new Set(active.map(c => c.pageKey)).size, 20);
assert.deepEqual(normal.map(identity).sort(), prior.normal.cells.map(identity).sort());
assert.deepEqual(active.map(identity).sort(), prior.activeTutorials.cells.map(identity).sort());
const fixtureBefore = readArtifact('css-before.json'), fixtureAfter = readArtifact('css-after-settled.json');
assert.equal(fixtureBefore.probeSHA256, TUTORIAL_CONTRAST_PROBE_SHA256); assert.equal(fixtureAfter.probeSHA256, TUTORIAL_CONTRAST_PROBE_SHA256);
for (const [i, before] of fixtureBefore.results.entries()) {
  const after = fixtureAfter.results[i]; assert.ok(before.faults.length); assert.deepEqual(after.faults, []);
  assert.ok(Object.values(before.negativeControls).every(Boolean)); assert.ok(Object.values(after.negativeControls).every(Boolean));
  for (const focus of ['next', 'close']) {
    assert.deepEqual(before[focus].card, after[focus].card);
    assert.deepEqual(before[focus].checks.map(c => c.rect), after[focus].checks.map(c => c.rect));
  }
}
assert.equal(fixtureBefore.results.length, 4); assert.equal(fixtureAfter.results.length, 4);
const firstManifest = readArtifact('build-manifest-first.json');
assert.equal(firstManifest.treeSHA256, manifest.treeSHA256);
assert.equal(firstManifest.indexSHA256, manifest.indexSHA256);
assert.equal(firstManifest.scripts['scripts/verify-r1-t10-device-matrix.ts'], manifest.scripts['scripts/verify-r1-t10-device-matrix.ts']);
assert.equal(firstManifest.scripts['scripts/accessibility-audit.mjs'], manifest.scripts['scripts/accessibility-audit.mjs']);
const firstCells = contexts.flatMap(context => {
  const report = readArtifact(`active-first/${context}/tutorial-accessibility-results.json`);
  assert.equal(report.expected, 22); assert.equal(report.cells.length, 22);
  assert.equal(report.harnessSHA256, firstManifest.scripts['scripts/verify-r1-t10-tutorial-accessibility.ts']);
  return report.cells;
});
const recurringRechecks = ['old', 'new'].map(build => {
  const report = readArtifact(`recurring-recheck/${build}/results.json`);
  assert.equal(report.cells.length, 1);
  const cell = report.cells[0];
  assert.equal(cell.path, '/trades/recurring'); assert.equal(cell.size, 'phone');
  assert.ok(cell.faults.every(f => f.startsWith('accessibility:')));
  assert.ok(cell.accessibility.violations.some(v => v.id === 'target-size'));
  return { build, size: cell.size, mode: cell.mode, path: cell.path, faults: cell.faults, audit: audit(cell.accessibility) };
});
assert.deepEqual(recurringRechecks[0].audit.violations, recurringRechecks[1].audit.violations);
const interactions = active.flatMap(c => c.cases);
assert.equal(interactions.length, 176);
const summary = { schemaVersion: 1, base: manifest.base, applicationBuild: { manifestSHA256: hash(readFileSync(path.join(root, 'build-manifest.json'))), treeSHA256: manifest.treeSHA256, indexSHA256: manifest.indexSHA256, files: Object.keys(manifest.files).length, clientSource: manifest.clientSource, changedClientFiles: manifest.changedClientFiles, scripts: manifest.scripts }, rawHashes, statuses,
  priorCheckpoint: { reportSHA256: hash(readFileSync(priorReport)), normal: prior.normal.summary, active: prior.activeTutorials.summary }, baseline, fixtureBefore, fixtureAfter,
  firstCandidateHistory: { applicationTreeSHA256: firstManifest.treeSHA256, scripts: firstManifest.scripts, cells: firstCells.length, completedKeyboardCases: firstCells.flatMap(c => c.cases).filter(t => t.focusReturned && !t.faults.length).length, failures: firstCells.filter(c => c.faults.length || c.cases.some(t => t.faults.length)).map(c => ({ size: c.size, mode: c.mode, path: c.path, faults: c.faults, cases: c.cases.map(t => ({ action: t.action, focusReturned: t.focusReturned, faults: t.faults, contrastSamples: t.contrast.length })) })), note: 'One completion probe observed changing ancestor rendering after a separate wait. Retained first run; final sampler waits and measures atomically for both controls, with the same 10-second bound and no forced focus. Normal source/evaluator and application build are unchanged.' }, recurringRechecks,
  normal: { summary: aggregate(normal), cells: normal }, activeTutorials: { summary: aggregate(active), interactions: { expected: 176, passed: interactions.length, realControlOrigins: interactions.filter(c => c.originKind === 'control').length, documentOrigins: interactions.filter(c => c.originKind === 'document').length }, sharedContrast: { settledStepSamples: steps, repeatedMeasurements: measurements, ratios }, cells: active },
  remainingGates: ['Whole-page contrast and target-size violations', 'Incomplete and experimental/manual checks', 'Other dialogs, whole-surface keyboard and alert flows', 'Actual 200% browser/text zoom and reduced motion', 'Screen readers and real/native devices', 'Owner visual/golden acceptance', 'Final independent implementation review', 'T10e/T10f/R1/release acceptance'] };
writeFileSync(output, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ normal: summary.normal.summary, active: summary.activeTutorials.summary, interactions: summary.activeTutorials.interactions, sharedContrast: summary.activeTutorials.sharedContrast, baselineFailedMeasurements: baseline.reduce((n,c) => n+c.failedMeasurements,0), identicalGeometrySamples: baseline.reduce((n,c) => n+c.matchingGeometry,0), outputSHA256: hash(readFileSync(output)) }, null, 2));
