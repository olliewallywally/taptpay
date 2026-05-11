---
title: Payment Board Builder
---
# Payment Board Builder

## What & Why
Add a payment board builder tool so merchants can design a print-ready payment sign linked to their specific QR code / Tapt Stone. Because the board must include the merchant's real QR code, the page requires login. Once designed, the PDF is emailed to oliverleonard@taptpay.co.nz for printing.

This also serves as a marketing touchpoint — a section on the landing page promotes it and links to `/board-builder` (which then redirects to login if not authenticated).

## Done looks like
- The landing page has a new section promoting the board builder with a "Design Your Board" CTA.
- `/board-builder` is a protected route (redirects to `/login` with a return URL if not authenticated).
- The page is a two-panel editor:
  - **Left panel (controls)**:
    - **Stone/QR selector** — a dropdown populated from the merchant's Tapt Stones (fetched via existing `GET /api/merchants/:id/tapt-stones`). Selecting a stone updates the QR code shown in the live preview immediately.
    - **Layout picker** — 4 labelled cards: A4 Portrait, A4 Landscape, A6 Portrait, A6 Landscape. Selecting one loads the corresponding SVG template.
    - **Colour picker** — 6–8 preset colour swatches plus a hex code text input. The chosen colour is applied to the targeted colour elements in the SVG template (primary background or accent layer).
    - **Logo upload** — drag-and-drop or click file input (PNG/JPG/SVG). The uploaded image is composited into the designated logo area of the SVG preview.
    - **Text fields** — editable inputs that replace the text nodes in the SVG template: Business Name, Tagline, Payment Instructions, Footer Note.
    - **Font selector** — dropdown of 8–10 curated Google Fonts (loaded dynamically via Google Fonts API) plus an "Upload font" button accepting .ttf/.otf/.woff, applied via @font-face data URL.
  - **Right panel (live preview)** — the SVG template rendered inline, updated in real-time as any control changes. The QR placeholder element (id="qr-placeholder") is replaced with the selected stone's QR image. Preview is scaled to fit the panel while maintaining the correct paper ratio.
- **"Send to Print" flow**:
  - Two input fields: submitter's name and email.
  - Button captures the live preview at 2× resolution using html2canvas.
  - jsPDF wraps the captured image into a PDF at the correct paper dimensions (A4 = 210×297 mm, A6 = 105×148 mm; swapped for landscape).
  - POSTs `{ pdf: base64, businessName, submitterName, submitterEmail, stoneId, layout }` to `POST /api/board-builder/submit`.
  - Backend emails the PDF as a file attachment to oliverleonard@taptpay.co.nz with subject "New Payment Board — [Business Name] ([Layout])".
  - User sees a success confirmation.

## SVG template requirements
The 4 SVG files (one per layout) must contain these named elements so the builder can target them:
- `id="qr-placeholder"` — the `<image>` or `<rect>` element that will be replaced with the real QR code
- `id="color-primary"` — the element(s) whose fill is controlled by the colour picker (can be a `<rect>` background or group)
- `id="text-business-name"` — `<text>` node for business name
- `id="text-tagline"` — `<text>` node for tagline
- `id="text-instructions"` — `<text>` node for payment instructions
- `id="text-footer"` — `<text>` node for footer note
- `id="logo-placeholder"` — `<image>` element for the merchant logo

The SVG viewBox dimensions should match the paper size in mm at 1 unit = 1 mm (e.g. A4 Portrait: `viewBox="0 0 210 297"`).

## Out of scope
- Saving/loading designs between sessions.
- Multiple QR codes on a single board.
- Ordering physical prints through the platform.
- Admin review workflow beyond the email.

## Tasks
1. **Install dependencies** — Add `jspdf` and `html2canvas` as frontend dependencies via the package manager.

2. **SVG template assets** — Place the 4 SVG template files in `client/public/templates/` (e.g. `a4-portrait.svg`, `a4-landscape.svg`, `a6-portrait.svg`, `a6-landscape.svg`) once provided by the user. Until then, create simple placeholder SVGs with all the required named elements in the correct positions.

3. **Board builder page** — Create `client/src/pages/board-builder.tsx`. Fetch the authenticated merchant's Tapt Stones from `GET /api/merchants/:id/tapt-stones`. Render the two-panel layout with all controls. Load the selected SVG template, inject the real QR code image into `#qr-placeholder`, apply colour to `#color-primary`, update text nodes, composite the uploaded logo, and apply the selected font — all live via React state.

4. **PDF generation** — Wire the "Send to Print" button to capture the preview div with html2canvas at 2× scale, build a jsPDF document at the correct paper dimensions, embed the captured image, and base64-encode the result ready to POST.

5. **Backend submit route** — Add `POST /api/board-builder/submit` to `server/routes.ts` (no auth required on the endpoint itself — the PDF is already built on the client). Add `sendBoardBuilderEmail` to `server/email-service-multi.ts` that sends to oliverleonard@taptpay.co.nz with the PDF as a nodemailer attachment.

6. **Register route and landing page section** — Register `/board-builder` in `client/src/App.tsx` as a protected route. Add a `BoardBuilderSection` component to `client/src/pages/landing-page.tsx` (placed between the features and pricing sections) with a brief description and "Design Your Board" CTA.

## Relevant files
- `client/src/App.tsx`
- `client/src/pages/landing-page.tsx`
- `server/routes.ts`
- `server/email-service-multi.ts`
- `shared/schema.ts:371-380`