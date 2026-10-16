# TaptPay iOS build and acceptance

The Capacitor wrapper is configured to load https://taptpay.co.nz/app-login.
A web deployment changes that served content; it does not prove native binary,
redirect, App Store policy or device compatibility. Native dependency, entitlement
and capability changes require a reviewed signed build and appropriate release.

Use the exact Node version in `.nvmrc` and `npm ci`. This repository already has
an iOS project using Swift Package Manager. Do not recreate it with `cap add ios`
or assume the older CocoaPods/Xcode guide applies to the locked Capacitor version.
A macOS/Xcode environment meeting that version's actual requirements is needed
for a signed build; Linux synchronization is not Xcode/device evidence.

Run `npm run verify:build`, refresh the complete generated `client/public/app`
snapshot using the reviewed workflow, rebuild and verify `npm run verify:r7:artifacts`.
Then `npx cap sync ios` and `npm run verify:r7:artifacts -- --native` must prove
coherent web/native assets. Preserve source index/hash evidence and the full asset
rollover. Do not hand-edit hashed files or copy a recursive nested app directory.

Preserve HTTPS, cleartext=false and the exact Apple login and production Windcave
HPP navigation hosts in capacitor.config.ts. Cookie login and sessionStorage-bound
billing redirects need their approved WebView behavior. No wildcard host rule.

Tap to Pay, native wallet processing and attended POS are unavailable. Do not add
NFC/payment entitlements or enable a payment feature based on this wrapper alone.
See [R7 native release checks](docs/operations/r7-native-capability-release.md)
for actual iPhone/iPad/Safari/VoiceOver, redirect and provider acceptance gates.
