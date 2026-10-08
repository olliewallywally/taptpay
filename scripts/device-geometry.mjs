/* Shared first-render geometry for R1-T10. No application data or allowances.
 * Keep the browser evaluator in plain JS: tsx can inject helpers into functions
 * passed to Playwright, which do not exist in the browser's execution context.
 */
function browserGeometry(rowSelector) {
  const slack = 2;
  const round = (n) => Math.round(n * 10) / 10;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const all = Array.from(document.querySelectorAll("body *"));
  const styleCache = new Map();
  const style = (el) => {
    if (!styleCache.has(el)) styleCache.set(el, getComputedStyle(el));
    return styleCache.get(el);
  };
  // Structural labels deliberately omit text, input values, URLs and IDs.
  const label = (el) => {
    if (!el) return null;
    const cls = String(el.className?.baseVal ?? el.className ?? "")
      .split(/\s+/).filter(Boolean).slice(0, 3).join(".").slice(0, 100);
    return el.tagName.toLowerCase() + (cls ? "." + cls : "");
  };
  const mounted = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const s = style(n);
      if (s.display === "none" || s.visibility === "hidden" ||
          s.visibility === "collapse" || Number(s.opacity) === 0 ||
          s.contentVisibility === "hidden") return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const clips = (overflow) => /^(hidden|clip|auto|scroll)$/.test(overflow);
  const clipBox = (el) => {
    const r = el.getBoundingClientRect();
    // client dimensions are untransformed; desktop frames scale their subtree.
    const sx = el.offsetWidth ? r.width / el.offsetWidth : 1;
    const sy = el.offsetHeight ? r.height / el.offsetHeight : 1;
    const left = r.left + el.clientLeft * sx;
    const top = r.top + el.clientTop * sy;
    return { left, top, right: left + el.clientWidth * sx, bottom: top + el.clientHeight * sy };
  };
  const effectiveClip = (el, self = false, windowX = true) => {
    const c = { left: windowX ? 0 : -Infinity, right: windowX ? vw : Infinity, top: 0, bottom: vh };
    for (let n = self ? el : el.parentElement; n; n = n.parentElement) {
      const s = style(n);
      const paint = /(^|\s)(paint|strict|content)(\s|$)/.test(s.contain);
      if (!paint && !clips(s.overflowX) && !clips(s.overflowY)) continue;
      const b = clipBox(n);
      if (paint || clips(s.overflowX)) {
        c.left = Math.max(c.left, b.left);
        c.right = Math.min(c.right, b.right);
      }
      if (paint || clips(s.overflowY)) {
        c.top = Math.max(c.top, b.top);
        c.bottom = Math.min(c.bottom, b.bottom);
      }
    }
    return c;
  };
  const intersects = (r, c) => Math.min(r.right, c.right) > Math.max(r.left, c.left) &&
    Math.min(r.bottom, c.bottom) > Math.max(r.top, c.top);
  const pointInside = (x, y, c) => x >= c.left && x < c.right && y >= c.top && y < c.bottom;
  const hardTextClip = (el) => {
    const c = { left: -Infinity, right: Infinity, top: -Infinity, bottom: Infinity };
    let reachableX = false;
    let reachableY = false;
    for (let n = el; n; n = n.parentElement) {
      const s = style(n);
      const paint = /(^|\s)(paint|strict|content)(\s|$)/.test(s.contain);
      const hardX = paint || /^(hidden|clip)$/.test(s.overflowX);
      const hardY = paint || /^(hidden|clip)$/.test(s.overflowY);
      const b = (hardX || hardY) ? clipBox(n) : null;
      if (hardX && !reachableX) {
        c.left = Math.max(c.left, b.left);
        c.right = Math.min(c.right, b.right);
      }
      if (hardY && !reachableY) {
        c.top = Math.max(c.top, b.top);
        c.bottom = Math.min(c.bottom, b.bottom);
      }
      // A line partly entering a scrollport remains readable by scrolling.
      // Outer clipping of that scrollport does not permanently truncate its
      // text, but a hard clip already encountered inside it still does.
      if (/^(auto|scroll)$/.test(s.overflowX) && n.scrollWidth > n.clientWidth) reachableX = true;
      if (/^(auto|scroll)$/.test(s.overflowY) && n.scrollHeight > n.clientHeight) reachableY = true;
    }
    return c;
  };

  const edgeCrossers = [];
  for (const el of all) {
    if (!mounted(el)) continue;
    const r = el.getBoundingClientRect();
    const c = effectiveClip(el, false, false);
    // Only the exposed part of a box counts. Oversized children inside a
    // clipped carousel, or rows below a scroll window, are not window defects.
    if (!intersects(r, { ...c, left: Math.max(c.left, 0), right: Math.min(c.right, vw) })) continue;
    const left = Math.max(r.left, c.left);
    const right = Math.min(r.right, c.right);
    if (left < -0.5 || right > vw + 0.5) {
      edgeCrossers.push({ label: label(el), left: round(left), right: round(right), w: round(right - left) });
    }
  }

  const clippedText = [];
  for (const el of all) {
    const textNodes = Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    if (!textNodes.length || !mounted(el)) continue;
    const rects = textNodes.flatMap((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const boxes = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
      range.detach();
      return boxes;
    });
    // Do not inspect text that is wholly outside the current scroll window.
    if (!rects.some((r) => intersects(r, effectiveClip(el, true)))) continue;
    const s = style(el);
    const c = hardTextClip(el);
    // Inline clientWidth is zero in Chromium: only rendered ranges can prove
    // those leaves clipped. Block scrollWidth also catches text overrunning an
    // authored width even when overflow is visible rather than hidden.
    const blockOverflow = s.display !== "inline" && el.clientWidth > 0 &&
      !/^(auto|scroll)$/.test(s.overflowX) && el.scrollWidth > el.clientWidth + slack;
    const clippedRange = rects.some((r) => r.left < c.left - slack || r.right > c.right + slack ||
      r.top < c.top - slack || r.bottom > c.bottom + slack);
    if (blockOverflow || clippedRange) {
      clippedText.push({ label: label(el), scrollW: el.scrollWidth, clientW: el.clientWidth,
        blockOverflow, clippedRange });
    }
  }

  const tapCentreMissSamples = [];
  const controlSelector = 'button, input:not([type="hidden"]), select, textarea, a[href], [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"]';
  let tapCentresChecked = 0;
  for (const el of document.querySelectorAll(controlSelector)) {
    if (!mounted(el) || el.matches(":disabled") || el.getAttribute("aria-disabled") === "true" ||
        el.closest("[inert]") || style(el).pointerEvents === "none") continue;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (!pointInside(x, y, effectiveClip(el))) continue;
    tapCentresChecked++;
    const hit = document.elementFromPoint(x, y);
    if (!hit || (hit !== el && !el.contains(hit))) {
      tapCentreMissSamples.push({ control: label(el), hit: label(hit) });
    }
  }

  let terminalRows = null;
  if (rowSelector !== null) {
    const rows = Array.from(document.querySelectorAll(rowSelector));
    terminalRows = { total: rows.length, visible: rows.filter((row) => {
      if (!mounted(row)) return false;
      const r = row.getBoundingClientRect();
      const c = effectiveClip(row);
      // A row must be fully readable in its current scroll region. A mere
      // sliver at the edge cannot satisfy the seeded terminal-row contract.
      if (r.left < c.left - 0.5 || r.right > c.right + 0.5 ||
          r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5) return false;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return Boolean(hit && (hit === row || row.contains(hit)));
    }).length };
  }
  return {
    docOverflow: round(Math.max(0, document.documentElement.scrollWidth - vw)),
    edgeCrossers: edgeCrossers.slice(0, 12), edgeCrosserCount: edgeCrossers.length,
    clippedText: clippedText.slice(0, 12), clippedTextCount: clippedText.length,
    tapCentreMissSamples: tapCentreMissSamples.slice(0, 12), tapCentreMiss: tapCentreMissSamples.length,
    tapCentresChecked, terminalRows,
  };
}

export const GEOMETRY_SOURCE = `(${browserGeometry.toString()})`;

export async function measureGeometry(page, rowSelector = null) {
  if (rowSelector !== null && (typeof rowSelector !== "string" || !rowSelector.trim())) {
    throw new TypeError("Terminal row selector must be a nonempty selector or null");
  }
  return page.evaluate(`${GEOMETRY_SOURCE}(${JSON.stringify(rowSelector)})`);
}
