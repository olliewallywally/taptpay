# Review — mobile 44px control inventory and phase-5 rulings

Date: 2026-08-24
Source: `scripts/inventory-44px.json` captured at 390×844
Plan: `docs/PLAN-2026-08-17-mobile-responsive-ui.md` §5.2–5.3
Status: reviewed; phase 5 may start from these rulings

## 1. Baseline

The capture covers 12 routes and 155 rendered controls. RC-1 changes the painted box of 99
controls. A total of 103 controls have an authored dimension below 44px; 18 of those sit under
a non-scrolling `overflow: hidden` ancestor. The unauthenticated smoke for `/`, `/login`,
`/signup`, and `/pay/:merchantId` was green before the rule changed.

`scripts/inventory-44px.json` is the evidence record. This document records the implementation
ruling; it does not duplicate all 4,482 lines of measured boxes.

## 2. Ruling vocabulary

| Ruling | Phase-5 treatment |
|---|---|
| **TAP** | Restore the authored painted box and add `.tap-target`; the effective hit region remains at least 44×44. |
| **OWNER** | Restore the authored box, but put the 44px hit region on the existing non-clipped parent/label because a pseudo-element on the control would be clipped or is unsupported. |
| **LOCAL-44** | Keep a component-scoped 44px minimum. Used only where the current 44px box is intentional form/action geometry, not as an app-wide element rule. |
| **NATIVE** | Remove the global override and leave native/component sizing alone; the control already has a sufficiently large usable axis and does not need a synthetic 44×44 square. |

## 3. Per-family rulings

| Routes / controls | Count | Ruling | Reason |
|---|---:|---|---|
| Three terminals: `.tp-pill`, stack expander, `.tp-subbar-btn` | 15 | TAP | These are the primary RC-1 regression: their visual heights must return to 23–27px while retaining a larger hit region. |
| Retail terminal unnamed 36×36 row action | 1 | TAP | Preserve its compact row geometry and identify it by its owning component before editing; do not target anonymous buttons globally. |
| Three terminals: `.tp-send` and property split shortcut | 4 | OWNER | Their slots animate with `overflow: hidden`; a child pseudo-element would be clipped. The slot owns the hit region only while expanded. |
| Bottom navigation: menu and five destinations on seven captured merchant routes | 42 | OWNER | The dock already owns spacing and hit testing. Keep the icon/button geometry and make each dock slot at least 44×44; do not grow the whole dock. |
| Property home filters and `rent requests` selector | 6 | TAP | Scrollable filter rails may clip offscreen content by design; each visible chip keeps a 44px effective target. |
| Dashboard report export and four period chips | 5 | TAP | Compact pills are deliberate visual geometry. |
| Transactions four period chips and export link | 5 | TAP | Same compact-pill treatment as dashboard. |
| Stock four sort chips | 4 | TAP | Restore the 29–31px chips and expand their hit regions. |
| Settings email/number fields | 2 | LOCAL-44 | Form fields remain 44px high through the field component, while the app-wide selector is removed. Keep `font-size: 16px` to prevent iOS focus zoom. |
| Settings switch | 1 | OWNER | Restore the 44×24 switch; its label/row owns the hit target. |
| Settings Save, Replace, Remove, Cancel subscription | 4 | LOCAL-44 | These sit in clipped cards. Their present 40–44px action boxes are intentional and must not depend on an escaping pseudo-element. |
| Onboarding text fields/select | 4 | LOCAL-44 | Keep accessible field height through the onboarding field class and retain 16px input text. |
| Landing `see it live` vertical control | 1 | NATIVE | Its authored box is 42.2×128px; the global rule changes only 1.8px of width and adds no meaningful accessibility. |
| Login Back and Merchant/Admin chips | 3 | TAP | Restore compact navigation/chip geometry and expand the hit region. |
| Signup Back and Sign in | 2 | TAP | Compact text actions need an expanded target. |
| Signup step indicators | 4 | TAP | They are already 52px tall but 41.6px wide; the hit target supplies the missing horizontal margin without changing the stepper. |

The grouped counts total 103. A phase-5 verifier must fail if the live inventory no longer
reconciles with that total before implementation; changed markup requires re-review rather
than silently inheriting a family ruling.

## 4. Phase-5 invariants

1. Delete both bare-element `min-height`/`min-width` rules from the 640px media block.
2. Preserve the mobile `font-size: 16px` rule for fields.
3. `.tap-target` must not change the painted box or document flow.
4. A `.tap-target` pseudo-element may not be used below a non-scrolling clipping ancestor.
5. Adjacent expanded regions must not steal the centre point of another control.
6. Every control centre must hit-test to that control or its explicit OWNER wrapper.
7. `/`, `/login`, `/signup`, and `/pay/:merchantId` must retain their pre-change smoke result.
8. Tablet/desktop geometry and the customer payment route remain no-regression boundaries.

## 5. Stop conditions

Stop and report rather than improvising if a control cannot meet the effective target without
overlap, if an OWNER wrapper changes keyboard semantics, or if retaining 44px locally causes a
golden change outside the affected component.
