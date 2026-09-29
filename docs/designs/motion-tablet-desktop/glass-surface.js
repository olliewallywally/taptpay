/* TPGlass — vanilla port of React Bits <GlassSurface/> (JS+CSS variant).
   Per-element SVG displacement-map refraction with chromatic offsets,
   applied via backdrop-filter: url(#id). Fallback frost for Safari/Firefox.
   API:
     TPGlass.upgrade(el, {scale})  → true when applied (needs layout size)
     TPGlass.setScale(scale)      → retune all upgraded elements
*/
(function () {
  var uid = 0;
  var items = [];
  var defs = null;
  var supported = null;

  function supportsFilter() {
    if (supported !== null) return supported;
    var ua = navigator.userAgent;
    var isWebkit = /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
    var isFF = /Firefox/.test(ua);
    if (isWebkit || isFF) { supported = false; return supported; }
    var d = document.createElement('div');
    d.style.backdropFilter = 'url(#tp-gs-probe)';
    supported = d.style.backdropFilter !== '';
    return supported;
  }

  function ensureDefs() {
    if (defs && defs.isConnected) return defs;
    var wrap = document.createElement('div');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
    wrap.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"><defs></defs></svg>';
    document.body.appendChild(wrap);
    defs = wrap.querySelector('defs');
    return defs;
  }

  // Identical map construction to GlassSurface.generateDisplacementMap()
  function mapURI(w, h, radius, borderWidth, brightness, opacity, blur, blend) {
    var edge = Math.min(w, h) * (borderWidth * 0.5);
    var svg =
      '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
      '<linearGradient id="rg" x1="100%" y1="0%" x2="0%" y2="0%">' +
      '<stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/></linearGradient>' +
      '<linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">' +
      '<stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/></linearGradient>' +
      '</defs>' +
      '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="black"/>' +
      '<rect x="0" y="0" width="' + w + '" height="' + h + '" rx="' + radius + '" fill="url(#rg)"/>' +
      '<rect x="0" y="0" width="' + w + '" height="' + h + '" rx="' + radius + '" fill="url(#bg)" style="mix-blend-mode:' + blend + '"/>' +
      '<rect x="' + edge + '" y="' + edge + '" width="' + (w - edge * 2) + '" height="' + (h - edge * 2) + '" rx="' + radius + '" fill="hsl(0 0% ' + brightness + '% / ' + opacity + ')" style="filter:blur(' + blur + 'px)"/>' +
      '</svg>';
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  var M_RED = '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0';
  var M_GRN = '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0';
  var M_BLU = '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0';

  function upgrade(el, opts) {
    if (!el || el.__tpGlass) return true;
    var w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) return false; // not laid out yet — caller may retry
    var o = opts || {};
    var cs = getComputedStyle(el);
    var radius = parseFloat(cs.borderTopLeftRadius) || 20;
    if (radius > Math.min(w, h) / 2) radius = Math.min(w, h) / 2;
    var scale = o.scale != null ? o.scale : (parseFloat(el.getAttribute('data-glass-scale') || '') || -150);
    var borderWidth = 0.07, brightness = 50, opacity = 0.93, blurIn = 11, displace = 0.5;
    var rOff = 0, gOff = 10, bOff = 20;

    if (!supportsFilter()) {
      el.style.webkitBackdropFilter = 'blur(14px) saturate(1.6) brightness(1.12)';
      el.style.backdropFilter = 'blur(14px) saturate(1.6) brightness(1.12)';
      el.__tpGlass = { fallback: true };
      return true;
    }

    var id = 'tp-gs-' + (++uid);
    var uri = mapURI(w, h, radius, borderWidth, brightness, opacity, blurIn, 'difference');
    var html =
      '<filter id="' + id + '" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">' +
      '<feImage x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" href="' + uri + '" result="map"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="map" scale="' + (scale + rOff) + '" xChannelSelector="R" yChannelSelector="G" result="dR"/>' +
      '<feColorMatrix in="dR" type="matrix" values="' + M_RED + '" result="cR"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="map" scale="' + (scale + gOff) + '" xChannelSelector="R" yChannelSelector="G" result="dG"/>' +
      '<feColorMatrix in="dG" type="matrix" values="' + M_GRN + '" result="cG"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="map" scale="' + (scale + bOff) + '" xChannelSelector="R" yChannelSelector="G" result="dB"/>' +
      '<feColorMatrix in="dB" type="matrix" values="' + M_BLU + '" result="cB"/>' +
      '<feBlend in="cR" in2="cG" mode="screen" result="rg"/>' +
      '<feBlend in="rg" in2="cB" mode="screen" result="out"/>' +
      '<feGaussianBlur in="out" stdDeviation="' + displace + '"/>' +
      '</filter>';
    ensureDefs().insertAdjacentHTML('beforeend', html);
    var fl = document.getElementById(id);
    var disp = fl ? fl.querySelectorAll('feDisplacementMap') : [];
    el.style.backdropFilter = 'url(#' + id + ') saturate(1.35) brightness(1.08)';
    el.__tpGlass = { id: id, disp: disp };
    items.push(el.__tpGlass);
    return true;
  }

  function setScale(scale) {
    var offs = [0, 10, 20];
    items.forEach(function (it) {
      if (!it.disp) return;
      offs.forEach(function (off, i) {
        if (it.disp[i]) it.disp[i].setAttribute('scale', scale + off);
      });
    });
  }

  window.TPGlass = { upgrade: upgrade, setScale: setScale, supported: supportsFilter };
})();
