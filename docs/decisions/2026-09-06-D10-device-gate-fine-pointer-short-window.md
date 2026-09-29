# D10 — fine-pointer short window is desktop/tablet, never phone

Date: 2026-09-06
Status: accepted
Owner: Oliver (owner decision, locked in the 2026-08-31 full integration plan)
Task: R1-H1

## Decision

A fine-pointer (non-touch) viewport at desktop width (≥1024px) is desktop UI
regardless of window height. `classifyDevice(1440, 650, false)` returns
`"desktop"`, not `"mobile"`.

## Defect

`client/src/hooks/use-device-class.ts`'s `classifyDevice` classified any
viewport with `Math.min(width, height) < 700` as `"mobile"`, with no pointer
gate on that clause. A desktop browser window resized short (1440×650 is a
common laptop-with-toolbars height) fell into that check purely on height and
was served the phone UI.

## Fix

The short-side mobile check is now skipped when the pointer is fine AND the
width already qualifies as desktop-class (≥1024px) — that combination can
only be a resized desktop/laptop browser, never a phone. Touch-driven
classification is untouched: `hasCoarsePointer && width < 768` still returns
`"mobile"` unconditionally, and the short-side check still applies to narrow
fine-pointer windows (e.g. 390×844 stays `"mobile"` — a 390px-wide window,
mouse or not, cannot fit desktop chrome).

```
wideFinePointer = !hasCoarsePointer && width >= 1024
mobile if (hasCoarsePointer && width < 768)
        or (!wideFinePointer && min(width, height) < 700)
```

## Regression coverage

`client/src/__tests__/use-device-class.test.tsx` — the `[1440, 650, false]`
case was flipped from an asserted `"mobile"` (the bug, previously encoded as
correct) to a failing-then-fixed `"desktop"` assertion. All nine other cases
in that table are unchanged and still pass, including narrow fine-pointer
390×844/844×390 (still `"mobile"`) and all touch-pointer cases.

## Scope note

This changes classification for wide-short fine-pointer viewports only. It
does not touch touch/coarse-pointer classification (genuine phone/tablet
behavior), and does not touch narrow fine-pointer windows below 1024px wide.
