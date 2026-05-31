# WhatsApp delivery via Evolution API — integration plan

Goal: let a property manager deliver the rent payment link (and reminders / GST
invoices) over **WhatsApp** in addition to email, using the open-source
[Evolution API](https://github.com/evolution-foundation/evolution-api) as the
gateway. This is a plan only — no code is written yet.

It also closes the gap left by **H3** (delivery is currently email-only because
no SMS provider exists): WhatsApp becomes the real "non-email" channel.

> **Status (partially implemented).** The core seam is now in the codebase:
> `server/whatsapp-service.ts` (`isWhatsAppConfigured`, `normalizeNzPhone`,
> `sendWhatsApp`), channel-aware `deliverInvoice()` in `property-cron.ts` (used
> by dispatch, reminders and resend), and `"whatsapp"` in the channel enums.
> Set `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` / `EVOLUTION_INSTANCE` and a
> tenant with `preferredChannel: "whatsapp"` + a phone will be messaged on
> WhatsApp (falling back to email). **Still to do:** per-merchant instance
> onboarding/QR pairing, delivery/read webhooks, the opt-in checkbox + channel
> picker UI, and the Cloud-API-vs-Baileys production decision (§9).

---

## 1. What Evolution API is, and how we run it

Evolution API is a self-hosted REST gateway that talks to WhatsApp. It is
multi-instance (one "instance" ≈ one connected WhatsApp number), exposes a REST
API to send messages, and emits webhooks for delivery/read receipts and inbound
messages. The default transport is **Baileys** (the unofficial WhatsApp Web
protocol); it can also front the **official WhatsApp Cloud API** (see §9).

**Deployment (separate service, not in this repo's process):**
- Run it via Docker alongside the app (compose service or a small VM/container).
  It needs Postgres (or its bundled store) and Redis.
- Key env on the Evolution side: `AUTHENTICATION_API_KEY` (global admin key),
  database/redis URLs, and `WEBHOOK_GLOBAL_URL` pointing back at our app.
- Create one instance per merchant sending number:
  `POST /instance/create` → returns an instance name + token. Pair it by
  scanning the QR (`GET /instance/connect/:instance`) from the merchant's phone,
  or use a dedicated business number.
- Persist `{ instanceName, instanceToken, status }` per merchant (new columns or
  a `merchant_whatsapp` table).

**Our app never embeds WhatsApp creds in the client** — all calls are
server→Evolution with the API key/instance token held server-side.

---

## 2. Integration architecture in this codebase

Mirror the existing `email-service.ts` shape so the cron/resend paths don't care
which channel they use.

- **`server/whatsapp-service.ts`** (new):
  ```ts
  export async function sendWhatsApp(opts: {
    instance: string;           // merchant's instance name
    toPhone: string;            // E.164, e.g. +64211234567
    text: string;               // message body incl. the /r/:token link
  }): Promise<boolean>          // true on accepted (202/200) from Evolution
  ```
  Implementation: `POST {EVOLUTION_URL}/message/sendText/{instance}` with header
  `apikey: <instance or global token>`, body `{ number, text }`. Normalize the
  number to E.164 first; return false on non-2xx (so the caller can fall back).
- **Env:** `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`. A `isWhatsAppConfigured()`
  guard mirrors `isWindcaveConfigured()`; when unset, log-and-skip (like email
  in dev).

---

## 3. Channel plumbing (the small, surgical changes)

1. **Enums:** add `"whatsapp"` to the delivery/preferred-channel enums in
   `shared/schema.ts` (`tenantProfiles.preferredChannel`,
   `activeSchedules.deliveryChannel`, `invoicesRentRequests.deliveryChannel`,
   and the Zod schemas). Re-enable a channel picker in the tenant create/edit UI
   (email | whatsapp) — keep "sms" out until/unless an SMS provider lands.
2. **Tenant data:** require a valid `phone` (E.164) when `preferredChannel` is
   whatsapp; validate on tenant create/update.
3. **Delivery branch:** in `property-cron.ts` `deliverInvoiceEmail` →
   generalize to `deliverInvoice(invoice)` that switches on
   `invoice.deliveryChannel`:
   - `email` → existing `buildRentEmail` + `sendEmail`
   - `whatsapp` → `buildRentWhatsAppText` + `sendWhatsApp`
   Apply the same switch in the reminder pass and in
   `resendInvoiceEmail` (rename to `resendInvoice`).
4. **Fallback:** if the chosen channel is unconfigured or fails and an email
   exists, fall back to email; otherwise mark `dispatch_failed` (reuse the L4
   path).

The merchant-facing terminal already passes `deliveryChannel` through the send
flow, so no terminal change is required beyond surfacing WhatsApp as a tenant
preference.

---

## 4. Message templates

Short, link-first text (WhatsApp has no rich email layout):
```
Hi {firstName}, your rent of {amount} for {propertyAddress} is due {dueDate}.
Pay securely here: {baseUrl}/r/{token}
— {merchantName} via taptpay
```
Reminder and GST-receipt variants reuse the same builder with different copy.
(GST "invoice" over WhatsApp would be a text summary + link to a hosted/PDF copy
rather than the HTML email.)

---

## 5. Webhooks (status + inbound)

Add `POST /api/whatsapp/webhook` (verify a shared secret / the configured key):
- **Delivery/read receipts** (`messages.update`): map provider message id →
  invoice and log `Whatsapp_Delivered` / `Whatsapp_Read` transaction events; use
  this to drive the "sent/delivered" status dot in the terminal.
- **Inbound messages** (`messages.upsert`): optional — auto-reply with the
  payment link, or ignore. At minimum, capture opt-out keywords (STOP) to honor
  consent (§7).
Store the Evolution `message.id` on send so receipts can be correlated (e.g. a
`whatsappMessageId` column on the invoice, or a small delivery-log table).

---

## 6. Security

- API key + per-instance token stay server-side; the webhook validates the key
  and ideally a source-IP allowlist for the Evolution host.
- Treat inbound webhook payloads as untrusted; never reflect content into
  privileged actions.
- Per-merchant send rate limiting to avoid WhatsApp spam flags.
- Phone numbers are PII — log them masked.

---

## 7. Consent & compliance (do not skip)

WhatsApp prohibits unsolicited messaging. Before enabling WhatsApp for a tenant:
- Capture **explicit opt-in** (a checkbox at tenant setup: "tenant agreed to
  receive rent notices on WhatsApp"), stored with a timestamp.
- Honor opt-out (STOP) via the inbound webhook → flip the tenant back to email.
- Keep first contact transactional and link-bearing (rent due), not marketing.

---

## 8. Number formatting

Normalize every tenant phone to **E.164** (NZ default region `+64`, strip
leading 0). Reject/flag numbers that don't normalize at tenant-save time so we
never hand Evolution a bad number at send time.

---

## 9. The Baileys caveat & the official path

Evolution's default Baileys transport is **unofficial** — it logs in as WhatsApp
Web and can get the number **banned** for volume/spam, and it can break when
WhatsApp changes the protocol. Mitigations / options:
- Use a **dedicated business number** (not the manager's personal one), warm it
  up, keep volume low and strictly transactional.
- For production scale, point Evolution at the **official WhatsApp Cloud API**
  (Meta) instead of Baileys — same `sendWhatsApp()` seam in our code, but a
  compliant, ban-resistant backend (requires a Meta Business account, a verified
  number, and approved message templates).
Recommendation: build the integration behind our `sendWhatsApp()` abstraction so
we can start on Baileys for a pilot and swap to Cloud API without touching the
cron/resend code.

---

## 10. Rollout phases

1. **Infra:** stand up Evolution (Docker) in staging; create one test instance;
   confirm send + webhook round-trip with a burner number.
2. **Service seam:** `whatsapp-service.ts` + env guard + `deliverInvoice`
   channel switch (email still default). Feature-flag WhatsApp off in prod.
3. **Data + UI:** enum + tenant phone validation + opt-in checkbox + channel
   picker; per-merchant instance onboarding (QR pairing screen).
4. **Receipts:** webhook → delivery events → terminal status dots.
5. **Pilot:** one friendly merchant on a dedicated number; monitor deliverability
   and ban risk.
6. **Scale decision:** stay on Baileys vs migrate to official Cloud API (§9).

---

## Files this will touch (when implemented)

- New: `server/whatsapp-service.ts`, `docs` updates, a webhook route.
- Edit: `shared/schema.ts` (enums + tenant phone/opt-in + whatsappMessageId),
  `server/property-cron.ts` (channel switch in dispatch/reminder/resend),
  `server/routes.ts` (webhook + tenant validation + instance onboarding),
  tenant create/edit UI (channel + opt-in), migration for new columns.
- Infra: Docker compose service for Evolution + env wiring.
