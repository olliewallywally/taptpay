# Taptpay Landing — React source export

Original source export of the Taptpay landing page prototype (no build artifacts,
no hashed filenames). Visuals and behavior are 1:1 with the prototype.

## Structure

```
src/
  LandingPage.tsx     # default-exported page component (all markup, inline styles)
  landingRuntime.ts   # ALL scroll-linking, camera animation, three.js scenes (readable source)
  landing.css         # global CSS the page needs: @font-face, @keyframes, body reset
assets/               # raw, un-hashed assets — serve at /assets (put in Vite public/)
  fonts/…             # Outfit ×6 weights, Larken Black + BlackItalic
  shell-front.webp, shell-back.webp   # phone-shell textures (three.js)
  three.min.js        # the exact three build the prototype ran on (reference copy)
```

## Install into your React 18 + TS + Vite app

1. Copy `src/` files into your source tree (any folder; they only import each other).
2. Copy `assets/` into `public/assets/` — all URLs in code/CSS are `/assets/...`
   with original filenames (nothing base64-inlined, nothing hashed).
3. Dependencies:
   - `three` — the only runtime dependency. Pin `three@0.152.x` (matches the bundled build, r152).
   - `@types/three` (dev) if you want types; `landingRuntime.ts` is `@ts-nocheck` regardless (ported verbatim for fidelity).
   - **Not required** by this page: tailwind, motion/react, lucide-react — it is
     self-contained inline-styled markup + its own runtime. wouter is only needed
     to route to it: `<Route path="/" component={LandingPage} />`
4. `index.html` additions (optional but recommended — font preloads from the prototype):
```html
<link rel="preload" href="/assets/fonts/Outfit-Light.otf" as="font" type="font/otf" crossorigin="anonymous">
<link rel="preload" href="/assets/fonts/Outfit-Regular.otf" as="font" type="font/otf" crossorigin="anonymous">
<link rel="preload" href="/assets/fonts/Outfit-Medium.otf" as="font" type="font/otf" crossorigin="anonymous">
```
   No script tags needed — `three` is imported from npm (the prototype's local
   `three.min.js` script include was replaced by `import * as THREE from 'three'`;
   the file is kept in `assets/` so you can verify the exact version).

## Global CSS
`landing.css` is imported by `LandingPage.tsx`. It contains only what cannot be
inline: @font-face (Outfit, Larken), @keyframes (tpHint, tpSpin, tpPopIn, tpPopOut,
tpGlare), html/body reset + `background:#040D6D`, ::selection, and the contact-form
placeholder/focus rules. If your app resets body styles after it, keep the
`background:#040D6D` on body/route root to avoid white overscroll flashes.

## Props (all optional)
- `coinDensity` (0.4–2, default 1.4) — hero coin count multiplier
- `defaultIndustry` ('property' | 'trades' | 'retail', default 'property')
- `reducedMotion` (default false) — freezes ambient 3D motion

## Asset → import map
| Asset | Used by |
|---|---|
| `assets/fonts/Outfit-*.otf` (6) | `landing.css` @font-face → all UI text |
| `assets/fonts/LarkenDEMO-Black(Italic).otf` | `landing.css` @font-face → logo wordmark + coin faces |
| `assets/shell-front.webp`, `shell-back.webp` | `landingRuntime.ts` → initPhone3D() phone textures |
| `assets/Google_Pay_Logo.svg_1773556576322-DufliZL0.png` | `landingRuntime.ts` → checkout-mock markup (google pay pill) |
| `assets/three.min.js` | reference only (version parity); not loaded |

## Notes / explicit flags
- **Single-file markup**: sections are not split into per-section components
  because the runtime's scroll rig (`initCinema`, progress bar, nav fade, coin
  fade) is one system spanning all sections via element ids. Splitting would not
  change output but was avoided to guarantee zero drift.
- **Coin faces are procedural**: the coin textures (logo + "t.") are drawn to a
  canvas at runtime in `initCoins()` — there is no coin image asset by design.
- **Teardown**: like the prototype, the runtime does not remove its window
  listeners on unmount. Mount the page once (it is a full-page experience).
- Everything exported as source — nothing was substituted with a build.
