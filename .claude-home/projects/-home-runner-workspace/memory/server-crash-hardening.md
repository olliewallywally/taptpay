---
name: server-crash-hardening
description: "Root cause of 'app keeps crashing/timing out' (2026-07-11): unhandledRejection handler called process.exit + workflow never restarted the dead process; both fixed, uncommitted"
metadata:
  node_type: memory
  type: project
---

**Root cause of recurring "crashing or timing out" (found 2026-07-11, branch feat/property-dashboard-redesign):** two stacked defects —
1. `server/port-manager.ts` `setupGracefulShutdown` registered `process.on('unhandledRejection', … gracefulShutdown → process.exit)`. ANY unhandled async rejection anywhere in ~6800 lines of routes (flaky Neon query, Windcave fetch, webpush, etc.) killed the entire server.
2. The Replit workflow does NOT auto-restart a dead process (see [[dev-server-single-instance]]) → app stayed dead until Run pressed → webview timeouts.

**Fixes applied (uncommitted):**
- `port-manager.ts`: `unhandledRejection` now logs and NEVER exits; `uncaughtException` logs + stays alive in dev, exits only in production (autoscale replaces it).
- `server/index.ts` error middleware: removed `throw err` re-throw after responding; now guards `res.headersSent` and logs `[EXPRESS_ERROR]`.
- `.replit` "Start application" workflow args: `npm run dev` wrapped in `while true … sleep 2` supervisor loop (active after next Run press).

**Verified:** synthetic unhandled rejection against real `setupGracefulShutdown` harness → process survives (previously exited). `npm run check` green; app boots in ~2s; all routes render headlessly with no error overlay. Boot is fast — waitForPort timeout was NOT the issue; schema push at boot is opt-in via RUN_SCHEMA_PUSH.
