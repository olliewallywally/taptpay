// Kept in plain JS so Playwright receives browser code without tsx helpers.
// Structural metrics only: no input values, credentials or customer text.
import { createHash } from 'node:crypto';
export function tutorialGeometry({ target, fallbackTarget }) {
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  };
  const visible = (el) => {
    const r = box(el);
    if (r.width <= 0 || r.height <= 0) return false;
    const clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0 || n.inert) return false;
      // Body overflow is propagated to the viewport; its own zero-height box
      // does not clip fixed/absolute content in a standards-mode application.
      if (n !== el && n !== document.body && n !== document.documentElement) {
        const b = box(n);
        if (/hidden|clip|auto|scroll/.test(s.overflowX)) { clip.left = Math.max(clip.left, b.left); clip.right = Math.min(clip.right, b.right); }
        if (/hidden|clip|auto|scroll/.test(s.overflowY)) { clip.top = Math.max(clip.top, b.top); clip.bottom = Math.min(clip.bottom, b.bottom); }
      }
    }
    return Math.min(r.right, clip.right) > Math.max(r.left, clip.left) && Math.min(r.bottom, clip.bottom) > Math.max(r.top, clip.top);
  };
  const find = (selector) => selector ? Array.from(document.querySelectorAll(selector)).find(visible) : null;
  const primary = find(target);
  const fallbackCandidate = find(fallbackTarget);
  const anchor = primary ?? fallbackCandidate;
  const card = find('.tutorial-card');
  const highlight = find('.tutorial-highlight');
  const faults = [];
  if (!anchor) faults.push('no visible target or fallback');
  if (!card) faults.push('no visible tutorial card');
  if (!highlight) faults.push('no visible spotlight');
  let expected = null;
  if (anchor && highlight) {
    const r = box(anchor);
    expected = { left: Math.max(8, r.left - 9), top: Math.max(8, r.top - 9), right: Math.min(innerWidth - 8, r.right + 9), bottom: Math.min(innerHeight - 8, r.bottom + 9) };
    const actual = box(highlight);
    if (Object.keys(expected).some((key) => Math.abs(expected[key] - actual[key]) > 2)) faults.push('spotlight does not follow the visible target');
  }
  if (card) {
    const r = box(card);
    if (r.left < 0 || r.top < 0 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) faults.push('tutorial card crosses viewport');
    for (const button of card.querySelectorAll('button')) {
      const b = box(button); const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      if (!hit || !button.contains(hit)) faults.push('tutorial control centre is obstructed');
    }
    for (const el of card.querySelectorAll('h2,p')) {
      if (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2) faults.push('tutorial text is clipped');
    }
  }
  // Ancestor/descendant candidates share a subtree. Hiding the primary can
  // remove its descendant or collapse a wrapper sized by that primary.
  const alternateFallback = Boolean(primary && fallbackCandidate && !primary.contains(fallbackCandidate) && !fallbackCandidate.contains(primary));
  return { faults, primary: Boolean(primary), fallback: !primary && Boolean(anchor), alternateFallback, target: anchor ? box(anchor) : null, spotlight: highlight ? box(highlight) : null, card: card ? box(card) : null, expected };
}

export async function measureTutorial(page, step) {
  return page.evaluate(`(${tutorialGeometry.toString()})(${JSON.stringify({ target: step.target, fallbackTarget: step.fallbackTarget })})`);
}

export const TUTORIAL_GEOMETRY_SOURCE_SHA256 = createHash('sha256').update(tutorialGeometry.toString()).digest('hex');
