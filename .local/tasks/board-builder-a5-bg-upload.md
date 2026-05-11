# Board Builder: A5-only sizes + background image upload

  ## What & Why

  Two focused improvements to the Payment Board Builder (`client/src/pages/board-builder.tsx`):

  1. **Remove A4 and A6 size options — keep A5 only.**
     The user only wants to offer A5 boards. A4 and A6 options clutter the Layout panel.

  2. **Add background image upload to the Colour section.**
     Merchants currently can only pick a solid colour for the board background. They want to upload a custom image (e.g. a branded design file) as the board background instead.

  ---

  ## Done looks like

  ### Sizes
  - The `LayoutKey` type and `LAYOUTS` object contain only `"taptpay-a5-portrait"` and `"taptpay-a5-landscape"` — A4 and A6 entries removed.
  - Default layout state changes from `"taptpay-a4-portrait"` → `"taptpay-a5-portrait"`.
  - The Layout section UI shows only Portrait / Landscape toggle (no size group labels needed since A5 is the only size). The "Recommended" badge moves to A5 Portrait.
  - The `useEffect` that clears business name specifically for A4 layouts is updated (since A4 no longer exists).
  - SVG template fetch still works: `/templates/taptpay-a5-portrait.svg` and `/templates/taptpay-a5-landscape.svg` — no server changes needed.

  ### Background image upload
  - New state: `backgroundImageDataUrl: string` (default `""`).
  - New upload handler `handleBgImageUpload` — reads the file as a data URL (same pattern as logo upload), stores in `backgroundImageDataUrl`.
  - `BuildSvgOpts` interface gains optional field `backgroundImageDataUrl?: string`.
  - `buildModifiedSvg` injects a full-bleed `<image>` element as the **first child of `<svg>`** (behind all other elements) when `backgroundImageDataUrl` is non-empty:
    ```xml
    <image id="bg-image" x="0" y="0" width="100%" height="100%" 
           preserveAspectRatio="xMidYMid slice" href="<dataUrl>" />
    ```
    When absent, background colour behaviour is unchanged.
  - In the **Colour → Background** sub-section UI, after the existing swatches/hex row, add:
    - A dashed upload area labelled "or upload a background image" (same style as Logo upload — `border-dashed`).
    - When an image is set: show a small thumbnail preview (max-h-10) with a "Remove" button, and add a note "Image overrides colour".
    - Clearing the image re-enables the colour swatches fully.
  - The `previewSvg` `useMemo` dependency array gains `backgroundImageDataUrl`.
  - Live preview updates immediately on upload.

  ### No backend changes
  Background images are data URLs kept in browser state only (identical pattern to the logo upload). No API or schema changes.

  ---

  ## Relevant files

  - `client/src/pages/board-builder.tsx` — all changes in this one file
    - Line 18: `LayoutKey` type
    - Lines 20–27: `LAYOUTS` object
    - Line 301: default layout state
    - Lines 358–365: A4-specific useEffect  
    - Lines 77–93: `BuildSvgOpts` interface
    - Lines 122–262: `buildModifiedSvg` function
    - Lines 304–305: background colour state (add backgroundImageDataUrl alongside)
    - Lines 639–668: Layout section UI
    - Lines 694–718: Background colour UI
  