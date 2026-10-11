import { createHash } from 'node:crypto';

// Serialized into Chromium. Retain only structural and computed numeric data.
// The tutorial card is opaque: unexpected translucency/gradients are a fault,
// rather than a license to guess the background or lower the threshold.
export function tutorialContrastEvaluation(focusedSelector) {
  const cards = document.querySelectorAll('.tutorial-card');
  const card = cards[cards.length - 1];
  if (!card) throw new Error('tutorial contrast: no active card');
  const rgb = value => {
    const match = /^rgba?\((\d+(?:\.\d+)?), (\d+(?:\.\d+)?), (\d+(?:\.\d+)?)(?:, (\d+(?:\.\d+)?))?\)$/.exec(value);
    if (!match) throw new Error('tutorial contrast: unsupported computed color');
    return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])];
  };
  const blend = (fg, bg) => fg.slice(0, 3).map((channel, i) => channel * fg[3] + bg[i] * (1 - fg[3]));
  const luminance = color => color.map(channel => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (fg, bg) => {
    const a = luminance(fg), b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const rect = el => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  const cardStyle = getComputedStyle(card);
  const cardBackground = rgb(cardStyle.backgroundColor);
  if (cardBackground[3] !== 1) throw new Error('tutorial contrast: card background is not opaque');
  for (let el = card; el; el = el.parentElement) {
    const s = getComputedStyle(el);
    if (Number(s.opacity) !== 1 || s.filter !== 'none') throw new Error('tutorial contrast: ancestor opacity/filter changes rendered colors');
  }
  const background = el => {
    const chain = [];
    for (let current = el; current; current = current.parentElement) {
      const s = getComputedStyle(current);
      if (Number(s.opacity) !== 1 || s.backgroundImage !== 'none' || s.filter !== 'none') throw new Error('tutorial contrast: unsupported background/opacity/filter');
      chain.push(rgb(s.backgroundColor));
      if (current === card) break;
    }
    return chain.reverse().reduce((bg, fg) => blend(fg, bg), cardBackground.slice(0, 3));
  };
  const checks = ['.tutorial-eyebrow', '.tutorial-footer > span'].map(selector => {
    const el = card.querySelector(selector);
    if (!el) throw new Error(`tutorial contrast: missing ${selector}`);
    const s = getComputedStyle(el), bg = background(el), fg = rgb(s.color);
    const contrast = ratio(blend(fg, bg), bg);
    return { selector, kind: 'text', foreground: fg, background: bg, fontSize: parseFloat(s.fontSize), fontWeight: Number(s.fontWeight), ratio: contrast, minimum: 4.5, pass: contrast >= 4.5, rect: rect(el) };
  });
  const el = card.querySelector(focusedSelector);
  if (!el || document.activeElement !== el || !el.matches(':focus-visible')) throw new Error('tutorial contrast: expected real visible keyboard focus');
  const s = getComputedStyle(el), fg = rgb(s.outlineColor), bg = background(el.parentElement);
  const contrast = ratio(blend(fg, bg), bg);
  const outlineWidth = parseFloat(s.outlineWidth), outlineOffset = parseFloat(s.outlineOffset);
  const c = card.getBoundingClientRect(), r = el.getBoundingClientRect(), reach = outlineWidth + outlineOffset;
  const onCard = r.x - reach >= c.x && r.y - reach >= c.y && r.right + reach <= c.right && r.bottom + reach <= c.bottom;
  checks.push({ selector: focusedSelector, kind: 'focus', foreground: fg, background: bg, ratio: contrast, minimum: 3, outlineWidth, outlineOffset, outlineStyle: s.outlineStyle, onCard, pass: contrast >= 3 && s.outlineStyle !== 'none' && outlineWidth >= 2 && outlineOffset >= 0 && onCard, rect: rect(el) });
  return { card: rect(card), checks };
}

export const TUTORIAL_CONTRAST_PROBE_SHA256 = createHash('sha256').update(tutorialContrastEvaluation.toString()).digest('hex');

export async function measureTutorialContrast(page, selector) {
  return page.evaluate(`(${tutorialContrastEvaluation.toString()})(${JSON.stringify(selector)})`);
}

export async function measureSettledTutorialContrast(page, selector) {
  // Read readiness and colors in the same browser turn. A separate wait followed
  // by evaluate can observe different AnimatePresence cards/animation frames.
  // Never refocus a control here: a lost keyboard focus still times out/fails.
  const handle = await page.waitForFunction(`(() => {
    const cards = document.querySelectorAll('.tutorial-card');
    const card = cards[cards.length - 1];
    if (!card || getComputedStyle(card).transform !== 'none') return false;
    for (let el = card; el; el = el.parentElement) {
      if (Number(getComputedStyle(el).opacity) !== 1) return false;
    }
    const control = card.querySelector(${JSON.stringify(selector)});
    if (!control || document.activeElement !== control || !control.matches(':focus-visible')) return false;
    return (${tutorialContrastEvaluation.toString()})(${JSON.stringify(selector)});
  })()`, undefined, { timeout: 10000 });
  try { return await handle.jsonValue(); }
  finally { await handle.dispose(); }
}
