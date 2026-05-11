# Login Page Layout Polish

## What & Why
Three visual fixes to the login page following the screenshot review:
- The "Back" button sits on top of the blue card — it needs to live above the card with no overlap.
- The blue form section transitions to the cyan "more" bar with a flat/straight edge — it needs rounded bottom corners for a polished look.
- The card fills most of the screen width and height — shrinking it by ~15% adds breathing room on all screen sizes.

## Done looks like
- "Back" button is fully clear of the blue card, visible above it with no overlap on any screen size.
- The blue section has visible rounded corners at the bottom where it meets the cyan "more" strip.
- The entire card is noticeably smaller (~15% reduction), with visible space around it on both sides on mobile.
- The cyan "more" dropdown still expands, the buttons inside still work.

## Out of scope
- Any changes to form logic, validation, or auth flow.
- Other pages.

## Tasks
1. Move the back button outside the card into its own row above it — use a flex-column outer layout so card and button are in separate stacked elements.
2. Add rounded bottom corners to the blue form section div.
3. Reduce inner padding and constrain max-width to shrink the card by approximately 15%.

## Relevant files
`client/src/pages/login.tsx`
