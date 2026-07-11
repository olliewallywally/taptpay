---
name: dev-server-single-instance
description: "Only ONE dev server may run on :5000; the Replit workflow does NOT auto-restart a dead process (supervisor loop added 2026-07-11); two servers → HMR token clash → runtime-error overlay"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 6e1994a2-ab44-499f-a89c-70d0de5c060a
---

The Replit workflow ("Start application" in `.replit`, `waitForPort=5000`) runs the single dev server (`npm run dev` → `tsx server/index.ts`). **CORRECTION 2026-07-11: the workflow does NOT auto-restart a dead process** — verified empirically: killed tsx, port 5000 stayed dead 5+ minutes until manually restarted. The earlier claim of auto-restart was wrong (the "restart" seen on 2026-07-11 was likely the user pressing Run). As of 2026-07-11 the workflow args wrap `npm run dev` in a `while true; do …; sleep 2; done` supervisor loop so crashes self-heal — takes effect the next time the user presses Run. See [[server-crash-hardening]] for why the process was dying at all.

Never run TWO dev servers: each Vite instance has its own HMR token; the client served by one fails the token check against the other's HMR WebSocket → `HTTP 400` on `ws://…/?token=…`, Vite falls back to malformed `ws://localhost:undefined` → `SyntaxError` caught by `@replit/vite-plugin-runtime-error-modal` → "runtime error plugin" overlay. Looks like "the app doesn't work" but is purely a dev-HMR artifact.

**How to apply:**
- To test, drive the server on `http://localhost:5000` (and the external `$REPLIT_DEV_DOMAIN`). Client edits hot-reload automatically.
- Server-file edits (`server/*.ts`) need a restart (`tsx` doesn't watch). Restart cleanly: kill the old one (careful: `pkill -f "tsx server/index.ts"` ALSO matches your own bash if the pattern is in your command line — use `pkill -f "tsx serve[r]/index.ts"`), then start exactly ONE (`pgrep -f "tsx serve[r]/index.ts" | wc -l` → must be 1). If the workflow supervisor loop is active, just kill and let it respawn.
- If Claude starts a stopgap `npm run dev` while the workflow is dead: pressing Run is safe — `startServerWithPortManagement` SIGTERMs whatever holds :5000 and takes over.
- Diagnose HMR: healthy client logs `[vite] connected`. Related: [[checkout-redesign-handoff]].
