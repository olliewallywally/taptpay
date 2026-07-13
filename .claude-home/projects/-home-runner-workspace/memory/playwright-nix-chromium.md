---
name: playwright-nix-chromium
description: "Playwright's bundled chromium is broken in this env (missing libnspr4); launch with the nix-store chromium executablePath"
metadata: 
  node_type: memory
  type: reference
  originSessionId: c9d2317c-7d0c-4569-abe8-6b78546105d8
---

Playwright's downloaded `chromium_headless_shell` fails to launch here (`libnspr4.so: cannot open shared object file`). Use the system chromium instead:

```js
chromium.launch({ executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium' })
```

(If that hash disappears after an env rebuild, re-find with `ls /nix/store | grep chromium` or `which chromium`.) For authenticated browser tests, mint a JWT with `jsonwebtoken` (payload: userId/email/merchantId/role — merchant 22 is the seeded test account) and `addInitScript` it into `localStorage.authToken`.

**Secret gotcha (2026-07-12):** a real `JWT_SECRET` env var is now set on the running server, so the `dev-only-jwt-secret-not-for-production` fallback in `server/auth.ts` is NOT what verifies tokens — signing with it silently redirects to the login page. Read the live secret from the server process: `tr '\0' '\n' < /proc/<pid>/environ | grep '^JWT_SECRET='` (find pid via `ps aux | grep 'tsx server/index.ts'`), and sign with that. Playwright/jsonwebtoken live in the workspace `node_modules`, so run the script from `/home/runner/workspace`.
