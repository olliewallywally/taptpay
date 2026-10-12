// Supplement axe incompletes with conservative rendered-background evidence.
// This never converts or removes the original axe result. A failing bound is
// a review candidate, since a range box can include background outside glyphs.
import { PNG } from 'pngjs';
import { structuralTarget } from './accessibility-audit.mjs';

export function contrastRatio(foreground, background) {
  const luminance = rgb => rgb.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
  const alpha = foreground[3] ?? 1;
  const painted = foreground.slice(0, 3).map((v, i) => v * alpha + background[i] * (1 - alpha));
  const a = luminance(painted), b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

export async function reviewAccessibilityCandidates(page) {
  const { experimental, candidates } = await page.evaluate(async () => {
    const experimentalIds = ['css-orientation-lock', 'label-content-name-mismatch', 'p-as-heading', 'table-fake-caption', 'td-has-header'];
    const experimental = await window.axe.run(document, { runOnly: { type: 'rule', values: experimentalIds } });
    const original = await window.axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] } });
    const saved = [];
    const parse = value => {
      const m = value.match(/^rgba?\(([^)]+)\)$/);
      if (!m) return null;
      const values = m[1].split(/[,\s]+/).filter(Boolean).map(Number);
      return values.length >= 3 && values.every(Number.isFinite) ? [...values.slice(0, 3), values[3] ?? 1] : null;
    };
    const hasPaintTransition = el => {
      const s = getComputedStyle(el);
      const properties = s.transitionProperty.split(',').map(v => v.trim());
      const durations = s.transitionDuration.split(',').map(parseFloat);
      const delays = s.transitionDelay.split(',').map(parseFloat);
      const paints = el instanceof SVGElement ? ['all', 'fill', '-webkit-text-fill-color'] : ['all', '-webkit-text-fill-color'];
      return properties.some((property, i) => paints.includes(property)
        && (durations[i % durations.length] > 0 || delays[i % delays.length] > 0));
    };
    const candidates = original.incomplete.flatMap(r => r.nodes).map((node, index) => {
      let el;
      try { el = document.querySelector(node.target[0]); } catch { /* retain unresolved */ }
      const fact = { index, target: node.target, reason: null, rectangles: [], foreground: null, minimum: 4.5 };
      if (!el) { fact.reason = 'selector unresolved'; return fact; }
      const style = getComputedStyle(el);
      const svg = el instanceof SVGElement;
      // Suppression/restoration would itself animate under an authored paint
      // transition. Keep these candidates manual and leave their paint intact.
      if ([el, ...el.querySelectorAll('*')].some(hasPaintTransition)) fact.reason = 'text paint transition requires visual review';
      fact.foreground = parse(svg ? style.fill : style.webkitTextFillColor || style.color);
      if (!fact.foreground || fact.foreground[3] === 0) fact.reason = 'transparent or unsupported text paint';
      let textScale = 1;
      if (svg && typeof el.getScreenCTM === 'function') {
        const m = el.getScreenCTM(); if (m) textScale = Math.hypot(m.c, m.d);
      } else for (let p = el; p; p = p.parentElement) {
        const transform = getComputedStyle(p).transform;
        if (transform !== 'none') { const m = new DOMMatrixReadOnly(transform); textScale *= Math.hypot(m.c, m.d); }
      }
      fact.renderedFontSize = parseFloat(style.fontSize) * textScale;
      const large = fact.renderedFontSize >= 24 || (fact.renderedFontSize >= 18.6666667 && Number(style.fontWeight) >= 700);
      fact.minimum = large ? 3 : 4.5;
      let opacity = 1;
      for (let p = el; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        opacity *= Number(s.opacity);
        if (s.filter !== 'none' || s.backdropFilter !== 'none' || s.mixBlendMode !== 'normal' || s.maskImage !== 'none') fact.reason ??= 'filter/blend/mask requires visual review';
      }
      if (opacity !== 1) fact.reason ??= 'group opacity requires visual review';
      if (style.textShadow !== 'none') fact.reason ??= 'text shadow requires visual review';
      if (svg && Number(style.fillOpacity) !== 1) fact.reason ??= 'SVG fill opacity requires visual review';
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = walker.currentNode;
        if (!text.textContent.trim()) continue;
        if (getComputedStyle(text.parentElement).color !== style.color && !svg) { fact.reason ??= 'mixed descendant text colors'; continue; }
        const range = document.createRange(); range.selectNodeContents(text);
        for (const r of range.getClientRects()) if (r.width && r.height) fact.rectangles.push({ x: r.x, y: r.y, width: r.width, height: r.height });
      }
      if (!fact.rectangles.length) fact.reason ??= 'no direct text ranges (input/replaced content)';
      if (fact.rectangles.some(r => r.x < 0 || r.y < 0 || r.x + r.width > innerWidth || r.y + r.height > innerHeight)) fact.reason ??= 'range outside current viewport';
      return fact;
    });
    window.__candidateReviewElements = candidates.filter(c => !c.reason).map(c => document.querySelector(c.target[0]));
    window.__candidateReviewRestore = saved;
    const describe = r => ({ id: r.id, nodes: r.nodes.map(n => {
      let el; try { el = document.querySelector(n.target[0]); } catch { /* unresolved */ }
      return { target: n.target, checkIds: [...n.any, ...n.all, ...n.none].map(c => c.id),
        diagnostic: el ? { tag: el.tagName.toLowerCase(), classes: [...el.classList], disabled: !!el.disabled, role: el.getAttribute('role') } : null };
    }) });
    return { experimental: { violations: experimental.violations.map(describe), incomplete: experimental.incomplete.map(describe), passedRuleIds: experimental.passes.map(r => r.id) }, candidates };
  });
  let png, painted;
  try {
    painted = PNG.sync.read(await page.screenshot({ scale: 'css' }));
    await page.evaluate(() => {
      for (const el of window.__candidateReviewElements) for (const p of [el, ...el.querySelectorAll('*')]) {
        window.__candidateReviewRestore.push([p, p.getAttribute('style')]);
        p.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
        if (p instanceof SVGElement) p.style.setProperty('fill', 'transparent', 'important');
      }
    });
    png = PNG.sync.read(await page.screenshot({ scale: 'css' }));
  }
  finally {
    await page.evaluate(() => {
      // Reverse order also restores repeated descendant captures exactly.
      for (const [el, value] of (window.__candidateReviewRestore ?? []).reverse()) {
        if (value == null) el.removeAttribute('style'); else el.setAttribute('style', value);
      }
      delete window.__candidateReviewRestore;
      delete window.__candidateReviewElements;
    });
  }
  for (const c of candidates) {
    c.target = structuralTarget(c.target);
    if (c.reason) { c.status = 'needs-review'; continue; }
    let minimumRatio = Infinity, pixels = 0;
    for (const r of c.rectangles) {
      for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(png.height, Math.ceil(r.y + r.height)); y++) {
        for (let x = Math.max(0, Math.floor(r.x)); x < Math.min(png.width, Math.ceil(r.x + r.width)); x++) {
          const at = (y * png.width + x) * 4;
          // Borders/padding in a text range are not glyph background. Keep
          // only pixels that actually changed when this text was suppressed.
          if (![0, 1, 2].some(i => Math.abs(painted.data[at + i] - png.data[at + i]) > 2)) continue;
          minimumRatio = Math.min(minimumRatio, contrastRatio(c.foreground, [...png.data.subarray(at, at + 3)])); pixels++;
        }
      }
    }
    c.pixels = pixels; c.minimumRatio = pixels ? minimumRatio : null;
    c.status = pixels && minimumRatio >= c.minimum ? 'bounded-contrast-pass' : 'needs-review';
    if (c.status === 'needs-review') c.reason = pixels ? 'painted range background bound below threshold' : 'no changed glyph pixels in current clipped view';
  }
  for (const group of [experimental.violations, experimental.incomplete]) for (const r of group) for (const n of r.nodes) n.target = structuralTarget(n.target);
  return { method: 'conservative glyph-mask/background screenshot; original axe results retained', experimental, contrastCandidates: candidates };
}
