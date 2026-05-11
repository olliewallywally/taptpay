---
title: Fix Google Pay HPP redirect (form submission bypass)
---
# Fix Google Pay HPP Redirect

## What & Why
The Windcave Hosted Fields SDK bypasses all existing navigation guards by creating hidden `<form>` elements and calling `.submit()` on them — a standard technique for payment SDK HPP fallback redirects. Native form submission does not touch `location.href`, `location.assign`, `location.replace`, `pushState`, `replaceState`, or `window.open`, so the current guard is completely blind to it.

This means: once the user has ever opened the card tab (loading the HF SDK), a subsequent Google Pay attempt can trigger the HF SDK's HPP fallback via a form submit that redirects the browser to `uat.windcave.com` or `sec.windcave.com`. The user ends up on Windcave's hosted payment page instead of completing Google Pay natively.

## Done looks like
- Tapping Google Pay never navigates the browser away from the checkout page to any Windcave domain
- If the HF SDK attempts a form-based redirect, it is silently blocked and the checkout page stays intact
- Card payment via Hosted Fields still works correctly (its own form submissions to non-Windcave URLs are not blocked)
- The guard works consistently in both dev and production (Chrome Android)

## Out of scope
- Changing how the Google Pay token is processed on the backend
- Fixing 3DS handling for Google Pay
- Changes to Apple Pay flow

## Tasks
1. **Add form submission interception to the redirect guard** — Override `HTMLFormElement.prototype.submit` to check if the form's `action` attribute matches the `WINDCAVE_HPP_RE` pattern, and if so block the submission and log a warning. Also add a `document.addEventListener('submit', ...)` listener as a backup that calls `event.preventDefault()` on Windcave-bound form submissions.

2. **Add MutationObserver to neutralise injected forms** — Observe `document.body` for newly added `<form>` nodes. If a form with a Windcave `action` is detected, immediately clear its `action` attribute so even a non-JS `.submit()` path cannot navigate away. This runs as soon as the checkout component mounts, alongside the existing guards.

3. **Prevent HF SDK from loading on non-iOS devices unless card tab is opened** — Currently the HF SDK guard relies on `cardOpen`. Verify that `hfInitialised.current` correctly prevents re-runs and that the guard is cleaned up properly on component unmount so a stale HF instance from a previous card-tab visit cannot fire after the user switches to Google Pay.

4. **Re-assert guards also cover `HTMLFormElement.prototype.submit`** — Include the form submit override in the existing 2-second re-assertion interval so the HF SDK cannot restore the original submit after being patched.

## Relevant files
- `client/src/pages/checkout.tsx:58-70,241-460,473-518`