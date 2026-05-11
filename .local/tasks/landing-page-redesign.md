# Landing Page Redesign — Arkitect Style

## What & Why
Redesign the TaptPay landing page to match the visual design language of the Arkitect Framer template (https://arkitect-template.framer.website/). All existing TaptPay content and branding colours are kept; what changes is the layout system, scroll behaviour, text interactions, and visual assets. The result should feel premium and distinct from generic fintech landing pages.

## Colour Palette
- `#000a36` — deep navy, page background behind all cards
- `#0055ff` — blue, primary accent (buttons, highlights, card backgrounds)
- `#00f1d7` — cyan, secondary accent (borders, glows, hover states, text highlights)
- White — body text on dark cards

## 3D Mockup Images (use across feature sections)
- `@assets/dashboard_3d_1774258691269.png` — dashboard screen in 3D phone mockup
- `@assets/payment_page_1774258691269.png` — payment/checkout screen in 3D phone mockup
- `@assets/terminal_3d_1774258691270.png` — terminal screen in 3D phone mockup

These should be used as visual illustrations within the stacked section cards — e.g. dashboard mockup in the Features section, payment mockup in the Customer Experience section, terminal mockup in the Terminal Features section. Each image has a transparent/black background and can sit on dark card backgrounds naturally.

## Done looks like

### Hero Video Section
- A dedicated full-width video card sits prominently on the page (either as the hero or directly below it as its own stacked card)
- **Desktop** shows `welcome_to_tapt_-_web_1774258447902.mp4`, **mobile** shows `welcome_to_tapt_-_mobile_clean_version_1774258466021.mp4` — switched via responsive conditional rendering
- Video plays on loop, fills the card edge-to-edge with `object-fit: cover`
- Sound is on — video starts muted with a speaker icon overlay in the corner; clicking it unmutes for the session (browser autoplay policy requires starting muted)
- Video files copied to `client/public/videos/`

### Stacked Card Scroll Effect
- Every section is wrapped in a rounded card container (`border-radius: 24px`)
- Each card uses `position: sticky; top: 0` so as the user scrolls, the next card slides up and covers the previous one
- Cards sit on top of the `#000a36` deep navy page background
- Cards use dark-but-slightly-lifted backgrounds (e.g. `#050d40` or `#0a1245`) with the `#0055ff` and `#00f1d7` accents used for highlights, borders, and CTAs
- Subtle drop shadows reinforce card depth

### Slot Machine Text Hover Effect
- All major headings have a character-scramble hover animation: letters rapidly cycle through random characters then resolve left-to-right to the real text
- Implemented as a reusable `useScrambleText` hook applied via a wrapper component
- On mobile, triggers on first view (intersection observer) since there is no hover

### Visual Design
- Page background: `#000a36`
- Section cards: dark navy variants, lifted slightly from background
- Headings: white, large, `font-light` / `font-extralight` (Outfit font, unchanged)
- Accent colour `#00f1d7` used for: borders, glow effects, highlighted words, icon colours
- Accent colour `#0055ff` used for: CTA buttons, card backgrounds in highlight sections
- Nav: transparent over the `#000a36` background, `#00f1d7` CTA button

### 3D Mockup Placement
- **Features section card**: dashboard mockup (`dashboard_3d`) alongside feature bullet points
- **Customer Experience / How It Works card**: payment page mockup (`payment_page`)
- **Terminal Features card**: terminal mockup (`terminal_3d`)
- Images displayed at natural angle (already 3D-tilted in the asset), no additional CSS transforms needed

### Responsiveness
- Desktop video → mobile video at `md` breakpoint
- Cards remain rounded and stacked on mobile (scroll effect stays)
- Mockup images resize gracefully on small screens

## Out of scope
- Changing TaptPay content, copy, or pricing
- Replacing the font (Outfit stays)
- Redesigning inner app pages

## Tasks
1. **Video assets** — Copy both video files into `client/public/videos/`. Build the video section card with desktop/mobile source switching, loop, and an unmute toggle button.

2. **Stacked card layout** — Refactor all sections into sticky rounded card wrappers with `#000a36` page background and layered z-index so cards stack correctly on scroll.

3. **Scramble text hook** — Build `useScrambleText` hook and apply to all major section headings. Trigger on hover (desktop) and on scroll into view (mobile).

4. **Visual restyling** — Apply the colour palette (`#000a36`, `#0055ff`, `#00f1d7`) across all cards, typography, nav, buttons, and borders.

5. **3D mockup integration** — Place the three phone mockup images into their respective section cards as primary visual assets, sized and positioned to complement the text content.

6. **Polish** — Fine-tune shadows, transitions, card entrance animations, and overall page flow.

## Relevant files
- `client/src/pages/landing-page.tsx`
- `client/src/index.css`
- `client/src/App.tsx`
- `attached_assets/welcome_to_tapt_-_web_1774258447902.mp4`
- `attached_assets/welcome_to_tapt_-_mobile_clean_version_1774258466021.mp4`
- `attached_assets/dashboard_3d_1774258691269.png`
- `attached_assets/payment_page_1774258691269.png`
- `attached_assets/terminal_3d_1774258691270.png`
