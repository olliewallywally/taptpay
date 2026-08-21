---
name: no-new-status-colours
description: "Oliver's rule (2026-08-19): do not add red or green to the merchant UI, not even as a status colour, unless he asks for it"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 491f649c-7013-4f14-ac0c-0ba12c52338f
  modified: 2026-08-19T07:45:48.134Z
---

Said verbatim on 2026-08-19: *"you keep adding other colours, we arent doing that
dont add red or green even as a status unlesss i say so"*.

**Why:** the tablet/desktop merchant app is a single blue/navy palette, and status
reads from wording and the blue tints — not from a traffic-light scheme. Claude has
repeatedly reached for green-for-good / red-for-danger as if it were a neutral
default; it is not, and it accumulates one panel at a time. Phase 7's automation
panel is the example that triggered the rule: green "active" pills and red "cancel"
buttons that nothing asked for.

**How to apply:**
- Never introduce a new red/green/amber value in merchant UI. Convey state with
  wording, weight, opacity, or the existing blue tints.
- `client/src/desktop/pages/property-terminal.tsx` defines `GREEN` `#35D07F`,
  `RED` `#F0656C`, `AMBER` `#F0A34E`. These came with the **original** terminal
  build (`3e3b6c6`), so they are not all Claude's — do not rip out existing uses
  unprompted either. On 2026-08-19 Oliver scoped the cleanup to *"only what I'm
  touching now"*: the status dots, split badge and mark-paid tick stay.
- When a design genuinely seems to need a signal colour, ask before adding it.

Related: [[taptpay-design-language]].
