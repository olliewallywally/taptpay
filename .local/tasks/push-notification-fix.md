# Push Notification Toggle Fix

## What & Why
The notification toggle in Settings is supposed to let merchants enable push notifications to their phone's lock screen when a payment comes in. Currently the toggle does not work — clicking it either does nothing, throws a silent error, or subscribes without delivering any actual notifications.

## Done looks like
- Merchant opens Settings and sees the "Transaction Notifications" toggle
- Toggling it ON prompts the browser/device for notification permission, then activates successfully
- When a QR/NFC/card payment is completed, the merchant's phone receives a lock-screen push notification showing the amount and item name
- Toggling it OFF deactivates the subscription cleanly with no errors
- If the VAPID environment variables are missing, the toggle is disabled with a clear explanation rather than failing silently
- Works on both the web app and in the Capacitor iOS native app (note: Capacitor may need to use its own Local Notifications plugin if Web Push is not available in WKWebView)

## Out of scope
- Email notifications
- SMS notifications
- Changing the notification content or design

## Tasks
1. **Diagnose why the toggle fails** — Check whether `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are present as environment secrets; verify the service worker at `client/public/sw.js` is registering correctly; check for console errors during the subscribe flow in both browser and Capacitor iOS contexts.

2. **Generate and store VAPID keys** — If the keys are missing, generate a VAPID key pair using the `web-push` library and store them as environment secrets so the server can sign push payloads.

3. **Fix the subscription flow** — Resolve any errors in the `togglePushNotifications` function: correct the VAPID key fetch, ensure `pushManager.subscribe` is called with the right `applicationServerKey`, and handle permission-denied gracefully with a user-facing message.

4. **Capacitor / native iOS fallback** — In the iOS native app, `PushManager` may not be available inside WKWebView. Detect this case and use Capacitor's `@capacitor/push-notifications` plugin as a fallback so native iOS merchants still receive lock-screen notifications.

## Relevant files
- `client/src/pages/settings.tsx`
- `client/public/sw.js`
- `server/push.ts`
- `server/routes.ts`
- `shared/schema.ts`
