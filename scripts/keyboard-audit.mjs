// Read-only real Tab traversal. Reports structural/numeric facts, never names,
// text, input values or business actions. Normal matrix pages remain isolated.
import { createHash } from 'node:crypto';

export function focusEvaluation() {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return { document: true };
  const state = window.__keyboardAudit;
  if (!state) throw new Error('keyboard probe not initialized');
  if (!state.ids.has(el)) state.ids.set(el, ++state.next);
  const r = el.getBoundingClientRect(), s = getComputedStyle(el);
  let opacity = Number(s.opacity);
  let left = Math.max(0, r.left), top = Math.max(0, r.top), right = Math.min(innerWidth, r.right), bottom = Math.min(innerHeight, r.bottom);
  for (let p = el.parentElement; p; p = p.parentElement) {
    const ps = getComputedStyle(p), pr = p.getBoundingClientRect();
    opacity *= Number(ps.opacity);
    if (/(hidden|clip|auto|scroll)/.test(ps.overflowX)) { left = Math.max(left, pr.left); right = Math.min(right, pr.right); }
    if (/(hidden|clip|auto|scroll)/.test(ps.overflowY)) { top = Math.max(top, pr.top); bottom = Math.min(bottom, pr.bottom); }
  }
  // Inline links can wrap into disjoint painted rectangles. Their bounding
  // union contains blank space; use a painted fragment for the hit sample.
  const fragments = [...el.getClientRects()].map(f => ({ left: Math.max(left, f.left), top: Math.max(top, f.top), right: Math.min(right, f.right), bottom: Math.min(bottom, f.bottom) }))
    .filter(f => f.right > f.left && f.bottom > f.top).sort((a, b) => (b.right - b.left) * (b.bottom - b.top) - (a.right - a.left) * (a.bottom - a.top));
  if (fragments[0]) ({ left, top, right, bottom } = fragments[0]);
  const visible = right - left > 1 && bottom - top > 1 && s.visibility === 'visible' && opacity > 0 && !el.closest('[inert],[aria-hidden="true"]');
  const hit = visible && document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
  const before = state.styles.get(el);
  const indicator = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 1
    || s.boxShadow !== 'none' && (!before || before.shadow !== s.boxShadow)
    || before && (before.border !== s.borderColor || before.background !== s.backgroundColor);
  return { document: false, id: state.ids.get(el), tag: el.tagName.toLowerCase(), type: el.tagName === 'INPUT' ? el.type : undefined, classes: [...el.classList],
    visible: !!visible, hit: !!hit && (hit === el || el.contains(hit)), focusVisible: el.matches(':focus-visible') || el.matches('input[type="date"],input[type="time"],input[type="datetime-local"],input[type="month"],input[type="week"]') && el.matches(':focus-within'), indicator: !!indicator,
    hitTarget: hit ? { tag: hit.tagName.toLowerCase(), classes: [...hit.classList] } : null,
    rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    style: { outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, outlineColor: s.outlineColor, boxShadow: s.boxShadow } };
}

function eligibleEvaluation() {
  const state = window.__keyboardAudit;
  return [...document.querySelectorAll('button,a[href],input,select,textarea,[tabindex]')].filter(el => {
    if (el.tabIndex < 0 || el.matches(':disabled,input[type="hidden"]') || el.closest('[inert],[hidden],[aria-hidden="true"]')) return false;
    for (let p = el; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.display === 'none' || s.visibility === 'hidden') return false; }
    if (el.matches('input[type="radio"][name]') && !el.checked) {
      const group = [...document.querySelectorAll('input[type="radio"]')].filter(r => r.name === el.name && r.form === el.form);
      if (group.some(r => r.checked) || group[0] !== el) return false;
    }
    return true;
  }).map(el => { if (!state.ids.has(el)) state.ids.set(el, ++state.next); return { id: state.ids.get(el), tag: el.tagName.toLowerCase(), classes: [...el.classList] }; });
}
export const KEYBOARD_PROBE_SHA256 = createHash('sha256').update(focusEvaluation.toString() + eligibleEvaluation.toString()).digest('hex');
export async function settleNativeFocusScroll(page) {
  await page.evaluate(async () => {
    const end = performance.now() + 2000;
    let prior = '', stable = 0;
    while (performance.now() < end && stable < 4) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const r = document.activeElement?.getBoundingClientRect();
      const next = JSON.stringify(r && [r.x, r.y, r.width, r.height]);
      stable = next === prior ? stable + 1 : 0;
      prior = next;
    }
  });
}
export async function auditTabLists(page) {
  const facts = [], faults = [];
  for (const list of await page.locator('[role="tablist"]').all()) {
    if (!await list.isVisible() || await list.evaluate(el => !!el.closest('[inert],[aria-hidden="true"]'))) continue;
    const tabs = list.locator('[role="tab"]:not(:disabled)'), count = await tabs.count();
    if (count < 2) continue;
    const selected = await tabs.evaluateAll(items => items.findIndex(el => el.getAttribute('aria-selected') === 'true'));
    if (selected < 0) { faults.push('tablist has no selected tab'); continue; }
    const origin = tabs.nth(selected), next = tabs.nth((selected + 1) % count);
    await origin.focus(); await page.keyboard.press('ArrowRight');
    let operated = false;
    try { await next.waitFor({ state: 'visible' }); await page.waitForFunction(el => document.activeElement === el && el.getAttribute('aria-selected') === 'true', await next.elementHandle(), { timeout: 1000 }); operated = true; } catch { /* retained failure */ }
    facts.push({ count, operated });
    if (!operated) faults.push('ArrowRight did not focus and select the next tab');
    // Restore a read-only display filter, without invoking business actions.
    await origin.click();
  }
  return { facts, faults };
}
export async function auditKeyboard(page) {
  await page.evaluate(() => {
    const styles = new WeakMap();
    for (const el of document.querySelectorAll('button,a[href],input,select,textarea,[tabindex]')) {
      const s = getComputedStyle(el); styles.set(el, { shadow: s.boxShadow, border: s.borderColor, background: s.backgroundColor });
    }
    window.__keyboardAudit = { ids: new WeakMap(), styles, next: 0 };
    const old = document.body.getAttribute('tabindex');
    document.body.setAttribute('tabindex', '-1'); document.body.focus();
    if (old === null) document.body.removeAttribute('tabindex'); else document.body.setAttribute('tabindex', old);
  });
  const nodes = [], faults = [];
  let completed = false;
  let cycles = 0;
  let previousId;
  for (let i = 0; i < 300; i++) {
    await page.keyboard.press('Tab');
    // Native focus scrolling may be smooth. Observe it settling; never move
    // or scroll a control ourselves, which would conceal app reachability bugs.
    await settleNativeFocusScroll(page);
    const fact = await page.evaluate(`(${focusEvaluation.toString()})()`);
    // Native date inputs have several UA shadow controls whose document-level
    // activeElement is the same input. Repeated hosts do not end the page's Tab
    // sequence; only leaving the document or returning to the first stop does.
    const nativeSubcontrol = fact.tag === 'input' && ['date', 'time', 'datetime-local', 'month', 'week'].includes(fact.type) && previousId === fact.id;
    if (fact.document || nodes[0]?.id === fact.id && !nativeSubcontrol) {
      const eligible = await page.evaluate(`(${eligibleEvaluation.toString()})()`);
      // Controls can enter the Tab order when a dock collapses after focus
      // leaves it. Traverse again to prove the newly available control works.
      if (eligible.every(el => nodes.some(node => node.id === el.id)) || ++cycles >= 3) { completed = true; break; }
      if (fact.document) continue;
    }
    previousId = fact.id;
    if (!nodes.some(node => node.id === fact.id)) nodes.push(fact);
    for (const key of ['visible', 'hit', 'focusVisible', 'indicator']) if (!fact[key]) faults.push(`${key}: focus stop ${fact.id} (${fact.tag})`);
  }
  if (!completed) faults.push('Tab sequence did not complete within 300 stops');
  const eligible = await page.evaluate(`(${eligibleEvaluation.toString()})()`);
  const expected = eligible.map(el => el.id);
  const missing = expected.filter(id => !nodes.some(node => node.id === id));
  if (missing.length) faults.push(`Tab sequence missed ${missing.length} eligible control(s)`);
  await page.evaluate(() => { delete window.__keyboardAudit; });
  return { probeSHA256: KEYBOARD_PROBE_SHA256, completed, cycles, expectedStops: expected.length, missingStops: missing, missingFacts: eligible.filter(el => missing.includes(el.id)), nodes, faults };
}
