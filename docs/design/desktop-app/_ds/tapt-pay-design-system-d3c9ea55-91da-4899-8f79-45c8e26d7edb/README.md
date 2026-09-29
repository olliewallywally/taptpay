# Tapt Pay Design System

**Tapt Pay** is a software-driven payment solution that replaces traditional EFTPOS hardware. It turns any mobile device or screen into a fully functional payment terminal.

## Sources

- `uploads/TaptPay-Info-Pack.pdf` — 12-page product info pack (extracted text)
- `uploads/logo.png` — master brand logo
- `uploads/terminal 3d.png` — merchant terminal app mockup
- `uploads/payment page.png` — customer payment page mockup
- `uploads/dashboard 3d.png` — merchant dashboard mockup
- `uploads/payment board 3d v2.png` — physical A5 payment board render
- Brand fonts provided: Larken (display serif — logo only), MADE Tommy (bold display sans), Plus Jakarta Sans (UI sans)

---

## Products

| Surface | Description |
|---|---|
| **Merchant Terminal App** | Mobile app for merchants to enter amounts, process payments, split bills, view payment history |
| **Customer Payment Page** | Web-based checkout shown to customers via QR/NFC scan — shows amount, merchant branding, Google Pay / Apple Pay / card |
| **Payment Boards** | Physical A5 boards with embedded QR + NFC; fully white-labeled; replace EFTPOS hardware |
| **Merchant Dashboard** | In-app analytics: live transactions, daily/weekly/monthly revenue, donut/bar charts, settings |

---

## CONTENT FUNDAMENTALS

### Voice & Tone
- **Lowercase everything** in UI copy — this is a strong brand signal. Buttons, labels, nav items, headings all use lowercase: `processing payment`, `split bill`, `cancel payment`, `enter card details`.
- **Direct and brief** — no filler. Every string earns its place.
- **First-person merchant** perspective in instructions: "sign up for free", "add your products", "set up your dashboard".
- **Confident simplicity** — the product is positioned as _obviously_ better than hardware. Copy avoids over-explaining; it assumes the reader is smart.
- **No jargon** where possible: "cancel payment" not "void transaction"; "split bill" not "partial authorisation".

### Casing Rules
| Context | Rule | Example |
|---|---|---|
| UI labels & buttons | lowercase | `processing payment` |
| Payment board signage | UPPERCASE | `SCAN · TAP` |
| Metric labels | Title Case | `Monthly Revenue` |
| Marketing copy | Sentence case | "No bulky terminals." |

### Emoji & Punctuation
- No emoji in UI. Clean, professional.
- Trailing period on logo wordmark: **taptpay.** — the period is part of the brand.
- Ampersands used colloquially in marketing: "scan & tap to pay".

### Key Phrases
- "no tech to go wrong"
- "simply scan or tap to pay"
- "throw out your old eftpos machine"
- "10¢ per transaction"
- "all software, no hardware"

---

## VISUAL FOUNDATIONS

### Color System
Two primary brand colors — cyan and blue — used with clear semantic intent:

| Role | Color | Hex |
|---|---|---|
| Brand / success / merchant UI | **Cyan** | `#3DFFD0` / `#00EFCB` |
| Customer-facing / payment / trust | **Blue** | `#1A6BFF` / `#1050D4` |
| Terminal screen background | Bright mint | `#3DFFD0` |
| Dark backgrounds | Near-black | `#0F0E0A` |
| Neutral surfaces | Warm sand | `#EDE9E0` / `#F7F5F0` |
| Error / toggle active | Red | `#FF3B4E` |

The cyan/mint is always the _merchant_ colour (what the operator sees). Blue is the _customer_ colour (what the payer sees). This dual-tone strategy creates an intuitive separation.

### Typography
Three font families, each with a distinct role:

| Font | Role | Usage |
|---|---|---|
| **Larken** | Display serif | **Logo lockup ONLY** — `tapt` (upright) + `pay.` (italic), both Black 900 |
| **MADE Tommy** | Bold display sans | Amounts, prominent numbers, section headers |
| **Plus Jakarta Sans** | Geometric UI sans | Body copy, labels, buttons, captions, inputs, data |

The logo is set entirely in **Larken Black** — `tapt` upright and `pay.` italic. Larken is reserved exclusively for the wordmark and never used elsewhere in the UI.

### Spacing & Layout
- 4px base grid
- Touch targets minimum **52px** height (pill buttons, nav items)
- Heavy use of full-bleed coloured sections (blue header → white/sand content below)
- Wavy SVG separators between coloured header and card content
- Cards are always **white or brand-coloured**, never translucent

### Corner Radii
| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 8px | Small chips, input fields |
| `--radius-md` | 12px | Icon containers |
| `--radius-lg` | 20px | Cards, modals, panels |
| `--radius-xl` | 28px | Large section containers |
| `--radius-pill` | 9999px | All CTA buttons, toggles, nav items |

Pill buttons are the **primary interaction paradigm** — almost every actionable element is pill-shaped.

### Shadows
- Cards use soft `box-shadow` only — no borders.
- Brand-tinted shadows on key cards: `rgba(0,239,203,0.35)` for cyan, `rgba(26,107,255,0.30)` for blue.
- Bottom nav sits on pure dark — no shadow, separated by subtle 1px border.

### Backgrounds & Surfaces
- **No gradients** — flat, bold, solid colour blocks.
- No background images or textures.
- Merchant terminal: fully mint/cyan full-bleed.
- Customer payment: deep blue card on sand/white background.
- Dashboard header: deep blue or near-black; content in warm sand `#F7F5F0`.

### Animations & Motion
- Fast, snappy transitions: `120–200ms`.
- `cubic-bezier(0.0, 0.0, 0.2, 1)` ease-out for elements entering.
- Toggle switches animate `left` position on knob + background colour.
- Processing states use a CSS `spin` animation on a bordered circle (no third-party loaders).
- Success state: brief checkmark reveal, then reset.

### Hover / Press States
- Buttons: opacity `0.85` on hover; slightly darker background on press.
- Interactive rows: subtle background tint (`rgba(0,0,0,0.03)`).
- No underlines except "Cancel payment" (intentionally styled as a link).

### Iconography
- Thin stroke SVG icons (stroke-width `1.6–1.8`), no fill.
- Circular icon buttons: blue `#1A6BFF` background, white stroke.
- Payment board uses outline-style icons in brand cyan on blue background.
- No icon font — all icons are inline SVG.
- No emoji in product UI.

### Cards
- White background, `border-radius: 20px`, soft shadow `0 4px 16px rgba(0,0,0,0.08)`.
- Metric cards come in three flavours: **white** (neutral data), **blue** (average/charts), **cyan** (revenue/highlight).
- No left-border accent cards. No colored outlines.

### Imagery
- 3D product renders used in marketing (provided assets).
- No photography in app UI.
- Wavy SVG dividers replace image hero sections.

---

## ICONOGRAPHY

- **Style**: Thin stroke inline SVG. Stroke width 1.6–1.8px. Rounded linecaps.
- **No icon library** — all icons are hand-crafted inline SVG for consistency.
- **Icon containers**: 34–48px circular pill, brand blue background for primary actions.
- **Payment board icons**: QR code + contactless wave, drawn with cyan stroke on blue background; uppercase labels beneath.
- **Bottom nav**: 5 items — Home, Stock, Terminal, Analytics, Settings. Active item in cyan `#00EFCB`, inactive in `#5C5850`.
- **No emoji** used anywhere in product UI.
- Key icons used: home/house, shopping bag, checkmark/terminal, line chart, settings gear, user, credit card, QR grid, contactless waves, plus, back-arrow, chevron.

---

## FILE INDEX

```
/
├── README.md                  — this file
├── SKILL.md                   — agent skill definition
├── colors_and_type.css        — all CSS design tokens + @font-face
├── assets/
│   ├── logo.png               — master brand logo (cyan on white)
│   ├── terminal-3d.png        — merchant terminal 3D render
│   ├── payment-page-3d.png    — customer payment page 3D render
│   ├── dashboard-3d.png       — dashboard 3D render
│   └── payment-board-3d.png   — A5 payment board 3D render
├── fonts/
│   ├── Larken*.otf            — display serif, logo only (6 weights)
│   ├── MADE_TOMMY*.otf        — bold display sans (7 weights)
│   └── PlusJakartaSans*.otf   — geometric UI sans (8 weights + italics)
├── preview/                   — Design System tab cards
│   ├── brand-logo.html
│   ├── brand-payment-board.html
│   ├── colors-brand.html
│   ├── colors-neutral.html
│   ├── colors-semantic.html
│   ├── type-scale.html
│   ├── type-families.html
│   ├── spacing-tokens.html
│   ├── spacing-radius-shadows.html
│   ├── components-buttons.html
│   ├── components-cards.html
│   ├── components-nav-toggle.html
│   └── components-terminal-elements.html
└── ui_kits/
    ├── terminal/index.html    — Merchant Terminal App (interactive)
    ├── checkout/index.html    — Customer Payment Page (interactive)
    └── dashboard/index.html   — Merchant Dashboard (interactive)
```
