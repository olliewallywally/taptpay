// Read-only native keyboard scrolling of the real list. No business action or
// persisted text. Every mounted row must be painted fully at least once.
export async function auditScrollRows(page, selector) {
  const seen = new Set();
  const collect = async () => {
    const facts = await page.locator(selector).evaluateAll(rows => rows.map((el, index) => {
      const r = el.getBoundingClientRect(); let l = 0, t = 0, right = innerWidth, bottom = innerHeight, opacity = 1;
      for (let p = el; p; p = p.parentElement) {
        const s = getComputedStyle(p), box = p.getBoundingClientRect();
        opacity *= Number(s.opacity);
        if (/auto|scroll|hidden|clip/.test(s.overflowX)) { l = Math.max(l, box.left); right = Math.min(right, box.right); }
        if (/auto|scroll|hidden|clip/.test(s.overflowY)) { t = Math.max(t, box.top); bottom = Math.min(bottom, box.bottom); }
      }
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { index, visible: r.width > 0 && r.height > 0 && r.left >= l - 2 && r.right <= right + 2 && r.top >= t - 2 && r.bottom <= bottom + 2 && opacity > 0 && !!hit && (hit === el || el.contains(hit)) };
    }));
    facts.filter(f => f.visible).forEach(f => seen.add(f.index));
    return facts.length;
  };
  const total = await collect();
  if (seen.size === total) return { total, seen: seen.size, faults: [] };
  const region = await page.locator(selector).first().evaluateHandle(el => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/auto|scroll/.test(s.overflowY) && p.scrollHeight > p.clientHeight ||
          /auto|scroll/.test(s.overflowX) && p.scrollWidth > p.clientWidth) return p;
    }
    return null;
  });
  const element = region.asElement();
  if (!element) { await region.dispose(); return { total, seen: seen.size, faults: ['rows have no native scroll region'] }; }
  const named = await element.evaluate(el => el.tabIndex >= 0 && !!(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')));
  await element.focus(); await page.waitForTimeout(300);
  const diagnostics = await element.evaluate(el => {
    const facts = [];
    for (let p = el; p; p = p.parentElement) {
      const s = getComputedStyle(p), r = p.getBoundingClientRect();
      facts.push({ tag: p.tagName.toLowerCase(), classes: [...p.classList], position: s.position, overflowX: s.overflowX, overflowY: s.overflowY, opacity: s.opacity, width: r.width, height: r.height, x: r.x, y: r.y, scrollHeight: p.scrollHeight, clientHeight: p.clientHeight, scrollTop: p.scrollTop });
    }
    return facts;
  });
  await collect();
  // A preceding keyboard traversal may leave the zoomed canvas panned right.
  // Return with actual native keys so left-side rows can be read again.
  for (let i = 0; i < 80 && await element.evaluate(el => el.scrollLeft) > 0; i++) {
    const before = await element.evaluate(el => el.scrollLeft);
    await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(250); await collect();
    if (await element.evaluate(el => el.scrollLeft) === before) break;
  }
  // Home scrolls the outer document in Chromium, even when a list has focus.
  // PageUp/PageDown operate the focused native scroll region. Visit both
  // directions from the real initial position without cancelling focus scroll.
  for (let i = 0; i < 40 && await element.evaluate(el => el.scrollTop) > 0; i++) {
    const before = await element.evaluate(el => el.scrollTop);
    await page.keyboard.press('PageUp'); await page.waitForTimeout(400); await collect();
    if (await element.evaluate(el => el.scrollTop) === before) break;
  }
  for (let i = 0; i < 160 && seen.size < total; i++) {
    const before = await element.evaluate(el => el.scrollTop);
    const focused = await page.evaluateHandle(() => document.activeElement);
    // Small native steps overlap enough to expose long rows fully. In lists
    // with arrow navigation, the actual key instead advances the row's focus.
    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(250); await collect();
    const unchangedFocus = await page.evaluate(el => document.activeElement === el, focused);
    await focused.dispose();
    if (await element.evaluate(el => el.scrollTop) === before && unchangedFocus) break;
  }
  await region.dispose();
  return { named, total, seen: seen.size, diagnostics, faults: [...(!named ? ['scroll region has no keyboard target or name'] : []), ...(seen.size !== total ? [`only ${seen.size}/${total} rows were fully readable with native scrolling`] : [])] };
}
