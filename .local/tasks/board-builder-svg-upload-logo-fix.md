# Board Builder SVG Upload + Logo Fix

## What & Why
Merchants want to upload their own SVG as a custom payment board template. The current built-in templates also have a logo placeholder issue: the "taptpay" text element in the SVG is the logo placeholder, but the current code tries to set it as an `<image>` element (via `setImg("logo-placeholder", …)`), so uploaded logos never appear. Both issues need to be fixed together.

## Done looks like
- When a merchant uploads a logo, it visibly replaces the "taptpay" text placeholder in the board preview and exported PDF
- The logo file picker explicitly accepts `.svg` files in addition to PNG/JPG so SVG logos can be selected in all browsers
- A new "Custom Template" option lets merchants upload their own SVG file as the active board layout
- Uploaded custom SVG templates respect the same colour, text, QR, and logo customisations as the built-in presets
- A note shows which named IDs were found in the uploaded SVG (e.g. "QR placeholder found", "Logo placeholder not found") so merchants know what will be auto-populated
- A "Use preset template" button reverts back to the built-in layout

## Out of scope
- Server-side storage or persistence of uploaded SVG templates
- Validating or sanitising SVG content beyond reading named element IDs
- Editing SVG content within the app

## Tasks
1. **Fix logo placeholder injection** — The "taptpay" text element in the built-in SVG templates is the logo placeholder. Update `buildModifiedSvg` so that when a logo is uploaded, it locates this element (by id or by text content "taptpay"), hides/removes it, and inserts an `<image>` element in its place at the same position and dimensions. If the element already has id `logo-placeholder` and is an `<image>`, continue using the existing `setImg` path.

2. **Fix logo file picker SVG support** — Update the logo upload `<input>` to explicitly accept `.svg` and `image/svg+xml` in addition to `image/*`.

3. **Add custom SVG template upload** — Add an SVG file picker in the Layout section. When a file is selected, read it with FileReader and store the raw SVG text as the active template state, replacing the fetched preset. Show which named IDs (`qr-placeholder`, `logo-placeholder`, `text-business-name`, `text-tagline`, `text-instructions`, `text-footer`, `color-primary`) were found vs missing.

4. **Revert to preset option** — When a custom template is active, show a "Use preset template" button that clears the custom SVG and reloads the selected preset layout.

## Relevant files
- `client/src/pages/board-builder.tsx`
