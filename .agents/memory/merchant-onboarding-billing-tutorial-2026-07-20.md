---
name: Merchant onboarding, billing gate, crypto removal, and tutorial handoff
description: Durable 2026-07-20 handoff for the uncommitted merchant account flow, card prerequisite, crypto-payment removal, and first-visit tutorials
---

## Current state

The requested work is implemented and remains uncommitted on branch feat/property-dashboard-redesign at base HEAD 76ad41a. Do not reset the working tree.

The authoritative handoff is:

docs/HANDOFF-2026-07-20-onboarding-billing-tutorial.md

It records:

- the four-stage signup and Check your email flow;
- the verified-application email sent to oliver@taptpay.co.nz;
- removal of bank details from onboarding while retaining legacy columns safely;
- the Settings billing-card UI and server-side HTTP 402 payment-send gates;
- the important Windcave tokenisation/PCI limitation;
- product-facing crypto-payment removal and why Node's security crypto module must remain;
- all 20 page-by-page tutorial routes, persistence, dismissal, restart, accessibility, and race handling;
- migration 0010 and the separate need to verify billing columns in the deployment database;
- successful TypeScript, 12-test, build, diff, and Chromium verification;
- exact GitHub staging precautions.

## Git safety

Never stage .claude-home/** or .claude/settings.local.json as product work.

The client/public/app hash rollover must be staged as a complete add/delete pair if that generated deployment snapshot is intentionally published. npm run build updates dist/public, not client/public/app.

No commit or push has been performed.
