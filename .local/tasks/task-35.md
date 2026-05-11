---
title: Server performance: gzip compression & faster startup
---
# Server Performance: Compression & Startup Speed

## What & Why

Two separate issues slow down every user interaction and every cold start:

1. **No gzip/brotli compression** — Express serves all JS, HTML, JSON and CSS
   uncompressed. A typical React app bundle compresses 60–70% with gzip, so
   a 500KB JS file downloads as 500KB instead of ~150KB. Adding the `compression`
   middleware is a single line change with a dramatic impact on download time.

2. **drizzle-kit push on every startup** — The server runs `npx drizzle-kit push`
   synchronously on every boot, which takes ~10 seconds before it can accept
   any traffic. This penalises every restart and every cold deploy. Schema should
   only be pushed when the schema actually changes (dev workflow) or via a
   separate deploy step — not on every production startup.

## Done looks like

- All API JSON responses, HTML, and JS assets are served with gzip compression,
  reducing payload sizes by ~60-70% for text-based assets
- Server startup completes in under 2 seconds instead of 10+ seconds — the
  10-second drizzle-kit push no longer runs automatically on every boot
- Schema migrations can still be run manually or as a separate deploy script
  when the schema actually changes (developer workflow preserved)
- No existing API behaviour or routes are affected

## Out of scope

- Brotli compression (would need a separate package; gzip covers all browsers)
- CDN or edge caching
- Database query optimisation

## Tasks

1. **Add gzip compression middleware** — Install the `compression` npm package
   and register it as the first middleware in server/index.ts before all routes,
   so all responses (HTML, JS, JSON, CSS) are compressed automatically. Set
   a threshold so very small responses (< 1KB) are not compressed.

2. **Guard the drizzle-kit push behind a flag** — Wrap the drizzle-kit push
   block in server/index.ts so it only runs when `NODE_ENV !== 'production'`
   or when a `RUN_MIGRATIONS=true` environment variable is explicitly set.
   Add a comment explaining how to run it manually when needed.

## Relevant files

- `server/index.ts:135-170`
- `package.json`