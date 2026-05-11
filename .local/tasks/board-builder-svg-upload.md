# Board Builder SVG Upload Support

## What & Why
Merchants want to upload their own professionally-designed SVG as a custom payment board template. Currently only 4 built-in preset templates are available. Additionally, the logo upload file picker silently excludes SVG logos in some browsers because the `accept` attribute doesn't explicitly list the SVG MIME type.

## Done looks like
- The Logo section in the board builder has an updated file picker that explicitly accepts `.svg` files alongside PNG/JPG, so SVG logos can be uploaded in all browsers
- A new "Custom Template" option appears in the Layout section (or as a separate section), with an SVG file picker
- When a merchant uploads an SVG file, it becomes the active template — the same colour, text, QR code, and logo customisations are applied to it just as they are to the built-in templates
- A note is shown indicating which named element IDs were detected in the uploaded SVG (e.g. "QR placeholder found", "Logo placeholder not found") so merchants know what will be auto-populated vs what they need to design manually
- A "Revert to preset" button lets merchants go back to the built-in layout at any time
- The workflow port conflict is resolved so the app starts cleanly again

## Out of scope
- Server-side storage or persistence of uploaded SVG templates
- Validating or sanitising the SVG content beyond reading the named element IDs
- Editing the SVG content within the app

## Tasks
1. **Fix logo file picker SVG support** — Update the logo upload `<input>` to explicitly accept `.svg` and `image/svg+xml` in addition to `image/*`.

2. **Add custom SVG template upload** — Add an SVG file picker in the Layout section. When a file is selected, read it with FileReader and store the raw SVG text as the active template state, replacing the fetched preset. Show which named IDs (`qr-placeholder`, `logo-placeholder`, `text-business-name`, `text-tagline`, `text-instructions`, `text-footer`, `color-primary`) were found vs missing in the uploaded SVG.

3. **Revert to preset option** — When a custom template is active, show a "Use preset template" button that clears the custom SVG and reloads the selected preset layout.

4. **Fix workflow port conflict** — Investigate and resolve the port 5000 conflict that occurs after publishing, so `npm run dev` starts cleanly.

## Relevant files
- `client/src/pages/board-builder.tsx`
