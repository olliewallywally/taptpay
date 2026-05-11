# Stock Page Card Grid Layout

  ## What & Why
  The stock management page currently shows products as full-width list rows. The user wants a nicer grid of card/cube items — 2 columns on mobile, 3 on larger screens — so the page feels more like a product catalogue than a plain list.

  ## Done looks like
  - Products display in a 2-column grid on mobile, 3-column on tablet/desktop
  - Each card is roughly square, showing the product name prominently, price in blue, and a subtle description below
  - Tapping/clicking a card still opens the edit dialog (same behaviour as before)
  - The "Add product" button, search bar, dialogs, and all other functionality are unchanged
  - Empty state and loading state are unchanged

  ## Out of scope
  - Changing the add/edit dialogs
  - Adding images or colour coding to cards
  - Any backend changes

  ## Tasks
  1. **Switch list to 2-col/3-col grid** — Change the product container from a vertical stack (space-y-3) to a CSS grid (grid-cols-2 on mobile, grid-cols-3 on sm+). Expand the page max-width slightly to accommodate three columns comfortably.

  2. **Redesign card layout for square cubes** — Restyle each product card to be more square and vertically centred: product name at the top, price in bold blue in the middle, optional description as small grey text below. Remove the ChevronRight arrow (not needed in a grid). Keep the rounded-2xl / white background / shadow style consistent with the rest of the app.

  ## Relevant files
  - `client/src/pages/stock-management.tsx:200-244`
  