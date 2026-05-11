# Replace Landing Page Videos

## What & Why
Swap out the two hero videos on the landing page (desktop and mobile) for newly provided versions. The new clips are a slower, cleaner cut of the same content.

## Done looks like
- Desktop visitors see the new web video playing full-screen with no black bars and no cropping of important content.
- Mobile visitors see the new mobile video playing full-width with no black bars and the full frame visible.
- Mute/unmute button still works on both breakpoints.

## Out of scope
- Any other changes to the landing page layout or copy.

## Tasks
1. **Swap video imports** — Replace the two `@assets/` import paths in the landing page hero section with the new web and mobile video files provided by the user.
2. **Verify display** — Confirm the desktop video uses `object-cover` so it fills the container edge-to-edge with no black bars, and the mobile video uses `h-auto` so the full frame is shown without cropping or bars.

## Relevant files
- `client/src/pages/landing-page.tsx:13-14,250-296`
