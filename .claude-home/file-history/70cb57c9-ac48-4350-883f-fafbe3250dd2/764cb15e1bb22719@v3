---
name: taptpay-design-language
description: "TaptPay landing page — accepted design came from the user's own PR"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 70cb57c9-ac48-4350-883f-fafbe3250dd2
---

The current TaptPay landing page (`client/src/pages/landing-page.tsx`) is the user's **own design from PR #2** (`olliewallywally/taptpay`), which they asked Claude to install verbatim. It is a dark (`#060D1F`), animated, panel-based hero with mesh-gradient orbs, an animated NFC ring "HeroVisual", and `motion/react` (`LayoutGroup`) transitions. It is self-contained (injects its own CSS via a `CSS` const + inline styles; no SEOHead, no `lp-*` classes).

**Earlier signals that turned out unreliable:** The user once said they wanted "simple, clean, minimalist, almost brutalist, no glow" and rejected a glassy/glowy landing page Claude built — but they then **rejected Claude's brutalist no-glow rebuild too** ("i hate it") and replaced it with their glow-heavy PR #2. So do not treat "no glow / brutalist" as a firm rule.

**Why:** The user has strong, specific visual taste and would rather hand Claude a finished design (a PR, a file) than have Claude design from a brief.
**How to apply:** For TaptPay landing/marketing UI, prefer implementing the user's concrete designs faithfully over generating new aesthetics. When they point to a PR/branch, fetch it (public PRs work via `https://github.com/<repo>/pull/<n>.diff` or `git fetch origin pull/<n>/head:<branch>` since `gh` is unauthenticated here) and replace as-is. Terminal palette reference still useful: navy `#040D6D`, sky-blue `#58ABFF`, off-white `#F4F4F4`, green `#1BBF85`.
