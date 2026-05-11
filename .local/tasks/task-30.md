---
title: PWA home screen shows app splash instead of landing page
---
# PWA Standalone Splash Screen

  ## What & Why
  When someone adds TaptPay to their phone home screen (as a PWA), they currently see the full marketing landing page. Instead, they should see the same minimal app-like splash screen used by the iOS app: blue background, TaptPay logo, and a "Log in" button.

  ## Done looks like
  - Opening the PWA from a home screen icon shows the blue splash/login screen (not the landing page)
  - The "Log in" button on the splash screen navigates to the standard /login page
  - Opening the website normally in a browser still shows the landing page
  - No other routes or pages are affected

  ## Out of scope
  - Changing the design of the splash screen (the existing AppLogin page is used as-is)
  - Auto-redirecting already-logged-in users from the splash screen (future work)
  - Changing the iOS Capacitor app (this is PWA-only)

  ## Tasks
  1. **Detect standalone/PWA mode** — In App.tsx, detect whether the app is running as an installed PWA using window.matchMedia('(display-mode: standalone)').matches (Android/desktop) and (window.navigator as any).standalone === true (iOS Safari).

  2. **Render AppLogin for / in standalone mode** — When standalone mode is detected and the path is /, render the existing AppLogin component instead of LandingPage. No new pages or components needed.

  ## Relevant files
  - `client/src/App.tsx:168-178`
  - `client/src/pages/app-login.tsx`