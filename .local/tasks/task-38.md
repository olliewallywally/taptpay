---
title: Stock & analytics layout: blue bg + rounded white overlay + floating pill nav
---
# Stock & Analytics Layout Redesign

## What & Why

The stock (inventory) and analytics (dashboard) pages currently use a blue header bar with rounded bottom edges, sitting on a gray/white background. The user wants a new layout:

1. **Full blue background** — the entire page background is `#0055FF` (the same brand blue), so the blue section extends as far as the header content needs.
2. **White rounded-top overlay** — the white content area (product grid on stock, stat cards on dashboard) starts where the header ends and has large rounded top-left and top-right corners, like a bottom-sheet card overlaid on the blue.
3. **Floating pill nav bar** — the bottom navigation changes from a full-width rounded-top bar to a centered floating pill with `rounded-full`, gaps on the sides and bottom, and a drop shadow.

All existing content, functionality, data, and UI elements inside the pages remain identical — only the outer layout container and the nav bar shape change.

## Done looks like

- Both `/stock` and `/dashboard` show a blue background in the top portion and a white card with noticeably large rounded top corners (like `rounded-t-[40px]` or similar) sliding up from below
- The bottom nav bar is a floating pill — not edge-to-edge — centered horizontally with breathing room on the sides and a gap above the screen edge
- No content, stats, cards, search, or interactive elements are changed
- The pages still scroll normally, the white area extends to the bottom of the screen

## Out of scope

- Changing any content inside the pages (no card redesigns, data changes, etc.)
- Changing pages other than stock, dashboard, and the shared bottom nav
- Any backend changes

## Tasks

1. **Floating pill bottom nav** — Restyle `BottomNavigation` from a full-width `fixed bottom-0 left-0 right-0 rounded-t-[...]` bar to a floating pill: `fixed bottom-4 left-4 right-4 mx-auto max-w-sm` (or center with translate) with `rounded-full` on all sides and a shadow. Keep same icons, labels, active state colour, and `data-testid` attributes.

2. **Stock page layout** — In `stock-management.tsx`, change outer container background to `bg-[#0055FF]`, remove the `rounded-b-[60px]` decorative accent div, keep the header content (title, search, stats) directly on the blue background, and wrap the content section (sort toolbar + product grid) in a `bg-white rounded-t-[40px]` div that fills the rest of the screen. Adjust padding, z-index, and `pb-` spacing so the grid still clears the floating pill.

3. **Dashboard/Analytics page layout** — In `dashboard.tsx`, apply the same outer layout pattern: blue background wrapping the chart + title section, then a `bg-white rounded-t-[40px]` wrapper around the stat cards grid and total revenue block. Remove the `rounded-b-[60px]` decorative accent divs. Preserve loading state appearance.

## Relevant files

- `client/src/components/bottom-navigation.tsx`
- `client/src/pages/stock-management.tsx:501-684`
- `client/src/pages/dashboard.tsx:204-378`