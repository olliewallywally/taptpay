---
name: avoid-playwright-install-replit-nix
description: Do not install Playwright/Chromium or do heavy /nix scans in this Replit workspace — it crashes the snix-castore FUSE store
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 88870d7b-59e1-4928-995c-47863a293883
---

**HARD RULE (user-set, reaffirmed 2026-06-27, emphatic): never run anything that risks breaking the Nix environment in this Replit workspace. No exceptions, no "this should be fine" — when in doubt, don't run it; ask or skip.**

In this Replit workspace, `/nix/store` is served by **snix-castore over FUSE** (see `mount`). It is fragile under heavy I/O and will disconnect (`Transport endpoint is not connected`), which kills `node`, `git`, even `bash` once their cached processes need to re-exec — the whole environment goes down and only a **container reboot** restores it.

**Why:** On 2026-06-26 a request to visually verify a UI change led me to run `npx playwright install chromium` (extracts a ~150MB browser into the Nix cache) + `playwright install-deps` + full `find /nix/store` scans. That crashed the FUSE store and blocked the rest of the session.

**How to apply — banned here:** `npx playwright install*` / `playwright install-deps`; downloading or extracting any browser/large binary into the Nix cache; large `/nix/store` traversals (`find`/`grep -r`/`du` over `/nix`); installing system packages or anything that mass-writes to the store; bulk/recursive filesystem scans rooted near `/nix`. **Safe:** `tsc`/`npm run check`, vitest, curling the dev server, scoped reads/edits in the repo. For "run the app and screenshot" requests, a browser can't even launch (system libs like `libglib-2.0.so.0` are absent) — tell the user and skip the visual step rather than installing anything. See [[trades-phase3c-backup-state]].
