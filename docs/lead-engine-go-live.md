# Lead engine — go-live checklist

The engine is built and dry-run-tested, but a few paths can only be verified with
real credentials. Work through these before turning on real outreach. Until then
everything runs in simulation (email logs instead of sends; AI falls back to
templates), so nothing leaks or costs money.

## 1. Database
The new tables auto-create on the next dev restart via `drizzle-kit push` (or run
`npm run db:push`). Migrations `0007`–`0010` record the same DDL. Confirm
`leads`, `lead_sources`, `suppressions`, `enrichment_cache`, `campaigns`,
`campaign_steps`, `campaign_enrollments`, `outreach_messages` exist.

## 2. AI personalization (Anthropic)
- Set `ANTHROPIC_API_KEY`. Optional: `LEAD_AI_MODEL` (default `claude-haiku-4-5`),
  `LEAD_AI_ENABLED=false` to force templates.
- Verify: in the cockpit, open a lead → **Generate**. The draft's model label should
  read the model id (not `template`). Confirm the subject/body parse cleanly. If the
  model ever returns prose around the JSON, the parser strips fences/braces and falls
  back to a template — watch the first ~10 drafts.
- Network: production egress must allow `api.anthropic.com`.

## 3. Cold email (separate sending identity)
- Set `OUTREACH_FROM_EMAIL` on a **separate domain/subdomain** (e.g.
  `hello@outreach.taptpay.co.nz`), plus `RESEND_API_KEY`. Optional:
  `OUTREACH_FROM_NAME`, `OUTREACH_SENDER_ADDRESS` (shown in the footer).
- Set up SPF/DKIM/DMARC on that domain and warm it up (start low; the campaign
  `dailyCap` throttles per campaign).
- Verify: create a campaign + one `template` step, enroll a test lead whose email you
  control, activate, trigger the cron (`POST /api/internal/cron` with the
  `x-cron-secret`). Confirm the email arrives, the footer unsubscribe link works, and
  the `List-Unsubscribe` header is present (one-click).
- `LEAD_OUTREACH_DRY_RUN=true` forces simulation even when configured.

## 4. Webhook (bounces/complaints)
- Set `OUTREACH_WEBHOOK_SECRET` to your Resend/Svix signing secret and point the
  provider's webhook at `POST /api/outreach/webhook`. **Without the secret the
  endpoint ignores all events** (it won't act on unsigned requests).
- Verify: send a provider test event; a bounced/complained address should appear in
  the suppression list and stop further sends on the next cron tick.

## 5. WhatsApp (optional)
- Uses the existing `EVOLUTION_*` config (same as rent reminders). Add a `whatsapp`
  step to a campaign; `LEAD_OUTREACH_DRY_RUN` and `isWhatsAppConfigured()` gate it.

## 6. NZBN sourcing (optional)
- Set `NZBN_API_KEY` (free from api.business.govt.nz). The response mapping is
  best-effort — verify the first search returns sensible business names/addresses and
  adjust `server/lead-engine/sources/nzbn.ts` if the live shape differs. Overpass
  needs no key and is the primary source.

## 7. Reply detection (not automated yet)
Inbound replies do **not** auto-pause sequences today — only bounces/complaints (via
the webhook) and a manual **"mark replied"** in the cockpit do. To automate, either:
- point your ESP's **inbound/reply parse** webhook at a new handler that calls
  `updateEnrollment(..., { status: "replied" })`, or
- poll the sending mailbox over **IMAP** and match replies to recent recipients.
Both need mailbox credentials, so they're left as a follow-up.

## 8. Scheduler
The outreach + conversion passes already run inside `POST /api/internal/cron`
(alongside the property passes). Ensure your existing cron caller hits it on the
cadence you want; the per-run cap is 100 enrollments and each campaign honours its
`dailyCap`.
