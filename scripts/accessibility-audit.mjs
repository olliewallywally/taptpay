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

export async function accessibilityEvaluation(diagnostics = false) {
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
  const describe = (node) => {
    if (!diagnostics) return {};
    // Use the unsanitized selector only inside the browser. Never return its
    // attribute values, node text/HTML or arbitrary check data to the runner.
    let el;
    try { el = document.querySelector(node.target[0]); } catch { /* shadow/frame nodes need manual assessment */ }
    if (!el) return { diagnostic: { resolved: false } };
    const style = getComputedStyle(el), r = el.getBoundingClientRect();
    const backgrounds = [];
    for (let parent = el; parent && backgrounds.length < 8; parent = parent.parentElement) {
      const s = getComputedStyle(parent);
      backgrounds.push({ tag: parent.tagName.toLowerCase(), classes: [...parent.classList], color: s.backgroundColor, image: s.backgroundImage === 'none' ? 'none' : 'present', opacity: Number(s.opacity) });
    }
    const contrast = [...node.any, ...node.all, ...node.none].filter(check => check.id === 'color-contrast').map(check => {
      const data = check.data ?? {}, safe = {};
      for (const key of ['contrastRatio', 'expectedContrastRatio', 'isSmallText']) if (typeof data[key] === 'number' || typeof data[key] === 'boolean') safe[key] = data[key];
      for (const key of ['fgColor', 'bgColor', 'fontSize', 'fontWeight']) if (typeof data[key] === 'string' && /^(#[\da-f]+|rgba?\([\d.,%\s]+\)|[\d.]+(?:pt|px)?(?: \([\d.]+px\))?)$/i.test(data[key])) safe[key] = data[key];
      return safe;
    });
    return { diagnostic: { resolved: true, tag: el.tagName.toLowerCase(), classes: [...el.classList],
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      style: { color: style.color, backgroundColor: style.backgroundColor, fontSize: style.fontSize, fontWeight: style.fontWeight, opacity: Number(style.opacity), lineHeight: style.lineHeight }, backgrounds, contrast } };
  };
  const structural = (rule) => ({
    id: rule.id, impact: rule.impact, tags: rule.tags,
    nodes: rule.nodes.map(node => ({ target: node.target, checkIds: [...node.any, ...node.all, ...node.none].map(check => check.id), ...describe(node) })),
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

export async function auditAccessibility(page, { diagnostics = false } = {}) {
  // DevTools evaluation injects the engine without relaxing the app's CSP or
  // introducing an inline script element/network request into the real page.
  await page.evaluate(`${engine}; void 0;`);
  const result = await page.evaluate(`(${accessibilityEvaluation.toString()})(${diagnostics ? 'true' : 'false'})`);
  for (const rule of [...result.violations, ...result.incomplete]) {
    for (const node of rule.nodes) node.target = structuralTarget(node.target);
  }
  return { ...result, evaluatorSHA256: ACCESSIBILITY_EVALUATOR_SHA256, engineSHA256: AXE_ENGINE_SHA256 };
}
