# R1-T10 real-device acceptance

The owner has an iPhone 12 and needs a development test URL. Chromium on Linux
cannot produce Safari/VoiceOver or actual iPad acceptance. No such outcome is
inferred from emulator or unit-test results.

## Isolated preview in the Replit development workspace

Use the development workspace, not the deployed app. Preserve any uncommitted
work before switching branches. Obtain the published candidate branch
`fix/qwen-aligned-20261010`; the
[current handover](../HANDOFF-2026-10-12-r1-t10-terminal-followup.md) records its
exact implementation commit and final source/build hashes. Check the branch and
commit before building; an earlier preview does not establish the new repairs.
Stop only the workspace's existing development Run process before using port 5000.

Build a separate client and run the synthetic acceptance mode:

```bash
npx vite build --outDir /tmp/taptpay-acceptance-client
node --import tsx scripts/verify-r1-t10-device-matrix.ts \
  /tmp/taptpay-acceptance-preview /tmp/taptpay-acceptance-client \
  --manual-preview --preview-origin "https://${REPLIT_DEV_DOMAIN:?Run this in the Replit development shell}" \
  --preview-port 5000
```

Replit normally supplies `REPLIT_DEV_DOMAIN` in its development shell. Open the
workspace's Webview in a new tab, then copy its HTTPS URL to the iPhone and append
`/__acceptance`. If that variable is unavailable, replace the origin argument
with the exact HTTPS hostname from that new tab, without a trailing slash/path.
The preview page lists the synthetic account logins,
the available matrix routes and the built index SHA256. Copy that SHA into the
acceptance record. Restart after two hours if needed; all fixtures/session/tutorial
state are memory-only and reset on restart. No browser installation is needed for
this mode; Node dependencies and openssl must be available.

The preview strips ambient application credentials, uses the matrix's isolated
in-memory storage and synthetic provider-disabled configuration, and denies
business submissions. Only sign-in/out and synthetic tutorial-progress operations
are allowed to write. This is presentation/assistive-technology evidence, not real
provider, database, native-shell or production acceptance. Do not enter real card,
account or customer information. Do not save/send/pay/delete/download business data.

## iPhone 12 check, on the exact build

Record iOS/Safari version, device, date, build/index hash and tester. Use Safari,
portrait and landscape; document the actual layout rather than assuming emulator
classification. Keyboard checks below require a hardware keyboard where supported;
VoiceOver gestures separately establish touch/assistive-technology behavior.

1. At ordinary zoom, open login/signup/recovery, the three merchant verticals,
   Settings, stock, directories, analytics, a customer checkout/split/receipt and
   payment-return notice using the preview route list. Confirm readable content,
   visible and operable controls, useful errors and no lost controls/overlap.
2. Enable VoiceOver in Settings → Accessibility → VoiceOver. Use the rotor's
   headings/landmarks and swipe through controls. Confirm the primary label appears
   in each name, secondary amounts/statuses are announced, progress/state changes
   are clear, and the payment-return notice has a useful heading.
3. Open stock; expand emoji/variation controls and add/remove draft groups/options.
   Open Add tenant; add/remove a local subtenant. Open all report choices, presets,
   Custom dates and the client selector. Check labels, focus order, scroll reach,
   modal background exclusion and close/focus return. Claude owns the stock
   focus-guard review; link its result rather than signing it off here.
4. In Safari's page menu/website settings, set **Page Zoom to 200%**. Record the
   actual setting. Check every matrix surface, active tutorial and dialog for lost
   controls, clipped text, overlap and reachable scrolling. Pinch zoom is separate
   and does not establish this result. Reset Page Zoom after testing.
5. Rotate between portrait and landscape. Open the software keyboard in search,
   draft and date fields. Confirm active fields and close controls remain reachable
   with browser chrome visible and collapsed.
6. Enable Settings → Accessibility → Motion → Reduce Motion. Navigate routes,
   open dialogs and restart/complete tutorials. Check both CSS and JS/Canvas motion;
   loading/progress must remain understandable without unwanted movement.
7. With a keyboard, traverse forward/backward, operate list/tab arrows, open/close
   dialogs with Enter/Escape and check visible focus and return. With VoiceOver,
   verify the corresponding gestures and announced states. Do not submit business
   operations, which the preview deliberately blocks.

Run the complete 51-surface list and all 20 tutorials/22 merchant contexts; the short
list above organizes the checks and is not a substitute for the remaining routes.
Repeat the device lane on an actual supported iPad. An iPhone result cannot sign off
the iPad, desktop screen reader, owner visual/golden or independent-review lanes.

## Evidence record

For each route/state, record:

| Build/index hash | Date/tester | Device/OS/browser | Route/state | Zoom/input/preference | Outcome | Evidence/issue |
| --- | --- | --- | --- | --- | --- | --- |
| Pending | Pending | iPhone 12 / actual iOS | Pending | Pending | Pending | Pending |

Keep screenshots/recordings private and use only synthetic data. Forward the
completed record and issues to the engineering handover. None of these manual
checks is currently signed off by writing this procedure.
