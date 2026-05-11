---
title: Frontend performance: lazy loading & bundle splitting
---
# Frontend Performance: Lazy Loading & Bundle Splitting

## What & Why

The app currently imports all 30+ pages statically in App.tsx, meaning every user
downloads the JavaScript for pages like the merchant terminal (2047 lines), demo
terminal, checkout, settings, etc. on the very first visit — even if they only
ever see the landing page or login screen. Combined with no Vite chunk configuration,
this creates one large monolithic JS bundle that dramatically delays Time to
Interactive. This task adds code splitting, lazy loading, and a few quick wins to
cut initial load time significantly.

## Done looks like

- Navigating to `/` (landing page) or `/login` loads in noticeably less time
- Pages other than the critical path (landing, login, signup) are loaded
  on-demand as the user navigates to them
- Images below the fold (feature sections, terminal section) use lazy loading
  so they don't block the initial paint
- The landing page videos use `preload="none"` so they don't start downloading
  before the user scrolls to them
- TanStack Query staleTime is increased for stable data (merchant profile,
  analytics) so repeated page visits don't trigger unnecessary network round-trips
- The Vite build produces separate vendor chunk(s), keeping each JS file small
  for better browser caching

## Out of scope

- Image compression / format conversion (WebP) — separate work requiring image
  processing tools
- Server-side rendering or SSG
- Service worker pre-caching of JS chunks

## Tasks

1. **Route-level lazy loading** — Replace all static page imports in App.tsx with
   `React.lazy()` + `Suspense`, keeping only the landing page and login eager.
   Add a lightweight skeleton fallback so users see something immediately.

2. **Vite chunk splitting** — Add `build.rollupOptions.output.manualChunks` to
   vite.config.ts to split the vendor bundle (react, react-dom, framer-motion,
   tanstack-query, lucide, radix-ui) from app code so browsers can cache
   vendor JS independently of app updates.

3. **Image and video loading** — Add `loading="lazy"` to all `<img>` tags that
   are not in the above-the-fold viewport, and set `preload="none"` on both
   landing page video elements (desktop and mobile) so the 21MB video files
   don't begin downloading on page load.

4. **Query cache tuning** — In queryClient.ts, increase staleTime from 30s to
   5 minutes for the default query config, so stable data like merchant profile,
   analytics, and stock items don't re-fetch on every component mount.

## Relevant files

- `client/src/App.tsx`
- `vite.config.ts`
- `client/src/lib/queryClient.ts`
- `client/src/pages/landing-page.tsx:1-20`
- `client/src/components/FeaturesSection.tsx`
- `client/src/components/TerminalFeaturesSection.tsx`
- `client/src/components/CustomerExperienceSection.tsx`