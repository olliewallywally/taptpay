# TaptPay iOS App — Capacitor Build Guide

## Overview

TaptPay is wrapped as a native iOS app using Capacitor. The app loads from the live production URL (`https://taptpay.co.nz/app-login`), so **every Replit deployment instantly updates the app — no App Store re-submission needed for content or feature changes**.

App Store re-submissions are only required when updating native code (Swift plugins, entitlements, or Capacitor version bumps).

---

## Prerequisites

- macOS with Xcode 15+ installed
- Apple Developer account (enrolled in the Apple Developer Program)
- Node.js 22+ installed (required by Capacitor CLI v8)
- CocoaPods installed (`sudo gem install cocoapods`)

---

## One-Time Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Add the iOS platform

```bash
npx cap add ios
```

This creates the `ios/` directory with the Xcode project.

### 3. Sync Capacitor config and web assets

```bash
npx cap sync ios
```

This copies `capacitor.config.ts` settings and any bundled web assets into the Xcode project.

---

## Building and Running

### 4. Open in Xcode

```bash
npx cap open ios
```

### 5. Configure Signing in Xcode

1. Select the `App` target in the Project Navigator.
2. Go to **Signing & Capabilities**.
3. Set **Team** to your Apple Developer account.
4. Confirm **Bundle Identifier** is `nz.taptpay.app`.

### 6. Add Required Capabilities

In **Signing & Capabilities**, click **+ Capability** and add:

- **Near Field Communication Tag Reading** (for NFC flows)
- **ProximityReader** — required for **Tap to Pay on iPhone** (Paywave/Task #20). This requires Apple approval; apply at [developer.apple.com/contact/request/payment-hardware](https://developer.apple.com/contact/request/payment-hardware).

### 7. Build and run on a device or simulator

Select a connected iPhone or simulator and press **Run (⌘R)**.

---

## OTA Updates (No Re-Submission Required)

Because `server.url` in `capacitor.config.ts` points to `https://taptpay.co.nz/app-login`, the WebView always loads the latest deployed version from Replit. This means:

- UI changes, new features, and bug fixes ship instantly on the next Replit deploy.
- No App Store review cycle is needed for web-layer changes.
- Only native code changes (Swift, entitlements, Capacitor plugins) require a new App Store build.

---

## Updating the Production URL

If the production URL changes, update `capacitor.config.ts`:

```typescript
server: {
  url: "https://YOUR_DOMAIN/app-login",
  // ...
}
```

Then run `npx cap sync ios` and rebuild.

---

## App Store Guidelines Note

TaptPay is a point-of-sale tool that processes physical-world payments. Under **App Store Review Guideline 3.1.5(a)**, POS apps processing physical transactions are fully exempt from Apple's in-app purchase requirement. No StoreKit, no IAP — Apple billing is entirely absent from TaptPay's payment flows.

The **Subscription & Billing** section of merchant settings shows a redirect to `taptpay.co.nz` in the iOS app so that merchant billing (TaptPay's own fees) never goes through Apple.

---

## Project Config Reference

| Field | Value |
|---|---|
| `appId` | `nz.taptpay.app` |
| `appName` | `TaptPay` |
| `server.url` | `https://taptpay.co.nz/app-login` |
| `backgroundColor` | `#0055FF` |
| Capacitor version | see `package.json` |
| Config file | `capacitor.config.ts` |
| Web entry route | `/app-login` |
