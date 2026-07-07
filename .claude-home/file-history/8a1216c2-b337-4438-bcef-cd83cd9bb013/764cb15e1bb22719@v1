---
name: taptpay-design-language
description: "TaptPay landing page — accepted design came from the user's own PR"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 70cb57c9-ac48-4350-883f-fafbe3250dd2
---

**UPDATE 2026-06-21:** the user REJECTED the dark PR #2 page ("the shit one") and wants the **clean PR #1/#3 design** instead. That design = flat navy nav (`#000a36`), sky-blue logo, **white `StickyCard` sections** with scroll-driven `useScroll`/`useTransform` app-image **carousel** (`#0055ff` blue / `#00f1d7` accents, imports SEOHead + use-scramble-text + 14 `@assets`). PR #1 and PR #3 landing pages are byte-identical. Restored onto branch `fix/restore-landing-page` (commit 274846f, off main) — NOT yet merged to main. To fetch PR heads here (gh unauthenticated): `git fetch origin refs/pull/<n>/head:pr-<n>`.

Historical: the dark (`#060D1F`) animated mesh-gradient/NFC-ring page (`motion/react` LayoutGroup, self-injected CSS, no SEOHead) was PR #2, which the user once asked Claude to install verbatim — superseded as above.

**Earlier signals that turned out unreliable:** The user once said they wanted "simple, clean, minimalist, almost brutalist, no glow" and rejected a glassy/glowy landing page Claude built — but they then **rejected Claude's brutalist no-glow rebuild too** ("i hate it") and replaced it with their glow-heavy PR #2. So do not treat "no glow / brutalist" as a firm rule.

**Why:** The user has strong, specific visual taste and would rather hand Claude a finished design (a PR, a file) than have Claude design from a brief.
**How to apply:** For TaptPay landing/marketing UI, prefer implementing the user's concrete designs faithfully over generating new aesthetics. When they point to a PR/branch, fetch it (public PRs work via `https://github.com/<repo>/pull/<n>.diff` or `git fetch origin pull/<n>/head:<branch>` since `gh` is unauthenticated here) and replace as-is. Terminal palette reference still useful: navy `#040D6D`, sky-blue `#58ABFF`, off-white `#F4F4F4`, green `#1BBF85`.
