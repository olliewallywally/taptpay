/* Shared first-render geometry for R1-T10. No application data or allowances.
 * Keep the browser evaluator in plain JS: tsx can inject helpers into functions
 * passed to Playwright, which do not exist in the browser's execution context.
 */
import { createHash } from "node:crypto";

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
  const zeroPaintClip = (el, s) => {
    // Native visually-hidden styles crop text to no painted area while its
    // layout/range boxes remain nonzero. This is geometry, not a class list.
    const legacy = s.clip.match(/^rect\(([^)]+)\)$/);
    if (legacy && /^(absolute|fixed)$/.test(s.position)) {
      const values = legacy[1].split(/[,\s]+/).filter(Boolean);
      if (values.length === 4) {
        const [top, right, bottom, left] = values.map((v, i) => v === "auto"
          ? (i === 1 ? el.offsetWidth : i === 2 ? el.offsetHeight : 0) : Number.parseFloat(v));
        if (right <= left || bottom <= top) return true;
      }
    }
    const inset = s.clipPath.match(/^inset\(([^)]+)\)$/);
    if (inset) {
      const values = inset[1].split(/\s+round\s+/)[0].trim().split(/\s+/);
      if (values.length >= 1 && values.length <= 4 && values.every((v) => /^-?[\d.]+(?:px|%)?$/.test(v))) {
        const [a, b = a, c = a, d = b] = values;
        const offset = (v, length) => Number.parseFloat(v) * (v.endsWith("%") ? length / 100 : 1);
        if (offset(a, el.offsetHeight) + offset(c, el.offsetHeight) >= el.offsetHeight ||
            offset(b, el.offsetWidth) + offset(d, el.offsetWidth) >= el.offsetWidth) return true;
      }
    }
    return false;
  };
  const mounted = (el) => {
    // Visibility is inherited but descendants may explicitly restore it.
    if (style(el).visibility === "hidden" || style(el).visibility === "collapse") return false;
    for (let n = el; n; n = n.parentElement) {
      const s = style(n);
      if (s.display === "none" || Number(s.opacity) === 0 ||
          s.contentVisibility === "hidden" || zeroPaintClip(n, s)) return false;
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
    let moveLeft = 0;
    let moveRight = 0;
    let moveUp = 0;
    let moveDown = 0;
    for (let n = el; n; n = n.parentElement) {
      const s = style(n);
      const paint = /(^|\s)(paint|strict|content)(\s|$)/.test(s.contain);
      const hardX = paint || /^(hidden|clip)$/.test(s.overflowX);
      const hardY = paint || /^(hidden|clip)$/.test(s.overflowY);
      const b = (hardX || hardY) ? clipBox(n) : null;
      if (hardX) {
        c.left = Math.max(c.left, b.left - moveRight);
        c.right = Math.min(c.right, b.right + moveLeft);
      }
      if (hardY) {
        c.top = Math.max(c.top, b.top - moveDown);
        c.bottom = Math.min(c.bottom, b.bottom + moveUp);
      }
      // A line partly entering a scrollport remains readable by scrolling.
      // Only the measured available scroll delta can recover text from an
      // outer hard clip. An oversized inner viewport may still hide its tail.
      const r = n.getBoundingClientRect();
      const sx = n.offsetWidth ? r.width / n.offsetWidth : 1;
      const sy = n.offsetHeight ? r.height / n.offsetHeight : 1;
      const viewportOverflowX = s.overflowX === "visible" ? style(document.body).overflowX : s.overflowX;
      const pageScrollX = n === document.scrollingElement && !/^(hidden|clip)$/.test(viewportOverflowX);
      if (/^(auto|scroll)$/.test(s.overflowX) || pageScrollX) {
        const maximum = Math.max(0, n.scrollWidth - n.clientWidth);
        if (s.direction === "rtl") {
          moveLeft += Math.max(0, -n.scrollLeft) * sx;
          moveRight += Math.max(0, maximum + n.scrollLeft) * sx;
        } else {
          moveLeft += Math.max(0, maximum - n.scrollLeft) * sx;
          moveRight += Math.max(0, n.scrollLeft) * sx;
        }
      }
      if (/^(auto|scroll)$/.test(s.overflowY)) {
        moveUp += Math.max(0, n.scrollHeight - n.clientHeight - n.scrollTop) * sy;
        moveDown += Math.max(0, n.scrollTop) * sy;
      }
    }
    // Negative glyph overflow can be cropped by the viewport while its
    // element box and document scrollWidth remain inside the window. Account
    // for the actual horizontal scroll range before treating that as loss.
    c.left = Math.max(c.left, -moveRight);
    c.right = Math.min(c.right, vw + moveLeft);
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
    // Ignore elements outside the scroll window. A visible control can have
    // its entire label cropped (e.g. text-indent), so its glyphs need not
    // intersect the clip before their permanent clipping is measured.
    if (!intersects(el.getBoundingClientRect(), effectiveClip(el, true))) continue;
    const s = style(el);
    const c = hardTextClip(el);
    // Inline clientWidth is zero in Chromium. Block scrollWidth is useful
    // diagnostic evidence, but also includes decorative pseudo-elements and
    // visible overflow, so only rendered text against a hard clip proves loss.
    const blockOverflow = s.display !== "inline" && el.clientWidth > 0 &&
      !/^(auto|scroll)$/.test(s.overflowX) && el.scrollWidth > el.clientWidth + slack;
    const clippedRange = rects.some((r) => r.left < c.left - slack || r.right > c.right + slack ||
      r.top < c.top - slack || r.bottom > c.bottom + slack);
    if (clippedRange) {
      const ancestry = [];
      for (let p = el; p && ancestry.length < 8; p = p.parentElement) ancestry.push(label(p));
      clippedText.push({ label: label(el), ancestry, scrollW: el.scrollWidth, clientW: el.clientWidth,
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
    // Chromium hit testing rounds fractional CSS coordinates. A centre just
    // inside the last pixel can otherwise query beyond the viewport and return
    // null. Judge the actual rounded sample against the unchanged clip bounds.
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    if (!pointInside(x, y, effectiveClip(el))) continue;
    tapCentresChecked++;
    const hit = document.elementFromPoint(x, y);
    if (!hit || (hit !== el && !el.contains(hit))) {
      tapCentreMissSamples.push({ control: label(el), hit: label(hit),
        rect: { x: round(r.x), y: round(r.y), width: round(r.width), height: round(r.height) },
        viewport: { innerWidth, innerHeight, clientWidth: vw, clientHeight: vh } });
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
export const GEOMETRY_SOURCE_SHA256 = createHash("sha256").update(GEOMETRY_SOURCE).digest("hex");

export async function measureGeometry(page, rowSelector = null) {
  if (rowSelector !== null && (typeof rowSelector !== "string" || !rowSelector.trim())) {
    throw new TypeError("Terminal row selector must be a nonempty selector or null");
  }
  return page.evaluate(`${GEOMETRY_SOURCE}(${JSON.stringify(rowSelector)})`);
}
