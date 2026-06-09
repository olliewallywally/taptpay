---
name: New landing page UI
description: Full set of TaptPay landing page section designs — hero, feature panels, app mockups, pricing, ecommerce plugin, mobile layout
---

## Design System
- **Background (light sections):** Light grey (#EBEBEB / #F0F0F0)
- **Background (dark sections):** Deep navy (#040D6D)
- **Headline colour:** Navy (#040D6D) on light, Sky blue (#58ABFF) on dark
- **Body text:** Navy on light bg
- **Accent/CTA:** Sky blue pills, outlined "learn more" buttons with navy border
- **App UI colours:** Navy header panel, sky blue large $ amounts, white body
- **Typography:** Bold lowercase for big section headlines, mixed-weight serif "taptpay." wordmark

---

## Sections & Assets

### 1. Hero (desktop)
`@assets/Artboard_1_1780997614919.png`
- Deep navy full-bleed bg
- "taptpay." centred in large sky-blue serif wordmark (note the trailing full stop)
- Subtitle: "multi-stack digital payment solution" — small, centered, sky blue
- Nav: home · products · services · pricing · about us · contact (top center, tiny)
- Bottom CTA: "what can i use tapt for?" + down chevron in sky blue

### 2. Hero (mobile)
`@assets/Artboard_3_1780997614919.png`
- Same navy bg, logo left-aligned
- Hamburger menu top-right (sky blue circle)
- "what can i use tapt for?" + chevron at bottom

### 3. Property Management panel
`@assets/Artboard_1_copy_1780997614919.png`
- Light grey bg
- Left: bold navy lowercase headline "property management", subtitle "automated rent & bill collection", outlined "learn more" button
- Right: PM terminal phone mockup (`@assets/PM_terminal_1780997597596.png`)

### 4. Invoicing & Collecting Payments panel
`@assets/Artboard_1_copy_2_1780997614918.png`
- Light grey bg
- Left: bold navy headline "Invoicing & Collecting Payments", subtitle "Quote, Invoice & collect payment digitally", "Perfect for" list: The Trades · Industries · Retail · Hospitality (sky blue, with > prefix), outlined "learn more"
- Right: PM terminal phone mockup

### 5. Send & Track Utilities & Bill Payments panel
`@assets/Artboard_1_copy_3_1780997614918.png`
- Light grey bg
- Left: "Send & Track Utilities & Bill Payments", subtitle "Easily send your tenant's utility bills & expenses"
- Bullets: Track payment links · Tenants can pay with digital wallet · Auto generated GST receipts
- Right: Bills terminal phone mockup (`@assets/Bills_terminal_1780997597595.png`)

### 6. Split Bill Feature panel
`@assets/Artboard_1_copy_4_1780997614918.png`
- Light grey bg
- Left: "Split Bill Feature", subtitle "Customers can now split the bill on their end without you lifting a finger"
- Bullets: Track payment links · Pay with digital wallet · Auto generated GST receipts
- Right: Split payment phone mockup (`@assets/split_payment_feature_1780997597596.png`)

### 7. Digital P.O.S & Eftpos System panel
`@assets/Artboard_1_copy_5_1780997614918.png`
- Light grey bg
- Left: "Digital P.O.S & Eftpos System", subtitle "throw out your old brick, tapt's digital p.o.s & eftpos system is perfect for collecting payments when your on the go"
- Bullets: Multi stack payment (unlimited at once) · Auto generated GST receipts · Live dashboard
- Right: Retail terminal phone mockup (`@assets/retail_terminal_1780997597596.png`)

### 8. Ecommerce Plugin panel
`@assets/Artboard_4_1780997614919.png`
- Deep navy full-bleed bg
- Left: "ecommerce plugin" in sky blue
- Right: abstract illustration — light grey rounded square containing a blue phone-shaped card

### 9. Pricing section
`@assets/Artboard_4_copy_1780997614919.png`
- Light grey bg
- Headline: "pricing" in navy
- Three placeholder grey pricing cards (content TBD — fill with actual plan details when building)

---

## App Screen Mockups (standalone)
| File | Screen |
|------|--------|
| `@assets/PM_terminal_1780997597596.png` | PM terminal — $6057 outstanding rent, rent requests list (Hone Reweti $650, Isla Murphy $150), + FAB, subbar tabs |
| `@assets/Bills_terminal_1780997597595.png` | Bills screen — $250 Isla Murphy, 16 Beach Rd; "bill" tab active; "what for" chips: water/utilities · late fee · cleaning · damages · other; description field; attach invoice; send bill CTA |
| `@assets/retail_terminal_1780997597596.png` | Retail terminal — $15 latte & muffin; paywave/boards tags; "tap send to share payment"; active stack list; subbar with send button |
| `@assets/split_payment_feature_1780997597596.png` | Split bill — $45.88 payment 1/2, total $91.76; split bill section, − 2 + counter, "enter amount", confirm button |

---

## Layout Pattern (feature panels)
All light-bg feature panels follow the same split layout:
- **Left ~55%:** headline (bold, navy, title-case or lowercase) + subtitle + optional bullet list ("> item" in sky blue) + outlined "learn more" pill button
- **Right ~45%:** phone mockup, slightly rotated or straight, drop shadow

**Why saved:** This is the full landing page design system the user wants to build. Use all assets and copy above when building the TaptPay marketing site.
