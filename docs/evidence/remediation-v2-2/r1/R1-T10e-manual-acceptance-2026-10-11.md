# R1-T10e / T10f manual acceptance — pending

No item below is signed off by automated Chromium or Jest results. Record the
reviewer, date, exact commit/build, browser/OS/device, input mode, surface, outcome
and retained evidence for each check. Use the complete 51-surface matrix and all
20 tutorials/22 merchant contexts, including signed-out/admin/customer pages.

| Context | Size | Input |
| --- | --- | --- |
| Phone | 390 × 844 | Touch and keyboard where supported |
| Tablet | 1194 × 834 | Touch and keyboard |
| Desktop | 1440 × 900 | Keyboard and fine pointer |
| Short desktop | 1440 × 650 | Keyboard and fine pointer |

Keyboard-only: traverse every surface in logical order with Tab and Shift-Tab;
confirm a visible, unclipped focus indicator, scroll reachability and operable
controls. Check arrows in supported lists without stealing search/input cursor
keys. Open each dialog/menu using the keyboard; verify initial focus, modal
confinement, Escape, completion and return to its trigger. A route departure must
not move focus back into the old page. Include tutorial restart, ordinary steps,
fallback steps, responsive changes and Settings detail-to-list return.

Screen readers: check the supported mobile/desktop combinations (including actual
Safari/VoiceOver, plus the chosen desktop screen reader). Confirm names include
the control's visible label, useful descriptions, state changes, heading/landmark
structure, errors/status announcements, progress and modal background exclusion.
Inspect the retained experimental label/header/paragraph candidates manually;
financial amounts are not headings solely because they use a large font.

At actual **200% browser zoom/text enlargement**, confirm readable text and
reflow with no lost controls, overlap, clipped content or inaccessible scrolling.
Record the browser zoom setting and layout viewport. Device scale factor, CSS
transform/scale, pinch zoom or only changing viewport size cannot establish this
check. Exercise every matrix surface, active tutorials and dialogs.

Reduced motion: use the OS/browser preference, navigate routes/open dialogs/run
tutorials, and confirm useful updates without unwanted motion. Contrast: review
all retained automated failures and incomplete results, including focus indicators,
icons, disabled/selected states and text on images/transparent backgrounds. Target
geometry: inspect the retained crowded/small targets and approved touch dimensions
in every touch context, including short desktop controls if touch is supported.

Product acceptance: approve any concrete palette/geometry correction and subsequent
golden-image change before updating baselines. No approval or baseline update has
been inferred here. Native/provider/payment/message checks, broader release gates
and the final independent implementation review remain in their existing lanes.

Current status: **all manual checks and owner visual acceptance remain pending**.
