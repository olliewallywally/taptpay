// Structural, reproducible evidence: no screenshots, HTML, text or request data.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { structuralTarget } from './accessibility-audit.mjs';

const [root, output] = process.argv.slice(2);
if (!root || !output) throw new Error('usage: summarize-r1-t10-accessibility.mjs <artifact root> <output JSON>');
const contexts = ['phone', 'tablet', 'desktop', 'desktop-short'];
const read = filename => JSON.parse(readFileSync(path.join(root, filename), 'utf8'));
const counter = values => Object.fromEntries([...new Set(values)].sort().map(v => [v, values.filter(x => x === v).length]));
const sanitizeRule = rule => ({ id: rule.id, impact: rule.impact, tags: rule.tags,
  nodes: rule.nodes.map(n => ({ target: structuralTarget(n.target), checkIds: n.checkIds })) });
const sanitizeAudit = audit => ({ engineVersion: audit.engineVersion, engineSHA256: audit.engineSHA256,
  evaluatorSHA256: audit.evaluatorSHA256, selectedRuleIds: audit.selectedRuleIds,
  experimentalRuleIds: audit.experimentalRuleIds, passedRuleIds: audit.passedRuleIds,
  violations: audit.violations.map(sanitizeRule), incomplete: audit.incomplete.map(sanitizeRule) });
const counts = cells => ({ cells: cells.length, passed: cells.filter(c => !c.audit.violations.length && !c.faults.length).length,
  runtimeFaultCells: cells.filter(c => c.faults.length).length,
  rulesByAffectedCells: counter(cells.flatMap(c => c.audit.violations.map(v => v.id))),
  nodesByRule: counter(cells.flatMap(c => c.audit.violations.flatMap(v => v.nodes.map(() => v.id)))),
  incompleteRulesByAffectedCells: counter(cells.flatMap(c => c.audit.incomplete.map(v => v.id))) });
const baseline = []; const normal = []; const tutorials = [];
const firstHarnessFile = path.join(root, 'tutorial-first-harness.ts');
const firstTutorialHarnessSHA256 = existsSync(firstHarnessFile) ? createHash('sha256').update(readFileSync(firstHarnessFile)).digest('hex') : null;
const replacedFirstCases = [];
for (const context of contexts) {
  const before = read(`baseline/${context}/results.json`);
  const after = read(`final/${context}/results.json`);
  assert.equal(before.cells.length, 51, `incomplete baseline ${context}`);
  assert.equal(after.cells.length, 51, `incomplete normal audit ${context}`);
  for (const [data, list] of [[before, baseline], [after, normal]]) {
    assert.equal(new Set(data.cells.map(c => `${c.mode}:${c.path}`)).size, 51, 'duplicate normal cells');
    for (const c of data.cells) {
      assert.equal(c.size, context);
      assert.equal(c.accessibility?.engineVersion, '4.10.3', 'missing axe execution');
      assert.ok(c.accessibility.passedRuleIds.length, 'empty axe execution');
      list.push({ size: c.size, mode: c.mode, path: c.path,
        faults: c.faults.filter(f => !f.startsWith('accessibility:')), audit: sanitizeAudit(c.accessibility) });
    }
  }
  const active = read(`tutorial-final/${context}/tutorial-accessibility-results.json`);
  assert.equal(active.expected, 22);
  assert.equal(active.cells.length, 22, `incomplete tutorial audit ${context}`);
  assert.equal(new Set(active.cells.map(c => `${c.mode}:${c.path}`)).size, 22);
  for (let c of active.cells) {
    assert.equal(c.size, context);
    let harnessSHA256 = active.harnessSHA256 ?? firstTutorialHarnessSHA256;
    assert.ok(harnessSHA256, 'missing tutorial harness provenance');
    if (!active.harnessSHA256 && context === 'phone' && c.pageKey === 'retail-nfc') {
      replacedFirstCases.push({ size:c.size, mode:c.mode, path:c.path, faults:c.faults,
        cases:c.cases.map(x=>({ action:x.action, faults:x.faults, focusReturned:x.focusReturned })) });
      const recheck = read('tutorial-nfc-recheck/tutorial-accessibility-results.json');
      assert.equal(recheck.expected, 1); assert.equal(recheck.cells.length, 1);
      assert.equal(recheck.cells[0].path, c.path); assert.equal(recheck.cells[0].size, context);
      c = recheck.cells[0]; harnessSHA256 = recheck.harnessSHA256;
    }
    tutorials.push({ size: c.size, mode: c.mode, path: c.path, pageKey: c.pageKey, faults: c.faults, harnessSHA256,
      cases: c.cases.map(x => ({ action: x.action, focusReturned: x.focusReturned,
        originKind: x.originKind ?? 'control-established-by-first-harness-assertion',
        trap: x.trap, namedDialog: x.namedDialog, visibleFocus: x.visibleFocus, faults: x.faults,
        ...(x.audit ? { audit: sanitizeAudit(x.audit) } : {}) })) });
  }
}
const standardProjection = baseline.map(c => ({ ...c, audit: { ...c.audit,
  violations: c.audit.violations.filter(v => !v.tags.includes('experimental')),
  incomplete: c.audit.incomplete.filter(v => !v.tags.includes('experimental')) } }));
const experimentalCandidates = baseline.flatMap(c => c.audit.violations.filter(v => v.tags.includes('experimental')).map(v => ({ size:c.size, mode:c.mode, path:c.path, ...v })));
const activeAudits = tutorials.flatMap(c => c.cases.filter(x => x.audit).map(x => ({ size:c.size, mode:c.mode, path:c.path, faults:c.faults, audit:x.audit })));
const interactions = tutorials.flatMap(c => c.cases);
const trialPass = x => x.focusReturned && x.trap && x.namedDialog && x.visibleFocus && !x.faults.length;
const prior = existsSync(path.join(root, 'first-candidate-summary.json')) ? read('first-candidate-summary.json') : null;
const result = {
  schemaVersion: 1, base: '9e46250bdd62dc62227a4f420862344ce0d47a58',
  applicationBuild: (({treeSHA256,indexSHA256,files}) => ({treeSHA256,indexSHA256,files:Object.keys(files).length}))(read('verified-build-manifest.json')),
  harnessSHA256: Object.fromEntries(['scripts/accessibility-audit.mjs','scripts/verify-r1-t10-device-matrix.ts','scripts/verify-r1-t10-tutorial-accessibility.ts','scripts/verify-accessibility-audit.mjs', 'scripts/summarize-r1-t10-accessibility.mjs'].map(f => [f,createHash('sha256').update(readFileSync(f)).digest('hex')])),
  baseline: { originalRun:counts(baseline), standardProjection:counts(standardProjection),
    projectionNote:'Classification of the retained original run, not a rerun or retroactive passing exit status.',
    experimentalCandidates },
  firstCandidateHistory: prior ? { applicationBuild: prior.applicationBuild, normal:prior.normal.summary,
    interactions:prior.activeTutorials.interactions,
    runtimeFaults:prior.normal.cells.filter(c=>c.faults.length).map(c=>({size:c.size,path:c.path,faults:c.faults})),
    interactionFaults:prior.activeTutorials.cells.filter(c=>c.faults.length).map(c=>({size:c.size,path:c.path,faults:c.faults})),
    fixtureFaults:prior.activeTutorials.replacedFirstCases,
    reportSHA256:createHash('sha256').update(readFileSync(path.join(root,'first-candidate-summary.json'))).digest('hex') } : null,
  normal: { summary:counts(normal), cells:normal },
  activeTutorials: { summary:counts(activeAudits), expectedCells:88, cells: tutorials,
    recheckNote:replacedFirstCases.length ? 'The first full matrix is retained. Only phone NFC was rechecked after correcting the absent-trigger fixture; same application build, distinct per-cell harness hashes.' : 'Fresh complete matrix on the final build; the earlier candidate and NFC fixture failure remain retained separately.',
    replacedFirstCases,
    interactions:{expected:176, observed:interactions.length, passed:interactions.filter(trialPass).length,
      documentOrigins:interactions.filter(x=>x.originKind==='document').length,
      faultCells:tutorials.filter(c=>c.faults.length || c.cases.length!==2 || c.cases.some(x=>!trialPass(x))).length} },
  remainingGates:['Automated violations and incomplete checks','Representative non-tutorial dialogs/alerts and keyboard flows','Actual 200% browser zoom/reflow','Reduced-motion/contrast/approved touch geometry','Manual keyboard/screen-reader and owner golden acceptance','Final independent implementation review'],
};
writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({baseline:result.baseline.originalRun,standardProjection:result.baseline.standardProjection,normal:result.normal.summary,active:result.activeTutorials.summary,interactions:result.activeTutorials.interactions},null,2));
