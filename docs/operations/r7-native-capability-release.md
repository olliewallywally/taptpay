# R7 native capability and acceptance checks

Tap to Pay remains locked off under D13. `FEATURE_TAP_TO_PAY=true` refuses
startup in every environment. A valid authenticated owned request to the retained
Tap endpoint receives `503 TAP_TO_PAY_DISABLED` without billing, sale, provider,
push or stream effects. Malformed/unauthenticated/foreign requests retain their
400/401/403 checks. Physical NFC tags that open QR payment links are separate.

There is no supported native payment plugin. Do not restore the removed global
bridge, timed Swift approval, simulated tokens, attended transport or placeholder
wallet components. Normal hosted card and wallet checkout remains supported
according to its existing gates. Enabling native Tap requires the separate
workstream in the master plan14.2, including durable server verification and UAT.

The Capacitor app still loads `https://taptpay.co.nz/app-login`, uses HTTPS and
keeps its existing orientation declarations. The only additional in-WebView host
is `appleid.apple.com`, needed by the existing same-browser Apple OAuth cookie
binding. Replit, broad Apple/subdomain and payment-provider wildcards are removed.
No new HPP/3DS host is guessed. Actual native sign-in, checkout redirects and
return navigation require the checks below before a native release.

## Reproduce the repository checks

Use the R7 handoff and exact branch/commit, then install the existing lockfile.
Keep test logs private. The checked-in `client/public/app` tree is a complete
generated snapshot; Vite copies it under `/app`, so deleting fake source alone
does not retire its compiled copy. Rebuild/replace that snapshot as one unit from
the root production output, excluding the root `app` subtree to avoid recursive
copies. Keep the original snapshot outside the repository until checks finish.
Then rebuild once more and verify:

```bash
npm run check
npm run test:r7:artifacts
npm run build
npm run verify:r7:artifacts
npx cap sync ios
node scripts/verify-r7-artifacts.mjs --native
```

The guard requires exact source-built file hashes, no unsupported payment
markers, and the reviewed generated native URL/navigation settings. The only
native additions allowed are Capacitor CLI's two exact zero-byte Cordova files.
It rejects altered/missing built files, nonempty compatibility files, symlinks
and all unexpected additions. Native public/config output is ignored by Git;
the CLI-managed Swift package metadata is tracked. Dependencies still come from
the unchanged npm lockfile. A successful sync is not an Xcode build.

For browser checks, use the existing isolated matrix with a frozen production
client directory. On this Linux workspace set
`PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium`. Run each of `phone`, `tablet`,
`desktop`, `desktop-short` with separate evidence directories:

```bash
node --import tsx scripts/verify-r1-t10-device-matrix.ts \
  /tmp/r7-pages /tmp/r7-frozen-client --context phone
node --import tsx scripts/verify-r1-t10-device-matrix.ts \
  /tmp/r7-tutorials /tmp/r7-frozen-client --context phone --tutorials
node --import tsx scripts/verify-r1-t10-device-matrix.ts \
  /tmp/r7-public /tmp/r7-frozen-client --context phone --payment-states
```

These run real app routes/cookie sessions on owned loopback HTTPS with synthetic
MemStorage data, simulated email, disabled provider configuration and blocked
outbound browser requests. Property/trades list reads use injected synthetic
storage fixtures. They prove browser presentation and route behavior, not live
database/provider/device behavior. No golden, tolerance, wait or error allowance
may be relaxed to obtain a pass. Retain the owner's property feed-under-dock
decision and D10 desktop behavior.

## External evidence still required

On a Mac, reproduce sync from the exact source/lock/build, resolve the generated
Swift package and build the real App target with Xcode. Record Xcode/macOS/SDK,
configuration, artifact/commit identifiers, signing and entitlement results; do
not infer any of these from Linux sync. Check the existing push registration,
permissions, file/share plugins and physical NFC link sharing. Tap controls must
remain absent even on iOS with a Capacitor proxy present.

Test Apple sign-in start/cancel/error/success and the returned cookie session;
other existing sign-in methods; HPP/3DS/hosted wallet redirects and return states;
back/forward, external links and relaunch. Confirm no arbitrary external site is
embedded in the authenticated WebView. Record approved provider hosts/behavior
from actual evidence before changing navigation again.

Use the existing [real-device checklist](r1-t10-real-device-acceptance.md) for the
owner's iPhone12 Safari/VoiceOver and a separately available iPad. Use the R7
branch/build in its isolated Replit preview instructions and record the displayed
index hash. No public test URL was created in this cloud workspace. Complete
owner visual/golden acceptance and independent review. Existing R3/R4/R5/R6 UAT,
restore, operational and release gates remain in force. No deployment, live
migration, native enablement or external acceptance is implied by this runbook.

Rollback source, generated web snapshot and managed native metadata together.
Keep D13 off. Do not run the old nondurable Tap path, change existing migration
history, or restart an owner's process as part of a browser verification run.
