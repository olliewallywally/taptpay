// Real browser axe evaluation. Persist rule/selector metadata, never node HTML,
// accessible text, input values, failure summaries or session/customer payloads.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const engine = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
export const AXE_ENGINE_SHA256 = createHash('sha256').update(engine).digest('hex');

// CSS selectors may contain customer text in attribute values. Retain only the
// attribute's presence, respecting escaped characters and quoted closing brackets.
export function structuralTarget(target) {
  if (Array.isArray(target)) return target.map(structuralTarget);
  return target.replace(/\[((?:\\.|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\]"'\\])*)\]/g,
    (_match, attribute) => `[${attribute.match(/^\s*([\w:-]+)/)?.[1] ?? 'redacted'}]`);
}

export async function accessibilityEvaluation() {
  if (!window.axe?.run) throw new Error('accessibility engine did not load');
  await document.fonts.ready;
  // Axe classifies dialog names as best practice rather than a WCAG tag.
  // Include that specific requirement explicitly instead of silently omitting it.
  const candidates = window.axe.getRules(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
  // Match axe's standard tag preset: experimental rules require separate human
  // assessment. Explicit rule selection would otherwise enable those heuristics.
  const rules = candidates.filter(rule => !rule.tags.includes('experimental')).map(rule => rule.ruleId);
  rules.push('aria-dialog-name');
  const result = await window.axe.run(document, {
    runOnly: { type: 'rule', values: rules },
    rules: { 'target-size': { enabled: true } },
    resultTypes: ['violations', 'incomplete', 'passes'],
  });
  if (!result.passes.length && !result.violations.length && !result.incomplete.length) throw new Error('accessibility engine ran no checks');
  const structural = (rule) => ({
    id: rule.id, impact: rule.impact, tags: rule.tags,
    nodes: rule.nodes.map(node => ({ target: node.target, checkIds: [...node.any, ...node.all, ...node.none].map(check => check.id) })),
  });
  return {
    engineVersion: result.testEngine.version,
    selectedRuleIds: rules,
    experimentalRuleIds: candidates.filter(rule => rule.tags.includes('experimental')).map(rule => rule.ruleId),
    violations: result.violations.map(structural), incomplete: result.incomplete.map(structural),
    passedRuleIds: result.passes.map(rule => rule.id).sort(),
  };
}

export const ACCESSIBILITY_EVALUATOR_SHA256 = createHash('sha256').update(accessibilityEvaluation.toString()).digest('hex');

export async function auditAccessibility(page) {
  // DevTools evaluation injects the engine without relaxing the app's CSP or
  // introducing an inline script element/network request into the real page.
  await page.evaluate(`${engine}; void 0;`);
  const result = await page.evaluate(`(${accessibilityEvaluation.toString()})()`);
  for (const rule of [...result.violations, ...result.incomplete]) {
    for (const node of rule.nodes) node.target = structuralTarget(node.target);
  }
  return { ...result, evaluatorSHA256: ACCESSIBILITY_EVALUATOR_SHA256, engineSHA256: AXE_ENGINE_SHA256 };
}
