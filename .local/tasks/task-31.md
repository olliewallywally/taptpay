---
title: Fix push notifications failing to enable
---
# Fix Push Notifications Failing to Enable

  ## What & Why
  When a user enables push notifications, the browser asks for permission (which works), but then the subscription silently fails. The root cause is the service worker (sw.js) tries to cache /favicon.ico during its install step, but that file does not exist. When caches.addAll() gets a 404, the service worker install step throws and the SW never activates — so navigator.serviceWorker.ready never resolves for the subscription step.

  ## Done looks like
  - Enabling notifications in Settings succeeds without error
  - The toggle stays on after enabling
  - "Notifications enabled" toast appears
  - Push notifications are delivered on transaction updates

  ## Out of scope
  - Changing the notification design or content
  - APNs / iOS native push (separate system)

  ## Tasks
  1. **Fix service worker static asset cache** — In sw.js, remove /favicon.ico from STATIC_ASSETS (it doesn't exist) and replace with /icons/icon-192x192.png which does exist. This stops the install step from throwing on a 404.

  2. **Fix notification icon references** — Update the icon and badge paths in the push event handler in sw.js to use /icons/icon-192x192.png instead of /favicon.ico so displayed notifications show the correct TaptPay icon.

  ## Relevant files
  - `client/public/sw.js`