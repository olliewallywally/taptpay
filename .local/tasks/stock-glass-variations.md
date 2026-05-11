# Stock Page: Liquid Glass Cards + Variations

  ## What & Why
  Redesign the stock management page with liquid glass cards in a 2-col (mobile) / 3-col (desktop) grid, add product variations (size, colour, custom with optional price modifiers), an emoji icon per product for quick identification, and replace the clunky ChevronRight row + separate edit dialog with a clean full-screen bottom-sheet style edit panel. Remove anything pointless; add only genuinely useful features.

  ## Done looks like
  - Products show as a 2-col mobile / 3-col desktop grid of square-ish liquid glass cards
  - Each card shows: emoji icon, product name (truncated cleanly, no overflow), price in blue — all text stays within card bounds
  - Cards have a frosted/liquid glass look: white/20 translucent background, backdrop-blur, subtle border, soft shadow on the blue/gray background
  - Tapping a card opens a full-detail bottom-sheet (modal) with:
    - Edit name, description, emoji, price fields
    - Variations section: add variation groups (Size, Colour, or Custom label) each with multiple options (label + optional price modifier, e.g. "+$2.00")
    - Delete button with confirmation
  - "Add product" FAB still works; add dialog also has emoji picker and variations support
  - Sort controls (A–Z, Price ↑↓) visible next to the search bar
  - Empty state and loading skeleton remain intact
  - All existing functionality (create, update, delete) preserved

  ## Out of scope
  - Stock quantity / inventory tracking (future work)
  - Product images (emoji is the visual identifier for now)
  - Any changes to how products appear on the terminal/payment screen (uses name + cost only)

  ## Tasks
  1. **Schema: add variations + emoji columns** — Add a `variations` jsonb column and an `emoji` text column (nullable) to the `stock_items` table in shared/schema.ts. Each variation is an array of `{ name, options: [{ label, priceModifier }] }`. Run db:push to sync.

  2. **Backend: pass through new fields** — Update the stock item create/update routes in server/routes.ts to accept and persist `emoji` and `variations`. No validation schema changes needed beyond accepting optional jsonb.

  3. **UI: liquid glass card grid** — Replace the vertical list in stock-management.tsx with a 2-col / 3-col grid. Each card uses backdrop-blur-md, white/20 bg, white/30 border, rounded-2xl. Display emoji (or a Package icon fallback), truncated product name (line-clamp-2), and price. No ChevronRight.

  4. **UI: product detail bottom sheet** — Replace the existing add/edit dialogs with a single sheet/modal that handles both add and edit. Include name, emoji picker (grid of common emojis), price, description, plus a Variations builder: add/remove variation groups, add/remove options within each group, set label and price modifier per option. Delete with inline confirm.

  5. **UI: sort controls** — Add A–Z / Z–A / Price ↑ / Price ↓ sort buttons next to the search bar (small pill toggles). Client-side sort only.

  ## Relevant files
  - `shared/schema.ts:425-434`
  - `server/routes.ts` (grep: stock-items)
  - `client/src/pages/stock-management.tsx`
  