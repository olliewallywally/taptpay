---
title: Add custom TaptPay SVG as board builder template
---
# Add Custom TaptPay SVG Template to Board Builder

## What & Why
The merchant has provided a professionally-designed TaptPay A4 payment board SVG
(Google Drive: https://drive.google.com/file/d/16OTFqFpoJbNHlbJ9Bb-ku0tScrwoACtT/view?usp=sharing).
This SVG needs to be processed and added as a built-in template in the board builder
so merchants can use it with live QR injection, business name, and colour customisation.

The SVG is A4 portrait at print resolution (2480×3508, viewBox 0 0 2480 3508).
It has: TaptPay logo at the top, a left rounded box for the QR code, a right rounded
box for the NFC tap icon, scan/tap labels, a bottom "simply scan or tap to pay"
section, and Visa/Mastercard logos.

## Done looks like
- The board builder has a new layout option "TaptPay A4" that uses this SVG design
- The QR code is injected into the left rounded box (approximately x=340, y=1345, width=550, height=550)
- A merchant logo placeholder (`logo-placeholder`) is positioned in the top area above the boxes (approximately x=940, y=150, width=600, height=380)
- A business name text element (`text-business-name`) appears below the TaptPay brand mark (approximately x=1240, y=1080, text-anchor=middle)
- A tagline text element (`text-tagline`) sits just below the business name (approximately x=1240, y=1230)
- The "simply scan or tap to pay" text gets `id="text-instructions"` so merchants can customise it
- A footer text element (`text-footer`) is added at the very bottom of the bottom section
- The brand teal colour (#00f1d7) responds to the merchant's primary colour picker — the SVG CSS is updated to use a CSS custom property (`--primary`) and the existing `font-style` injection mechanism sets that variable on the SVG element
- The existing 4 generic preset templates remain; this becomes a 5th option labelled "TaptPay A4"
- The workflow port conflict is resolved so `npm run dev` starts cleanly after publishing

## Out of scope
- Letting merchants upload arbitrary SVG files (separate task #8)
- A4 landscape or A6 variants of this specific design
- Editing the NFC icon, payment logos, or any other fixed design elements

## Tasks
1. **Fetch and save the SVG** — Download the SVG from the Google Drive direct-download URL
   (`https://drive.google.com/uc?export=download&id=16OTFqFpoJbNHlbJ9Bb-ku0tScrwoACtT`)
   and save it to `client/public/templates/taptpay-a4-portrait.svg`.

2. **Add named placeholder elements** — Programmatically modify the saved SVG to:
   - Replace `<text id="QR.svg">` with `<image id="qr-placeholder" x="340" y="1345" width="550" height="550"/>`
   - Add `<image id="logo-placeholder" x="940" y="150" width="600" height="380"/>` before the background layers (so it renders above them) or after (above all content)
   - Add `<text id="text-business-name" class="cls-6" x="1240" y="1080"/>` for the business name
   - Add `<text id="text-tagline" class="cls-4" x="1240" y="1230" text-anchor="middle" font-size="110" fill="#666"/>` for the tagline
   - Add `id="text-instructions"` to the existing `simply_scan_or_tap_to_pay.svg` text element
   - Add `<text id="text-footer" class="cls-6" x="1240" y="3400" font-size="80" fill="#aaa"/>` in the bottom section
   - Add `<rect id="color-primary" width="0" height="0" fill="#00f1d7"/>` (invisible, just marks the brand colour for the picker default)

3. **CSS variable colour injection** — Update the SVG's `<style>` block to replace all hardcoded `#00f1d7` values with `var(--primary, #00f1d7)` for stroke and fill. Update `buildModifiedSvg` in `board-builder.tsx` to also inject `:root { --primary: ${primaryColor}; }` (or `svg { --primary: ${primaryColor}; }`) into the `font-style` element when a primary colour is set, so the brand colour updates live.

4. **Register as new layout option** — Add `"taptpay-a4-portrait"` to the `LAYOUTS` constant in `board-builder.tsx` with label "TaptPay A4", mmW=210, mmH=297, pxW=794, pxH=1123, aspect=297/210. The capture and PDF dimensions should use the standard A4 mm values, but the SVG viewBox will scale internally.

5. **Fix workflow port conflict** — The `npm run dev` server fails to start after the app is published due to a port 5000 conflict. Investigate and fix the startup script or port detection logic in `server/index.ts` so it starts cleanly in development after a deployment.

## Relevant files
- `client/src/pages/board-builder.tsx`
- `client/public/templates/a4-portrait.svg`
- `server/index.ts`