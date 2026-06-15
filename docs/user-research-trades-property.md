# TaptPay User Research Report
## Trades & Property Management — New Zealand Market
*June 2026 | Synthesised from 4 research streams, 40+ sources*

---

## 1. Target Users & Personas

### The NZ Tradie (Primary)

**Profile:** Sole trader or small crew (1–5 people). Electrician, plumber, builder, or landscaper. 73% of NZ enterprises have zero paid employees (Stats NZ, 2024) — meaning the person doing the job is also doing the invoicing, chasing payment, and managing cash flow. Typically 30–55, smartphone-fluent but not tech-enthusiast.

**Current payment behaviour:**
- Cash ("cashies") for small jobs — informal, unreported, and declining post-IRD scrutiny
- Bank transfer via post-job invoice — the dominant formal method; payment arrives 7–30 days later
- EFTPOS terminal — used by more established operators, but hardware is increasingly burdensome

**Core pain points:**
- **Late payment is the #1 cash flow killer.** Without an accounts team, sole traders personally chase debtors. Platforms like Tradie Law NZ and Fergus both cite this as the defining financial stress of NZ trade businesses.
- **60,000 EFTPOS terminals forcibly retired 2023–2024** (PCI 3.x end-of-life), costing the market NZ$45M+. A further 19,000 face mandatory retirement by 30 April 2026. Small operators primed for a "no-hardware" message.
- **Offline gaps.** Rural NZ has patchy mobile coverage. Cloud-first tools (Tradify) struggle; offline-capable apps are a differentiator.
- **Manual reconciliation** consumes hours — matching bank deposits to job cards without automation.

**What they want:** Finish job → tap card on phone → paid instantly → job card updated → GST recorded. No terminal, no invoice chasing, no week-end batch.

---

### The NZ Property Manager (Secondary)

**Profile:** Manages 50–300 residential properties. Works for a licensed real estate agency or operates independently. Deals with rent collection, maintenance coordination, bond management, and tenant communications daily. Heavily regulated (Residential Tenancies Act, Privacy Act, trust accounting obligations).

**Current payment behaviour:**
- **Automatic Payment (AP)** — tenant-initiated bank transfer on a fixed schedule. De-facto standard. Problem: tenants can cancel silently; manager finds out only at reconciliation.
- **Direct debit** — only available via Console Cloud (Ezidebit) and MRI Palace; not in PropertyMe NZ or myRent.
- **Credit/debit card** — accepted by PropertyMe NZ and myRent, but rarely used for regular rent due to fees.

**Core pain points:**
- **Arrears tracking.** Late rent affects ~10% of tenants; 60% of landlords apply a grace period. AP cancellation is invisible until a missed payment shows up in reconciliation.
- **Manual bank reconciliation** — matching hundreds of incoming transactions to tenant accounts is a daily time cost.
- **Trust accounting compliance risk.** Console Cloud migration errors in 2025 caused trust account discrepancies — a regulatory and reputational risk.
- **Bond system delays.** MBIE's 2025 digital bond transition left 15% of refunds taking 11+ days.
- **Zero tap-to-pay option.** No PM platform in NZ has a mobile POS. Use cases exist: bond collection at lease signing, move-in fees, maintenance co-payments, ad hoc payments from tenants who aren't on AP.

---

## 2. Competitive Landscape

### Point-of-Sale / EFTPOS

| Provider | Model | In-person rate | Hardware | Key weakness |
|---|---|---|---|---|
| **Square NZ** | Integrated POS + SoftPOS | 2.6% + $0.15 *(raised Mar 2025)* | NZ$329 terminal | Rate hike generating merchant backlash |
| **Smartpay / Shift4** | Terminal rental + acquiring | ~$30–60/mo rental | ~NZ$1,000–1,900 | Being absorbed into Shift4's US-centric POS (SkyTab) |
| **Eftpos NZ** | Terminal + bank MSF | 1–4% MSF + rental | $30–75/mo rental | Hardware-dependent; not mobile-first |
| **Worldline (ex-Paymark)** | Network monopoly + SoftPOS | Bank-set MSF | App only | Not a merchant-direct product; enables others |
| **HitPay** | SoftPOS + card reader | 2.7% + $0.30 | Optional reader | Limited NZ brand awareness |
| **Xero + Stripe** | iPhone SoftPOS in accounting app | 2.7% + $0.20 | None | Requires both Xero and Stripe subscriptions |
| **Tyro NZ** | None established | N/A | N/A | Lost Smartpay bid to Shift4; no NZ presence |

**Key event:** Square's March 2025 rate hike to 2.6% + $0.15 is the single biggest market-opening event for a lower-rate competitor. The Shift4/Smartpay deal (NZ$296M, closing Q4 2025) will introduce US hospitality-focused POS to NZ — but SkyTab targets restaurants and stadiums, not trades or property.

### Trade Job Management (Direct competitors for tradie segment)

| Platform | NZ presence | Tap-to-pay | Gap |
|---|---|---|---|
| **Fergus** | Strong NZ-native; 23,000+ users globally | **Yes — launched Oct 2025** (iPhone + Android, Stripe) | Direct benchmark; first NZ-trade tap-to-pay |
| **Tradify** | Strong NZ (founded NZ, acquired by The Access Group 2024) | **No** — Stripe online links only | No on-site payment; growing per-user cost complaints |
| **Simpro** | Mid-large NZ businesses | **No** — online portal only | Too heavy for sole traders |
| **ServiceM8** | Small NZ businesses | **Partially** — live in AU/CA/UK/USA; **not yet confirmed in NZ** | NZ rollout lagging |

### Property Management (No direct competitors)

No NZ property management software — **PropertyMe NZ, MRI Palace, Console Cloud, Re-Leased, myRent** — has integrated tap-to-pay or mobile POS. This vertical is completely uncontested.

---

## 3. Market Opportunity

- **NZ Mobile POS Payments:** US$2.57bn in 2024 → US$4.37bn by 2028 (~14% CAGR) — Statista
- **NZ card payments overall:** NZD$125.6bn by 2029 at 3.9% CAGR — GlobalData
- **Contactless adoption:** 72% of NZ residents tap at least weekly. Mobile POS share rose from 12% (2019) to 34% (2023) — 22 percentage points in 4 years.

**Structural tailwinds:**

| Tailwind | Detail |
|---|---|
| **Interchange fee cuts** | Commerce Commission July 2025: saves NZ businesses $90M/year from Dec 2025 |
| **Surcharge ban** | Retail Payment System Amendment Bill 2025 (pending May 2026): removes merchant surcharges on Visa/Mastercard/EFTPOS in-store |
| **Terminal retirement wave** | 19,000 more terminals must retire by April 2026 — forcing function for mobile-first |
| **Apple Tap to Pay API** | Live in NZ since late 2024 (Worldline, Mypinpad, ANZ FastPay) — infrastructure proven |

**Trades vertical sizing:** ~600,000 NZ enterprises; 73% are sole traders. 10% of trade-sector businesses adopting mobile POS = 40,000+ potential TaptPay merchants.

**Property management vertical:** ~15,000 NZ property management businesses. 5% penetration = 750 PM firms, each processing bond, maintenance co-payments, and ad hoc tenant payments repeatedly.

---

## 4. UX & Feature Priorities

### For Trades (ranked by frequency across reviews, articles, platform positioning)

1. **On-the-spot payment at job completion** — tap card on phone the moment the job is done
2. **No hardware** — phone as terminal; no card reader to carry or maintain
3. **Automatic job card reconciliation** — payment records against the job instantly
4. **Same-day invoicing** — generated at job completion, not batched weekly
5. **Xero / MYOB sync** — payment flows to accounting automatically; no double-entry
6. **Digital wallets** — Apple Pay and Google Pay alongside tap card
7. **Offline capability** — works in low-signal rural NZ environments
8. **Simple, flat pricing** — one rate; Square's 2.6% + $0.15 is the benchmark of pain
9. **Automated payment reminders** — reduces the awkward follow-up call
10. **Progress invoicing** — deposit, progress payment, final invoice for larger jobs

### For Property Management

1. **Real-time rent visibility** — know immediately when a payment is missed
2. **Direct debit (pull payments)** — manager-initiated; not reliant on tenant AP
3. **Bond collection at lease signing** — mobile POS for face-to-face bond and move-in costs
4. **Trust accounting integration** — mandatory; any payment tool must feed correctly
5. **Maintenance co-payment collection** — for tenant-liable repair contributions
6. **Tenant arrears dashboard** — real-time, not batched
7. **Integration with Palace, PropertyMe NZ, Console Cloud** — PM firms won't switch core software

---

## 5. Strategic Positioning for TaptPay

### Entry points

**Tradify's gap (highest near-term opportunity):** Tradify has large NZ market share and *zero* tap-to-pay capability. Fergus launched the category in October 2025 — proving demand — but has not captured Tradify's base. A TaptPay integration or standalone product that works alongside Tradify (Xero sync, same invoicing flow) addresses a validated need before Tradify closes the gap themselves.

**Property management (uncontested):** No NZ PM platform has tap-to-pay. Integration with Palace or PropertyMe NZ as a payment layer would face zero direct competition. Use cases (bond collection, move-in fees, maintenance co-payments) are high-frequency and high-value.

### Rate positioning

Square's post-March 2025 rate (2.6% + $0.15) is the market reference point for pain. A flat rate below 2.6% — with no monthly fee or simple fee structure — is a genuine and communicable differentiator, especially given the surcharge ban removing merchants' ability to pass costs to customers.

### Hardware timing

19,000 terminals must retire by April 2026. "No hardware needed" is most compelling to operators who just spent on hardware and are facing another replacement cycle. This is a 10-month messaging window.

---

## Sources

- Scoop Business — Fergus Tap to Pay launch (Oct 2025)
- eCommerce News NZ — Fergus Tap to Pay (Oct 2025)
- Tradie Magazine NZ — Fergus Tap to Pay (Oct 2025)
- Xero Media Release — Tap to Pay NZ (May 2025)
- Shift4 — Smartpay acquisition press release (June 2025)
- Fintech Futures — Shift4 / Smartpay deal
- Payments NZ — EFTPOS hardware upgrade deadline
- Statista — NZ Mobile POS Payments outlook 2024–2028
- GlobalData — NZ card payments forecast to 2029
- ServiceM8 NZ — Tap to Pay on iPhone country status page
- PropertyMe NZ — Features & integrations
- MRI Palace NZ — Feature overview
- Console Cloud — Ezidebit integration docs
- Worldline NZ — Tap on Mobile (SoftPOS)
- Square AU/NZ — Pricing (post-March 2025)
- HitPay NZ — Pricing page
- Automate The Trades NZ — Job management software comparison 2026
- Shadow Administration NZ — GST & cash flow for tradies
- Stats NZ — Enterprise count by employee size (Feb 2024)
- Commerce Commission — Interchange fee determination (July 2025)
- Mypinpad — Tap to Pay on iPhone NZ launch (Nov 2024)
- ANZ NZ — FastPay Tap product page
- 1News — Bond refund delays (Feb 2026)
- Yardi / Property Council NZ — PropTech Report 2025
