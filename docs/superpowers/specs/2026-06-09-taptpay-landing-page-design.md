# TaptPay Landing Page — Design Spec

**Date:** 2026-06-09
**Status:** Approved (brainstorming) — ready for implementation plan

## Goal

Rebuild the TaptPay marketing landing page to match the user's uploaded artboards. The
centerpiece is a **pinned, scroll-driven feature section** that cycles through five phone
mockups: as the user scrolls, the page does **not** visually scroll — the current phone +
text animate out and the next animate in, all driven by scroll progress. Only after the
section has cycled through all five panels does the page release and scroll onward to the
next section.

## Key decisions (locked)

- **Scroll mechanic:** Pinned progress-scroll (sticky container + single `scrollYProgress`).
  NOT wheel-hijacking and NOT a timer carousel. One continuous progress value drives all
  transitions, so trackpad/wheel/touch feel native and the user can never get "stuck." A
  fast flick scrolls through several phones quickly (continuous, not one-panel-per-gesture).
- **Scope:** Full landing page — hero (desktop + mobile), the cycling feature section,
  ecommerce panel, pricing.
- **Existing page:** Replace `client/src/pages/landing-page.tsx` (old "Zero Hardware"
  design is removed). This remains the live landing route.
- **Transition feel:** Crossfade + vertical drift. Outgoing phone `opacity 1→0, y 0→-40px,
  blur 0→6px`; incoming `opacity 0→1, y +40→0`. Text mirrors the phone with an ~80ms
  stagger behind it. GPU-only (transform/opacity/filter).

## Design system (from memory: new-landing-page-ui)

- **Background (light sections):** light grey `#EBEBEB` / `#F0F0F0`
- **Background (dark sections):** deep navy `#040D6D`
- **Headline:** navy `#040D6D` on light; sky blue `#58ABFF` on dark
- **Body text:** navy on light bg
- **Accent/CTA:** sky-blue pills; outlined "learn more" buttons with navy border
- **App UI colours:** navy header panel, sky-blue large `$` amounts, white body
- **Typography:** bold lowercase for big section headlines; the `taptpay.` wordmark uses
  the `Logo_-_sky_blue_1780811546035.png` asset to match the artboard exactly.

## Architecture & files

```
client/src/components/landing/
  landing-data.ts      — palette tokens, nav items, feature-panel data, pricing data
  LandingNav.tsx       — fixed top nav (home·products·services·pricing·about·contact)
  Hero.tsx             — navy full-bleed; "taptpay." wordmark; desktop + mobile layouts
  FeatureScroll.tsx    — the pinned phone-cycling section (core)
  PhonePanel.tsx       — one text+phone panel, scroll-progress-driven
  EcommercePanel.tsx   — navy "ecommerce plugin" section
  Pricing.tsx          — light grey, 3 cards
client/src/pages/landing-page.tsx  — composes the above (replaces old file)
```

- **Stack:** existing `motion` (Framer Motion v12) — `useScroll`, `useTransform`,
  `useReducedMotion`. No new dependencies.
- Each component has one clear purpose, takes data via props / the shared `landing-data.ts`,
  and can be reasoned about independently.

## Core component: `FeatureScroll`

- Outer wrapper height ≈ `500vh` (≈ one 100vh scroll budget per panel × 5 panels).
- Inner container: `position: sticky; top: 0; height: 100vh; overflow: hidden`.
- A single `scrollYProgress` (0→1) from `useScroll({ target: wrapperRef, offset:
  ["start start", "end end"] })` drives everything.
- Each `PhonePanel` owns a **window** of progress (e.g. panel `i` of `N` centers on
  `(i + 0.5)/N`). Within its window the panel is fully visible; in the overlap zones it
  crossfades with its neighbour — continuous, not discrete steps. This continuity is what
  makes the motion liquid.
- Per-panel transforms derived from `scrollYProgress` via `useTransform`:
  - phone: `opacity`, `y`, `blur` as above
  - text: same curves, offset ~80ms-equivalent later in the window (slight progress lag)
- A slim vertical progress rail (labels `01`–`05`) fills as the user scrolls, signalling how
  much of the section remains.
- After the final panel's window completes, sticky releases naturally and the page scrolls
  to the ecommerce section.

## Panel content (5 phones)

| # | Headline | Subtitle / bullets | Phone asset |
|---|----------|--------------------|-------------|
| 1 | property management | automated rent & bill collection | `PM_terminal_1780997597596.png` |
| 2 | Invoicing & Collecting Payments | Quote, Invoice & collect payment digitally · Perfect for: The Trades / Industries / Retail / Hospitality | `PM_terminal_1780997597596.png` |
| 3 | Send & Track Utilities & Bill Payments | Track payment links · Tenants can pay with digital wallet · Auto generated GST receipts | `Bills_terminal_1780997597595.png` |
| 4 | Split Bill Feature | Customers can now split the bill on their end without you lifting a finger · Track payment links · Pay with digital wallet · Auto GST receipts | `split_payment_feature_1780997597596.png` |
| 5 | Digital P.O.S & Eftpos System | throw out your old brick — tapt's digital p.o.s & eftpos is perfect for collecting payments on the go · Multi-stack payment (unlimited at once) · Auto GST receipts · Live dashboard | `retail_terminal_1780997597596.png` |

**Per-panel layout:** left ~55% = headline (bold navy lowercase/title-case) + subtitle +
optional bullet list (`> item` in sky blue) + outlined "learn more" pill. Right ~45% = phone
mockup with drop shadow.

## Hero / Ecommerce / Pricing

- **Hero (`Hero.tsx`):** navy full-bleed. Centered sky-blue `taptpay.` wordmark + subtitle
  "multi-stack digital payment solution". Bottom CTA "what can i use tapt for?" + down
  chevron that smooth-scrolls into the feature section. Mobile variant: left-aligned logo,
  sky-blue hamburger top-right. Reference: `Artboard_1` (desktop), `Artboard_3` (mobile).
- **Ecommerce (`EcommercePanel.tsx`):** navy section, "ecommerce plugin" sky-blue headline +
  the abstract phone-card illustration. Reference: `Artboard_4`.
- **Pricing (`Pricing.tsx`):** light grey, "pricing" navy headline, three cards. Real plan
  details are **not** in the artboards → build the card structure with **placeholder plan
  copy clearly marked `TBD`** for the user to fill later.

## Mobile & accessibility

- The pinned mechanic is real scrolling (sticky positioning), so it works on touch without
  hijacking. Mobile panels stack text **above** phone, scaled down.
- `prefers-reduced-motion` (via `useReducedMotion`): skip pinning entirely — render the five
  panels as normal stacked static sections. Fully readable, no motion.

## Out of scope

- Real pricing numbers / plan details (placeholders marked TBD).
- Copy polish beyond what the artboards specify.
- Backend / CTA wiring — buttons are visual or smooth-scroll only for this pass.

## Success criteria

- Scrolling into the feature section pins it; the five phones + text crossfade-drift through
  in order without the page visually scrolling; page releases after the fifth.
- Native feel on trackpad, wheel, and touch; a fast flick advances multiple panels.
- Hero, ecommerce, and pricing sections render per the artboards.
- `prefers-reduced-motion` users get a stacked, static, readable fallback.
- No new dependencies; old landing page fully replaced; app builds.
