# TaptPay Lead Engine — Plan

A "Clay-style" pipeline that **finds, enriches, personalizes, and reaches out to**
prospective TaptPay merchants — built **inside this repo on free / self-hosted
tooling**, run from an admin cockpit, with NZ compliance and email deliverability
designed in from day one.

> **Status:** proposal / not yet built. This doc is the source of truth for scope
> and phasing. Tick items off as they land (same convention as
> `docs/whatsapp-evolution-api-plan.md` and the remediation plan).

---

## 1. Decisions locked in

| Decision | Choice | Notes |
|---|---|---|
| Target segments | **All four** — hospitality & retail, property managers, tradies/mobile, all card-accepting SMBs | Messaging is segment-aware; sourcing strategy differs per segment. |
| Build model | **Orchestrate external SaaS → resolved to free/in-house** | Paid SaaS (Apollo/Instantly/Clay) isn't free past trial tiers, so we build a lean engine on free public sources + existing TaptPay sending infra. |
| Channels | Email + WhatsApp now; SMS + LinkedIn later | Email and WhatsApp infra already exist in-repo. |
| Personalization | **Claude** (Anthropic SDK), default Haiku | The one small unavoidable cost — pennies/lead, capped + toggleable. |
| Scale | **Lean (<1k leads/mo)** to start | Architecture designed to scale to a queue/workers later. |
| System of record | **TaptPay Postgres** | No external CRM; cockpit lives in the existing admin area. |

### The honest trade-off of "free"
- **Pros:** zero recurring SaaS fees, full ownership of the data, fits the existing
  monorepo + workflow, no vendor lock-in.
- **Cons vs. paid:** lower *automatic* contact coverage than Apollo (mitigated below
  with Places/OSM + website scraping, which is exactly where local-SMB data is
  cheapest to get); deliverability needs hands-on care because we don't get
  Instantly/Smartlead's managed warmup + inbox rotation; more for us to build
  (scrapers, sequence engine) instead of buying.
- **Residual cost:** Claude API only. Default to **Haiku**, cap monthly spend, and
  gate behind a feature flag so it can be turned off entirely.

---

## 2. How it slots into the existing codebase

Everything reuses patterns already in the repo:

| Need | Reuse |
|---|---|
| Scheduled work | `POST /api/internal/cron` + `x-cron-secret` (see `server/routes.ts:6280`) and the idempotent **pass** pattern in `server/property-cron.ts`. Add lead-engine passes alongside the property ones. |
| Email sending | `server/email-service-multi.ts` (Resend / SMTP / Gmail / Outlook switch). |
| WhatsApp | `server/whatsapp-service.ts` (`isWhatsAppConfigured`, `sendWhatsApp`) via the Evolution API. |
| Storage | The abstracted storage layer in `server/storage.ts`. |
| Admin UI | `client/src/pages/admin/*` behind `ProtectedAdminRoute.tsx`. Add a **Leads** section. |
| Schema + migrations | Drizzle in `shared/schema.ts`; auto-push on dev restart, plus a numbered file in `migrations/`. |

### New code layout
```
server/lead-engine/
  sources/        # overpass.ts, nzbn.ts, places.ts (optional), csv.ts
  enrichment/     # website-scrape.ts, waterfall.ts, cache.ts
  personalize/    # claude.ts, prompts.ts
  outreach/       # channels/{email,whatsapp}.ts, sequence-runner.ts, suppression.ts, unsubscribe.ts
  lead-cron.ts    # idempotent passes, mirrors property-cron.ts
client/src/pages/admin/leads/
  LeadsList.tsx  LeadDetail.tsx  Sourcing.tsx  Campaigns.tsx  CampaignDetail.tsx  Suppression.tsx
```

---

## 3. Data model (new Drizzle tables)

Sketch — refined during Phase 0.

- **`leads`** — the company/business. `businessName`, `segment`, `category`,
  `website`, `phone`, `address`, `suburb`, `region`, `nzbn`, `status`
  (`new → enriching → enriched → ready → enrolled → contacted → replied →
  converted → suppressed`), `score`, `sourceId`, dedupe keys (normalized
  domain + normalized name+suburb), timestamps.
- **`lead_contacts`** — people at a lead: `leadId`, `name`, `role`, `email`,
  `emailStatus` (`unverified/valid/risky/invalid`), `phone`, `linkedinUrl`,
  `consentBasis` (e.g. "published on business website"), `consentSourceUrl`.
- **`lead_sources`** — provenance of a sourcing run: provider, query params
  (segment/category/region), counts, runAt.
- **`enrichment_cache`** — keyed by domain/url; raw + parsed payload + fetchedAt,
  so we never re-scrape the same site within a TTL (rate-limit friendly).
- **`campaigns`** — name, segment, channel mix, status, throttle/daily-cap, sending
  identity (which domain/inbox), owner.
- **`campaign_steps`** — ordered steps: `dayOffset`, `channel`, `templateId`/prompt,
  conditions (e.g. "only if no reply").
- **`campaign_enrollments`** — `leadId` × `campaignId`, current step, next-send-at,
  state (`active/paused/replied/bounced/completed/unsubscribed`).
- **`outreach_messages`** — every rendered/sent message: channel, subject, body,
  status (`queued/sent/delivered/opened/clicked/bounced/failed`), providerId,
  unsubscribe token, timestamps.
- **`outreach_events`** — append-only event log (sent/open/click/reply/bounce/
  complaint/unsubscribe) for analytics + audit.
- **`suppressions`** — `email`/`phone`/`domain`, reason
  (`unsubscribed/bounced/complained/manual/converted`), addedAt. **Checked before
  every send.**

The existing bare `info_pack_leads` table (landing-page name+email capture) gets
folded in as a `lead_source = "info_pack"` so inbound and outbound share one
pipeline.

---

## 4. Free tooling per pillar

### Source (discover businesses)
1. **OpenStreetMap Overpass API** — free, no key. Query by category + region
   (`amenity=cafe|restaurant`, `shop=*`, `craft=plumber|electrician`, etc.).
   Primary discovery for local SMBs (hospitality, retail, tradies).
2. **NZBN API** — free public NZ Business Number register. Company name, status,
   addresses, roles/directors. Best for the property-manager / registered-company
   segments and for validating + de-duping everything else.
3. **Google Places API** *(optional)* — Maps Platform's free **$200/mo** credit
   covers lean volume. Higher-quality names/phones/websites/ratings where OSM is
   thin. Needs a GCP key (`GOOGLE_MAPS_API_KEY`); stays inside the free credit at
   <1k/mo. Off by default.
4. **CSV import** — always-free manual fallback for lists you already have.

### Enrich (waterfall — all free)
1. Start from what discovery already returned (name, phone, website, category, address).
2. **Website scrape** (our own `fetch` + a light HTML parser): contact page,
   `mailto:`/`tel:` links, social URLs, and "about" copy used as personalization
   signal. Respect `robots.txt` + polite delay; cache in `enrichment_cache`.
3. **NZBN** for directors/roles + registered details.
4. **Hunter.io free tier** *(optional, 25/mo)* only when a domain has no on-site
   email — low priority.
- Output: best-known contact + an **email confidence** flag + extracted signals.

### Personalize (Claude)
- Anthropic SDK, **Haiku** default. Builds a 1–2 line tailored opener from the
  enrichment signals (cuisine/segment, suburb, review vibe, the implicit "you're
  probably paying high terminal fees" angle).
- **Guardrails:** never invent facts; if signals are thin, fall back to the
  segment template. Every AI draft is stored and **shown for review/approve in the
  cockpit** before anything sends (especially while we build trust).
- Cap spend via env (`LEAD_AI_MONTHLY_CAP`) + a global on/off flag.

### Reach out
- **Email:** reuse `email-service-multi.ts`, but send cold from a **separate
  sending identity** — a subdomain like `outreach.taptpay.co.nz` or a fresh domain
  (`trytaptpay.co.nz`) with its **own SPF/DKIM/DMARC** so the main domain's
  transactional reputation (receipts/invoices) is never at risk. Low daily caps +
  manual warmup ramp (e.g. 20 → 50 → 100/day). Resend free tier (3k/mo, 100/day)
  fits lean volume.
- **WhatsApp:** existing Evolution API. Consent-sensitive → use for replied/warm
  leads or where the number is published for business contact; throttle hard.
- **SMS / LinkedIn:** **out of v1.** No free, safe, automatable path (LinkedIn has
  no official outreach API; automation tools risk bans). The channel interface is
  stubbed so they slot in later.

### Schedule
- Extend the cron pattern: a `leadEnginePass` set invoked from the existing
  `/api/internal/cron` (or a sibling route), each run: advance due sequence steps,
  drain the enrichment queue, generate pending AI drafts, poll for replies/bounces,
  auto-suppress on bounce/complaint. Idempotent like `property-cron.ts`. In-process
  interval is fine at lean volume; swap to a queue when volume grows.

---

## 5. Compliance & deliverability (built-in, not bolted on)

- **Suppression check before every send** (unsubscribed / bounced / complained /
  do-not-contact / already-a-merchant).
- **One-click unsubscribe** in every email (`/u/:token`) + footer carrying accurate
  **sender identity + physical address** (NZ UEMA 2007 requirement). WhatsApp/SMS
  honor STOP/opt-out keywords.
- **Consent + source tracking** per contact (where/when sourced, and the basis,
  e.g. "email conspicuously published on the business's own website").
- **Hard rate limits + daily caps** per channel and per sending domain.
- **Bounce/complaint handling** → automatic suppression + sequence pause.
- **Reply detection** (IMAP poll or provider webhook) → auto-pause the sequence so
  we never message someone who already replied.
- **Crawler etiquette:** robots.txt + crawl-delay in the scraper.

> Not legal advice. B2B cold outreach in NZ commonly relies on "inferred consent"
> where a business address is conspicuously published for that purpose, but the
> unsubscribe + accurate-sender requirements are mandatory. Worth a quick review
> with your counsel before the first real send. Privacy Act 2020 governs storing
> the contact data.

---

## 6. The conversion loop (TaptPay-specific, high value)

Close the loop back to the product: outreach links carry a tagged signup URL; when
that lead signs up as a merchant, mark the lead **converted**, auto-suppress, and
attribute it to the campaign/segment. This turns the cockpit's funnel into a real
CAC/conversion dashboard rather than just "emails sent."

---

## 7. Phasing

- [x] **Phase 0 — Foundations.** ✅ Done. `leads` / `lead_sources` / `suppressions`
  tables + migration `0007`; admin **Leads** cockpit (list + filters + pipeline
  counts, detail/edit, CSV import with header-aliasing + dedupe); suppression list;
  public `/unsubscribe` + `POST /api/public/unsubscribe`; `isSuppressed()` seam for
  later sends. *Outcome: store, view, import, and suppress leads.*
- [x] **Phase 1 — Sourcing.** ✅ Done. **Overpass** connector (free, keyless;
  segment→OSM-tag presets, area search, injection-safe query builder) — live-tested
  against the real API. **NZBN** connector gated behind `NZBN_API_KEY` (no-ops
  cleanly when unset). Shared `ingestLeads()` path (provenance + in-batch & DB
  dedupe + normalization) now backs both CSV and sourcing. "Find leads" search UI +
  `POST /api/admin/leads/source` + `GET /api/admin/lead-sources` (recent runs).
  *Outcome: one click pulls, e.g., Wellington cafés into the pipeline.*
- [x] **Phase 2 — Enrichment.** ✅ Done. Polite, dependency-free **website scraper**
  (robots-aware, capped pages/size/time, `User-Agent`) extracts emails/phones/
  socials + a signals blurb; results cached by domain (`enrichment_cache`, 30-day
  TTL). Waterfall picks the best email with **brand-root matching** (handles
  `.com`/`.co.nz`), sets `email_confidence` and — only when found on the business's
  own site — `consentBasis: "published_on_website"`; then **scores** the lead and
  promotes `new → ready/enriched`. `POST /api/admin/leads/:id/enrich` + bulk
  `/enrich`; cockpit "Enrich" actions + enrichment panel. Live-tested end-to-end.
  *Outcome: leads gain emails/phones/socials + personalization signals.*
- [x] **Phase 3 — AI personalization.** ✅ Done. `@anthropic-ai/sdk` with **Haiku**
  (`claude-haiku-4-5`, cap-able via `LEAD_AI_MODEL`/`LEAD_AI_ENABLED`, tight
  `max_tokens`) drafts a subject+body per lead from enriched signals, with
  guardrails (use-only-provided-facts, finished copy, NZ tone, soft CTA) and
  defensive JSON parsing. **Degrades to a segment template** when no
  `ANTHROPIC_API_KEY` is set, so the pipeline never breaks. Drafts persist to
  `draft_*` columns at status "draft"; cockpit has per-lead generate/edit/**approve**
  and a bulk "Draft ready". `POST /api/admin/leads/:id/personalize` + bulk `/personalize`.
  *Outcome: each lead has an on-brand drafted message, gated by human approval.*
- [ ] **Phase 4 — Outreach engine.** Campaigns + multi-step sequences, scheduler,
  compliant email send from the separate domain (unsubscribe, throttles,
  bounce/reply handling), WhatsApp step. *Outcome: enrolled leads get a compliant
  multi-touch sequence; replies auto-pause it.*
- [ ] **Phase 5 — Analytics & scale.** Funnel metrics (sourced → enriched → sent →
  opened → replied → converted), per-segment/campaign reporting; then optional
  upgrades (job queue, paid enrichment, SMS/LinkedIn) once there's budget.

---

## 8. Environment / config to add

| Var | Purpose | Required? |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude personalization | Phase 3 |
| `LEAD_AI_MODEL` | default `claude-haiku-4-5` | optional |
| `LEAD_AI_MONTHLY_CAP` | spend ceiling | optional |
| `OUTREACH_FROM_DOMAIN` / `OUTREACH_FROM_EMAIL` | cold-send identity (separate domain) | Phase 4 |
| `GOOGLE_MAPS_API_KEY` | optional Places sourcing | optional |
| `HUNTER_API_KEY` | optional email-finder fallback | optional |
| (reuses) `CRON_SECRET`, `RESEND_API_KEY`, `EVOLUTION_*` | scheduler, email, WhatsApp | existing |

> **Remote-env note:** sourcing/enrichment/Claude all make outbound calls
> (Overpass, NZBN, target websites, api.anthropic.com). When we get to testing in
> this hosted environment, those hosts must be permitted by the network policy —
> flag if egress is restricted.

---

## 9. Open questions (non-blocking — defaults chosen)

1. **Cold-send domain** — register a dedicated one (`trytaptpay.co.nz`?) or use an
   `outreach.` subdomain? (Default: subdomain to start, dedicated domain if volume
   grows.)
2. **AI review gate** — approve every draft manually at first, or auto-send once
   we trust it? (Default: manual approve in Phase 3–4, auto later.)
3. **First segment + region to validate** — which slice do we point Phase 1 at
   first? (Default: Auckland/Wellington hospitality.)
