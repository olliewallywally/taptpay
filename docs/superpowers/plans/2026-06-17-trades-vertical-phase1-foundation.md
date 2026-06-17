# Trades Vertical — Phase 1: Data Model + Backend Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Trades vertical's data layer — schema tables, Zod schemas, storage methods, and REST routes — mirroring the existing Property Management backend so later UI phases have a working API.

**Architecture:** Fork trades-named tables (`client_profiles`, `quotes`, `job_invoices`, `job_schedules`, `job_events`) parallel to the property tables in `shared/schema.ts`. Mirror the property storage methods in `server/storage.ts` (interface stub + `DatabaseStorage` impl) and the `/api/property/*` routes as `/api/trades/*` in `server/routes.ts`. Reuse Windcave/checkout/SSE machinery unchanged.

**Tech Stack:** Drizzle ORM (`drizzle-orm` 0.39, `drizzle-zod` 0.7), `drizzle-kit push` for migrations, Zod, Express, TypeScript. Verification via `npm run check` (tsc) + existing Jest smoke tests. No DB integration-test harness exists in this repo — do not invent one; verify with typecheck and the smoke suite.

## Global Constraints

- Trades transaction fee = **0.3%** of amount (not flat $0.10). Document/display in later UI phases; backend stores amounts in cents only.
- Post-payment document labelled **"Invoice"**, never "Receipt".
- Money is always integer **cents** (`amountCents`, `*Cents`), never floats.
- All trades routes require `authenticateToken` and scope by `req.merchant.id`, exactly like property routes.
- Mirror property naming: tenant→client, `propertyAddress`→`siteAddress`, rent→job. Keep `preferredChannel` enum `["email","whatsapp","sms"]`.
- GST: amounts are GST-inclusive; a single `GST_RATE = 0.15` constant; gated by a merchant `gstRegistered` flag (added in this phase, surfaced in UI later).
- Do NOT touch the property tables or `/api/property/*` routes. Trades is parallel and additive.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

- `shared/schema.ts` — append the trades table block + Zod schemas + inferred types after the property block (~line 938).
- `server/storage.ts` — add trades method signatures to the storage interface stub (~line 1617) and implementations in `DatabaseStorage` (~line 3140, after the property impls).
- `server/routes.ts` — add the `/api/trades/*` route block after the property routes (~line 6520).
- No new files this phase; trades backend lives alongside property in the same modules (files that change together stay together; matches the existing property layout).

---

### Task 1: Trades schema tables + Zod + types

**Files:**
- Modify: `shared/schema.ts` (append after the property `transactionEvents` block and its Zod section, ~line 938)

**Interfaces:**
- Consumes: existing `merchants` table, `pgTable`, `uuid`, `integer`, `text`, `timestamp`, `boolean`, `jsonb`, `index`, `uniqueIndex`, `sql`, `z` (all already imported in this file).
- Produces (later tasks rely on these exact names):
  - Tables: `clientProfiles`, `quotes`, `jobInvoices`, `jobSchedules`, `jobEvents`
  - Zod: `createClientProfileSchema`, `updateClientProfileSchema`, `createQuoteSchema`, `acceptQuoteSchema`, `createJobInvoiceSchema`, `markJobPaidExternalSchema`, `createJobScheduleSchema`, `updateJobScheduleSchema`
  - Types: `ClientProfile`, `Quote`, `JobInvoice`, `JobSchedule`, `GST_RATE`

- [ ] **Step 1: Add a `gstRegistered` flag to the merchants table**

In `shared/schema.ts`, find the `merchants` pgTable definition and add this column alongside the other boolean flags:

```ts
  gstRegistered: boolean("gst_registered").notNull().default(false),
```

- [ ] **Step 2: Append the trades tables block**

After the property Zod section (after `markInvoicePaidExternalSchema`, ~line 933), add:

```ts
/* ═══════════════ TRADES VERTICAL ═══════════════ */

export const GST_RATE = 0.15; // NZ GST; amounts are GST-inclusive

export const clientProfiles = pgTable("client_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  siteAddress: text("site_address").notNull(),
  notes: text("notes"),
  preferredChannel: text("preferred_channel").notNull().default("email"),
  status: text("status").notNull().default("active"),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  clientProfileId: uuid("client_profile_id").references(() => clientProfiles.id).notNull(),
  token: text("token").notNull().unique(),
  // draft · sent · viewed · accepted · declined · expired
  status: text("status").notNull().default("draft"),
  // [{ description, qty, unitPriceCents, lineTotalCents }]
  lineItems: jsonb("line_items").notNull(),
  subtotalCents: integer("subtotal_cents").notNull(),
  gstCents: integer("gst_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull(),
  depositEnabled: boolean("deposit_enabled").notNull().default(false),
  depositType: text("deposit_type"),        // 'percent' | 'fixed'
  depositValue: integer("deposit_value"),    // percent (0-100) or cents
  depositCents: integer("deposit_cents"),    // computed deposit amount in cents
  deliveryChannel: text("delivery_channel").notNull().default("email"),
  validUntil: timestamp("valid_until"),
  notes: text("notes"),
  documentUrl: text("document_url"),
  documentName: text("document_name"),
  sentAt: timestamp("sent_at"),
  viewedAt: timestamp("viewed_at"),
  acceptedAt: timestamp("accepted_at"),
  declinedAt: timestamp("declined_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  merchantStatusIdx: index("quotes_merchant_status_idx").on(t.merchantId, t.status),
  tokenIdx: index("quotes_token_idx").on(t.token),
}));

export const jobSchedules = pgTable("job_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  clientProfileId: uuid("client_profile_id").references(() => clientProfiles.id).notNull(),
  amountCents: integer("amount_cents").notNull(),
  frequency: text("frequency").notNull(),
  deliveryChannel: text("delivery_channel").notNull().default("email"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  nextRunDate: timestamp("next_run_date").notNull(),
  lastRunDate: timestamp("last_run_date"),
  status: text("status").notNull().default("active"),
  terminatedAt: timestamp("terminated_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  nextRunDateIdx: index("job_schedules_next_run_date_idx").on(t.nextRunDate),
  merchantStatusIdx: index("job_schedules_merchant_status_idx").on(t.merchantId, t.status),
}));

export const jobInvoices = pgTable("job_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  clientProfileId: uuid("client_profile_id").references(() => clientProfiles.id).notNull(),
  quoteId: uuid("quote_id").references(() => quotes.id),       // null for quick invoices
  scheduleId: uuid("schedule_id").references(() => jobSchedules.id),
  // 'deposit' | 'balance' | 'full' | 'recurring'
  kind: text("kind").notNull().default("full"),
  amountCents: integer("amount_cents").notNull(),
  token: text("token").notNull().unique(),
  deliveryChannel: text("delivery_channel").notNull(),
  jobDetails: text("job_details"),
  status: text("status").notNull().default("pending_dispatch"),
  dueAt: timestamp("due_at").notNull(),
  dispatchedAt: timestamp("dispatched_at"),
  sentAt: timestamp("sent_at"),
  viewedAt: timestamp("viewed_at"),
  paidAt: timestamp("paid_at"),
  voidedAt: timestamp("voided_at"),
  completedAt: timestamp("completed_at"),
  externalPaymentReference: text("external_payment_reference"),
  lastReminderSentAt: timestamp("last_reminder_sent_at"),
  scheduledSendAt: timestamp("scheduled_send_at"),
  reminderCount: integer("reminder_count").notNull().default(0),
  documentUrl: text("document_url"),
  documentName: text("document_name"),
  windcaveSessionId: text("windcave_session_id"),
  windcaveTransactionId: text("windcave_transaction_id"),
  splitEnabled: boolean("split_enabled").notNull().default(false),
  splitCount: integer("split_count"),
  splitPaidCount: integer("split_paid_count").notNull().default(0),
  splitPaidSessions: text("split_paid_sessions").array(),
  splitPayerEmails: text("split_payer_emails").array(),
  whatsappMessageId: text("whatsapp_message_id"),
  whatsappDeliveredAt: timestamp("whatsapp_delivered_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  statusDueIdx: index("job_invoices_status_due_idx").on(t.status, t.dueAt),
  merchantStatusIdx: index("job_invoices_merchant_status_idx").on(t.merchantId, t.status),
  tokenIdx: index("job_invoices_token_idx").on(t.token),
}));

export const jobEvents = pgTable("job_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  clientProfileId: uuid("client_profile_id").references(() => clientProfiles.id),
  quoteId: uuid("quote_id").references(() => quotes.id),
  jobInvoiceId: uuid("job_invoice_id").references(() => jobInvoices.id),
  scheduleId: uuid("schedule_id").references(() => jobSchedules.id),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  clientCreatedIdx: index("job_events_client_created_idx").on(t.clientProfileId, t.createdAt),
  merchantCreatedIdx: index("job_events_merchant_created_idx").on(t.merchantId, t.createdAt),
}));
```

- [ ] **Step 3: Append the trades Zod schemas + types**

Immediately after the tables block:

```ts
// Trades Zod schemas (reuse the property field validators above)
const siteAddressSchema = z.string().trim().min(1, "Site address is required").max(200);

const clientProfileFields = z.object({
  firstName: personNameSchema,
  lastName: personNameSchema,
  email: optionalEmailSchema,
  phone: optionalPhoneSchema,
  siteAddress: siteAddressSchema,
  notes: z.string().max(1000).optional().or(z.literal("")).transform(v => v || undefined),
  preferredChannel: z.enum(["email", "whatsapp", "sms"]).default("email"),
});
export const createClientProfileSchema = clientProfileFields;
export const updateClientProfileSchema = clientProfileFields.partial();

const quoteLineItemSchema = z.object({
  description: z.string().trim().min(1).max(200),
  qty: z.number().int().positive().max(100000),
  unitPriceCents: z.number().int().min(0).max(100_000_000),
  lineTotalCents: z.number().int().min(0).max(100_000_000),
});

export const createQuoteSchema = z.object({
  clientProfileId: z.string().uuid(),
  lineItems: z.array(quoteLineItemSchema).min(1),
  deliveryChannel: z.enum(["email", "whatsapp", "sms"]).default("email"),
  depositEnabled: z.boolean().default(false),
  depositType: z.enum(["percent", "fixed"]).optional(),
  depositValue: z.number().int().min(0).max(100_000_000).optional(),
  validUntil: z.string().datetime().or(z.date()).optional().transform(v => v ? new Date(v as any) : undefined),
  notes: z.string().trim().max(1000).optional().or(z.literal("")).transform(v => v || undefined),
  documentUrl: z.string().trim().max(500).optional().or(z.literal("")).transform(v => v || undefined),
  documentName: z.string().trim().max(255).optional().or(z.literal("")).transform(v => v || undefined),
});

export const acceptQuoteSchema = z.object({
  accept: z.boolean(), // true = accept, false = decline
});

export const createJobInvoiceSchema = z.object({
  clientProfileId: z.string().uuid(),
  amountCents: z.number().int().positive().max(100_000_000),
  deliveryChannel: z.enum(["email", "whatsapp", "sms"]),
  dueAt: z.string().datetime().or(z.date()).transform(v => new Date(v as any)),
  scheduledSendAt: z.string().datetime().or(z.date()).optional().transform(v => v ? new Date(v as any) : undefined),
  kind: z.enum(["deposit", "balance", "full", "recurring"]).default("full"),
  quoteId: z.string().uuid().optional(),
  jobDetails: z.string().trim().max(500).optional().or(z.literal("")).transform(v => v || undefined),
  splitEnabled: z.boolean().optional(),
  documentUrl: z.string().trim().max(500).optional().or(z.literal("")).transform(v => v || undefined),
  documentName: z.string().trim().max(255).optional().or(z.literal("")).transform(v => v || undefined),
});

export const markJobPaidExternalSchema = z.object({
  externalPaymentReference: z.string().trim().max(200).optional().or(z.literal("")).transform(v => v || undefined),
});

export const createJobScheduleSchema = z.object({
  clientProfileId: z.string().uuid(),
  amountCents: z.number().int().positive().max(100_000_000),
  frequency: z.enum(["weekly", "fortnightly", "monthly"]),
  deliveryChannel: z.enum(["email", "whatsapp", "sms"]),
  startDate: z.string().datetime().or(z.date()).transform(v => new Date(v as any)),
  endDate: z.string().datetime().or(z.date()).optional().transform(v => v ? new Date(v as any) : undefined),
});

export const updateJobScheduleSchema = z.object({
  amountCents: z.number().int().positive().max(100_000_000).optional(),
  frequency: z.enum(["weekly", "fortnightly", "monthly"]).optional(),
  deliveryChannel: z.enum(["email", "whatsapp", "sms"]).optional(),
  status: z.enum(["active", "paused", "terminated"]).optional(),
});

// Trades types
export type ClientProfile = typeof clientProfiles.$inferSelect;
export type InsertClientProfile = typeof clientProfiles.$inferInsert;
export type Quote = typeof quotes.$inferSelect;
export type JobInvoice = typeof jobInvoices.$inferSelect;
export type JobSchedule = typeof jobSchedules.$inferSelect;
```

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: PASS (no new TypeScript errors). If `personNameSchema`/`optionalEmailSchema`/`optionalPhoneSchema` are reported as used-before-declaration, move the trades block to AFTER their declarations (they are defined in the property Zod section above ~line 872, so appending after line 933 is correct).

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(trades): schema tables, Zod schemas, types for trades vertical

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Storage methods for trades

**Files:**
- Modify: `server/storage.ts` — interface stub (~line 1617) and `DatabaseStorage` impl (~after line 3140)

**Interfaces:**
- Consumes: `clientProfiles`, `quotes`, `jobInvoices`, `jobSchedules`, `jobEvents` from `@shared/schema`; `db`, `eq`, `and`, `desc`, `lte` from drizzle (already imported in storage.ts — verify and add any missing).
- Produces (routes in Task 3 rely on these): `createClientProfile`, `getClientProfile`, `getClientProfilesByMerchant`, `updateClientProfile`, `archiveClientProfile`, `unarchiveClientProfile`, `createQuote`, `getQuote`, `getQuoteByToken`, `getQuotesByMerchant`, `updateQuote`, `createJobInvoice`, `getJobInvoice`, `getJobInvoiceByToken`, `getJobInvoicesByMerchant`, `updateJobInvoice`, `createJobSchedule`, `getJobSchedule`, `getJobSchedulesByMerchant`, `updateJobSchedule`, `terminateJobSchedule`, `createJobEvent`, `getJobEventsByClient`.

- [ ] **Step 1: Add import**

At the top of `server/storage.ts`, add to the `@shared/schema` import the new tables: `clientProfiles, quotes, jobInvoices, jobSchedules, jobEvents`.

- [ ] **Step 2: Add interface stubs**

In the storage interface/stub class (the one returning `undefined`/`[]`, ~line 1617), add stub signatures returning the empty defaults, mirroring the property stubs:

```ts
  async createClientProfile(data: any): Promise<any> { throw new Error("Trades requires database"); }
  async getClientProfile(id: string): Promise<any> { return undefined; }
  async getClientProfilesByMerchant(merchantId: number): Promise<any[]> { return []; }
  async updateClientProfile(id: string, updates: any): Promise<any> { return undefined; }
  async archiveClientProfile(id: string): Promise<any> { return undefined; }
  async unarchiveClientProfile(id: string): Promise<any> { return undefined; }
  async createQuote(data: any): Promise<any> { throw new Error("Trades requires database"); }
  async getQuote(id: string): Promise<any> { return undefined; }
  async getQuoteByToken(token: string): Promise<any> { return undefined; }
  async getQuotesByMerchant(merchantId: number, opts?: any): Promise<any[]> { return []; }
  async updateQuote(id: string, updates: any): Promise<any> { return undefined; }
  async createJobInvoice(data: any): Promise<any> { throw new Error("Trades requires database"); }
  async getJobInvoice(id: string): Promise<any> { return undefined; }
  async getJobInvoiceByToken(token: string): Promise<any> { return undefined; }
  async getJobInvoicesByMerchant(merchantId: number, opts?: any): Promise<any[]> { return []; }
  async updateJobInvoice(id: string, updates: any): Promise<any> { return undefined; }
  async createJobSchedule(data: any): Promise<any> { throw new Error("Trades requires database"); }
  async getJobSchedule(id: string): Promise<any> { return undefined; }
  async getJobSchedulesByMerchant(merchantId: number): Promise<any[]> { return []; }
  async updateJobSchedule(id: string, updates: any): Promise<any> { return undefined; }
  async terminateJobSchedule(id: string): Promise<any> { return undefined; }
  async createJobEvent(data: any): Promise<any> { return undefined; }
  async getJobEventsByClient(clientProfileId: string, limit?: number): Promise<any[]> { return []; }
```

- [ ] **Step 3: Add `DatabaseStorage` implementations**

After the property `DatabaseStorage` methods (~line 3140), add the real implementations. These mirror the property impls one-to-one:

```ts
  // ───────── Trades: clients ─────────
  async createClientProfile(data: any): Promise<any> {
    const [row] = await db.insert(clientProfiles).values(data).returning();
    return row;
  }
  async getClientProfile(id: string): Promise<any> {
    const [row] = await db.select().from(clientProfiles).where(eq(clientProfiles.id, id));
    return row;
  }
  async getClientProfilesByMerchant(merchantId: number): Promise<any[]> {
    return db.select().from(clientProfiles)
      .where(eq(clientProfiles.merchantId, merchantId))
      .orderBy(desc(clientProfiles.createdAt));
  }
  async updateClientProfile(id: string, updates: any): Promise<any> {
    const [row] = await db.update(clientProfiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(clientProfiles.id, id)).returning();
    return row;
  }
  async archiveClientProfile(id: string): Promise<any> {
    const [row] = await db.update(clientProfiles)
      .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(clientProfiles.id, id)).returning();
    return row;
  }
  async unarchiveClientProfile(id: string): Promise<any> {
    const [row] = await db.update(clientProfiles)
      .set({ status: "active", archivedAt: null, updatedAt: new Date() })
      .where(eq(clientProfiles.id, id)).returning();
    return row;
  }

  // ───────── Trades: quotes ─────────
  async createQuote(data: any): Promise<any> {
    const [row] = await db.insert(quotes).values(data).returning();
    return row;
  }
  async getQuote(id: string): Promise<any> {
    const [row] = await db.select().from(quotes).where(eq(quotes.id, id));
    return row;
  }
  async getQuoteByToken(token: string): Promise<any> {
    const [row] = await db.select().from(quotes).where(eq(quotes.token, token));
    return row;
  }
  async getQuotesByMerchant(merchantId: number, opts: { status?: string } = {}): Promise<any[]> {
    const conds = [eq(quotes.merchantId, merchantId)];
    if (opts.status) conds.push(eq(quotes.status, opts.status));
    return db.select().from(quotes).where(and(...conds)).orderBy(desc(quotes.createdAt));
  }
  async updateQuote(id: string, updates: any): Promise<any> {
    const [row] = await db.update(quotes)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(quotes.id, id)).returning();
    return row;
  }

  // ───────── Trades: job invoices ─────────
  async createJobInvoice(data: any): Promise<any> {
    const [row] = await db.insert(jobInvoices).values(data).returning();
    return row;
  }
  async getJobInvoice(id: string): Promise<any> {
    const [row] = await db.select().from(jobInvoices).where(eq(jobInvoices.id, id));
    return row;
  }
  async getJobInvoiceByToken(token: string): Promise<any> {
    const [row] = await db.select().from(jobInvoices).where(eq(jobInvoices.token, token));
    return row;
  }
  async getJobInvoicesByMerchant(merchantId: number, opts: { status?: string; clientProfileId?: string } = {}): Promise<any[]> {
    const conds = [eq(jobInvoices.merchantId, merchantId)];
    if (opts.status) conds.push(eq(jobInvoices.status, opts.status));
    if (opts.clientProfileId) conds.push(eq(jobInvoices.clientProfileId, opts.clientProfileId));
    return db.select().from(jobInvoices).where(and(...conds)).orderBy(desc(jobInvoices.createdAt));
  }
  async updateJobInvoice(id: string, updates: any): Promise<any> {
    const [row] = await db.update(jobInvoices)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(jobInvoices.id, id)).returning();
    return row;
  }

  // ───────── Trades: job schedules ─────────
  async createJobSchedule(data: any): Promise<any> {
    const [row] = await db.insert(jobSchedules).values(data).returning();
    return row;
  }
  async getJobSchedule(id: string): Promise<any> {
    const [row] = await db.select().from(jobSchedules).where(eq(jobSchedules.id, id));
    return row;
  }
  async getJobSchedulesByMerchant(merchantId: number): Promise<any[]> {
    return db.select().from(jobSchedules)
      .where(eq(jobSchedules.merchantId, merchantId))
      .orderBy(desc(jobSchedules.createdAt));
  }
  async updateJobSchedule(id: string, updates: any): Promise<any> {
    const [row] = await db.update(jobSchedules)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(jobSchedules.id, id)).returning();
    return row;
  }
  async terminateJobSchedule(id: string): Promise<any> {
    const [row] = await db.update(jobSchedules)
      .set({ status: "terminated", terminatedAt: new Date(), updatedAt: new Date() })
      .where(eq(jobSchedules.id, id)).returning();
    return row;
  }

  // ───────── Trades: events ─────────
  async createJobEvent(data: any): Promise<any> {
    const [row] = await db.insert(jobEvents).values(data).returning();
    return row;
  }
  async getJobEventsByClient(clientProfileId: string, limit = 50): Promise<any[]> {
    return db.select().from(jobEvents)
      .where(eq(jobEvents.clientProfileId, clientProfileId))
      .orderBy(desc(jobEvents.createdAt)).limit(limit);
  }
```

- [ ] **Step 4: Verify drizzle helpers imported**

Confirm `eq`, `and`, `desc` are in the drizzle-orm import at the top of `server/storage.ts` (they are used by property code, so they should be). Run: `npm run check` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/storage.ts
git commit -m "feat(trades): storage methods for clients, quotes, job invoices, schedules

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: REST routes `/api/trades/*`

**Files:**
- Modify: `server/routes.ts` — add a trades route block after the property routes (~line 6520)

**Interfaces:**
- Consumes: `storage.*` methods from Task 2; the Zod schemas from Task 1; `authenticateToken`, `AuthenticatedRequest`, `req.merchant.id` (same auth pattern as property routes); `GST_RATE` from `@shared/schema`; a token generator (reuse property's `generateToken`/`crypto.randomBytes` pattern — grep `token:` in the property invoice POST route at routes.ts:6026 and mirror it).
- Produces: HTTP endpoints consumed by the Phase 3/4 terminal UI.

- [ ] **Step 1: Add imports**

Add the trades Zod schemas + `GST_RATE` to the `@shared/schema` import in `server/routes.ts`: `createClientProfileSchema, updateClientProfileSchema, createQuoteSchema, acceptQuoteSchema, createJobInvoiceSchema, markJobPaidExternalSchema, createJobScheduleSchema, updateJobScheduleSchema, GST_RATE`.

- [ ] **Step 2: Add a quote-total helper near the trades routes**

```ts
// Compute subtotal/GST/total/deposit for a quote from its line items.
// Amounts are GST-INCLUSIVE: gst is the portion already inside the total.
function computeQuoteTotals(
  lineItems: Array<{ lineTotalCents: number }>,
  gstRegistered: boolean,
  depositEnabled: boolean,
  depositType?: string,
  depositValue?: number,
) {
  const totalCents = lineItems.reduce((s, li) => s + li.lineTotalCents, 0);
  const gstCents = gstRegistered ? Math.round(totalCents - totalCents / (1 + GST_RATE)) : 0;
  const subtotalCents = totalCents - gstCents;
  let depositCents: number | null = null;
  if (depositEnabled && depositType && depositValue != null) {
    depositCents = depositType === "percent"
      ? Math.round(totalCents * (depositValue / 100))
      : Math.min(depositValue, totalCents);
  }
  return { subtotalCents, gstCents, totalCents, depositCents };
}
```

- [ ] **Step 3: Add the client routes**

```ts
  // ═══════════════ TRADES ═══════════════
  app.get("/api/trades/clients", authenticateToken, async (req: AuthenticatedRequest, res) => {
    const rows = await storage.getClientProfilesByMerchant(req.merchant!.id);
    res.json(rows);
  });
  app.post("/api/trades/clients", authenticateToken, async (req: AuthenticatedRequest, res) => {
    const parsed = createClientProfileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
    const row = await storage.createClientProfile({ ...parsed.data, merchantId: req.merchant!.id });
    res.status(201).json(row);
  });
  app.get("/api/trades/clients/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    const row = await storage.getClientProfile(req.params.id);
    if (!row || row.merchantId !== req.merchant!.id) return res.status(404).json({ message: "Not found" });
    res.json(row);
  });
  app.put("/api/trades/clients/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    const existing = await storage.getClientProfile(req.params.id);
    if (!existing || existing.merchantId !== req.merchant!.id) return res.status(404).json({ message: "Not found" });
    const parsed = updateClientProfileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
    res.json(await storage.updateClientProfile(req.params.id, parsed.data));
  });
  app.post("/api/trades/clients/:id/archive", authenticateToken, async (req: AuthenticatedRequest, res) => {
    const existing = await storage.getClientProfile(req.params.id);
    if (!existing || existing.merchantId !== req.merchant!.id) return res.status(404).json({ message: "Not found" });
    res.json(await storage.archiveClientProfile(req.params.id));
  });
  app.get("/api/trades/clients/:id/events", authenticateToken, async (req: AuthenticatedRequest, res) => {
    const existing = await storage.getClientProfile(req.params.id);
    if (!existing || existing.merchantId !== req.merchant!.id) return res.status(404).json({ message: "Not found" });
    res.json(await storage.getJobEventsByClient(req.params.id));
  });
```

- [ ] **Step 4: Add the quote routes (create + accept→deposit auto-issue)**

```ts
  app.get("/api/trades/quotes", authenticateToken, async (req: AuthenticatedRequest, res) => {
    res.json(await storage.getQuotesByMerchant(req.merchant!.id, { status: req.query.status as string | undefined }));
  });
  app.post("/api/trades/quotes", authenticateToken, async (req: AuthenticatedRequest, res) => {
    const parsed = createQuoteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
    const client = await storage.getClientProfile(parsed.data.clientProfileId);
    if (!client || client.merchantId !== req.merchant!.id) return res.status(404).json({ message: "Client not found" });
    const totals = computeQuoteTotals(parsed.data.lineItems, !!req.merchant!.gstRegistered,
      parsed.data.depositEnabled, parsed.data.depositType, parsed.data.depositValue);
    const token = generateToken(); // reuse the same generator the property invoice POST uses
    const row = await storage.createQuote({
      merchantId: req.merchant!.id,
      clientProfileId: parsed.data.clientProfileId,
      token, status: "sent",
      lineItems: parsed.data.lineItems,
      subtotalCents: totals.subtotalCents, gstCents: totals.gstCents, totalCents: totals.totalCents,
      depositEnabled: parsed.data.depositEnabled,
      depositType: parsed.data.depositType ?? null,
      depositValue: parsed.data.depositValue ?? null,
      depositCents: totals.depositCents,
      deliveryChannel: parsed.data.deliveryChannel,
      validUntil: parsed.data.validUntil ?? null,
      notes: parsed.data.notes ?? null,
      documentUrl: parsed.data.documentUrl ?? null,
      documentName: parsed.data.documentName ?? null,
      sentAt: new Date(),
    });
    await storage.createJobEvent({ merchantId: req.merchant!.id, clientProfileId: client.id, quoteId: row.id, eventType: "quote_sent" });
    // NOTE: actual email/WhatsApp dispatch reuses the property dispatcher — wired in Phase 5.
    res.status(201).json(row);
  });
  app.get("/api/trades/quotes/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    const row = await storage.getQuote(req.params.id);
    if (!row || row.merchantId !== req.merchant!.id) return res.status(404).json({ message: "Not found" });
    res.json(row);
  });
  // Customer-facing accept/decline (called from the public quote page, no auth — looked up by token)
  app.post("/api/trades/quotes/token/:token/respond", async (req, res) => {
    const parsed = acceptQuoteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid" });
    const quote = await storage.getQuoteByToken(req.params.token);
    if (!quote) return res.status(404).json({ message: "Quote not found" });
    if (quote.status === "accepted" || quote.status === "declined")
      return res.status(409).json({ message: "Already responded" });
    if (!parsed.data.accept) {
      const declined = await storage.updateQuote(quote.id, { status: "declined", declinedAt: new Date() });
      await storage.createJobEvent({ merchantId: quote.merchantId, clientProfileId: quote.clientProfileId, quoteId: quote.id, eventType: "quote_declined" });
      return res.json({ quote: declined, depositInvoice: null });
    }
    const accepted = await storage.updateQuote(quote.id, { status: "accepted", acceptedAt: new Date() });
    await storage.createJobEvent({ merchantId: quote.merchantId, clientProfileId: quote.clientProfileId, quoteId: quote.id, eventType: "quote_accepted" });
    // Deposit enabled → auto-issue the deposit invoice so the checkout shows it immediately.
    let depositInvoice = null;
    const due = new Date(); due.setDate(due.getDate() + 7);
    if (quote.depositEnabled && quote.depositCents && quote.depositCents > 0) {
      depositInvoice = await storage.createJobInvoice({
        merchantId: quote.merchantId, clientProfileId: quote.clientProfileId, quoteId: quote.id,
        kind: "deposit", amountCents: quote.depositCents, token: generateToken(),
        deliveryChannel: quote.deliveryChannel, status: "pending_dispatch", dueAt: due,
      });
    } else {
      // No deposit → issue the full balance straight away.
      depositInvoice = await storage.createJobInvoice({
        merchantId: quote.merchantId, clientProfileId: quote.clientProfileId, quoteId: quote.id,
        kind: "full", amountCents: quote.totalCents, token: generateToken(),
        deliveryChannel: quote.deliveryChannel, status: "pending_dispatch", dueAt: due,
      });
    }
    res.json({ quote: accepted, depositInvoice });
  });
```

- [ ] **Step 5: Add job-invoice routes (quick invoice, balance, external, void, complete)**

```ts
  app.get("/api/trades/invoices", authenticateToken, async (req: AuthenticatedRequest, res) => {
    res.json(await storage.getJobInvoicesByMerchant(req.merchant!.id, {
      status: req.query.status as string | undefined,
      clientProfileId: req.query.clientProfileId as string | undefined,
    }));
  });
  app.post("/api/trades/invoices", authenticateToken, async (req: AuthenticatedRequest, res) => {
    const parsed = createJobInvoiceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
    const client = await storage.getClientProfile(parsed.data.clientProfileId);
    if (!client || client.merchantId !== req.merchant!.id) return res.status(404).json({ message: "Client not found" });
    const row = await storage.createJobInvoice({
      merchantId: req.merchant!.id, clientProfileId: parsed.data.clientProfileId,
      quoteId: parsed.data.quoteId ?? null, kind: parsed.data.kind,
      amountCents: parsed.data.amountCents, token: generateToken(),
      deliveryChannel: parsed.data.deliveryChannel, jobDetails: parsed.data.jobDetails ?? null,
      status: "pending_dispatch", dueAt: parsed.data.dueAt,
      scheduledSendAt: parsed.data.scheduledSendAt ?? null,
      splitEnabled: !!parsed.data.splitEnabled,
      documentUrl: parsed.data.documentUrl ?? null, documentName: parsed.data.documentName ?? null,
    });
    await storage.createJobEvent({ merchantId: req.merchant!.id, clientProfileId: client.id, jobInvoiceId: row.id, eventType: "invoice_sent" });
    res.status(201).json(row);
  });
  app.post("/api/trades/invoices/:id/send-balance", authenticateToken, async (req: AuthenticatedRequest, res) => {
    // Issue the remaining balance for a deposit-paid job.
    const dep = await storage.getJobInvoice(req.params.id);
    if (!dep || dep.merchantId !== req.merchant!.id) return res.status(404).json({ message: "Not found" });
    const quote = dep.quoteId ? await storage.getQuote(dep.quoteId) : null;
    const balanceCents = quote ? Math.max(quote.totalCents - (dep.amountCents || 0), 0) : 0;
    if (balanceCents <= 0) return res.status(400).json({ message: "No balance remaining" });
    const due = new Date(); due.setDate(due.getDate() + 7);
    const bal = await storage.createJobInvoice({
      merchantId: dep.merchantId, clientProfileId: dep.clientProfileId, quoteId: dep.quoteId,
      kind: "balance", amountCents: balanceCents, token: generateToken(),
      deliveryChannel: dep.deliveryChannel, status: "pending_dispatch", dueAt: due,
    });
    await storage.createJobEvent({ merchantId: dep.merchantId, clientProfileId: dep.clientProfileId, jobInvoiceId: bal.id, eventType: "balance_sent" });
    res.status(201).json(bal);
  });
  app.post("/api/trades/invoices/:id/mark-paid-external", authenticateToken, async (req: AuthenticatedRequest, res) => {
    const inv = await storage.getJobInvoice(req.params.id);
    if (!inv || inv.merchantId !== req.merchant!.id) return res.status(404).json({ message: "Not found" });
    const parsed = markJobPaidExternalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid" });
    const row = await storage.updateJobInvoice(req.params.id, {
      status: "paid_external", paidAt: new Date(),
      externalPaymentReference: parsed.data.externalPaymentReference ?? null,
    });
    await storage.createJobEvent({ merchantId: inv.merchantId, clientProfileId: inv.clientProfileId, jobInvoiceId: inv.id, eventType: "paid_external" });
    res.json(row);
  });
  app.post("/api/trades/invoices/:id/complete", authenticateToken, async (req: AuthenticatedRequest, res) => {
    const inv = await storage.getJobInvoice(req.params.id);
    if (!inv || inv.merchantId !== req.merchant!.id) return res.status(404).json({ message: "Not found" });
    res.json(await storage.updateJobInvoice(req.params.id, { status: "paid", completedAt: new Date() }));
  });
  app.post("/api/trades/invoices/:id/void", authenticateToken, async (req: AuthenticatedRequest, res) => {
    const inv = await storage.getJobInvoice(req.params.id);
    if (!inv || inv.merchantId !== req.merchant!.id) return res.status(404).json({ message: "Not found" });
    res.json(await storage.updateJobInvoice(req.params.id, { status: "voided", voidedAt: new Date() }));
  });
```

- [ ] **Step 6: Add schedule routes (maintenance/recurring)**

```ts
  app.get("/api/trades/schedules", authenticateToken, async (req: AuthenticatedRequest, res) => {
    res.json(await storage.getJobSchedulesByMerchant(req.merchant!.id));
  });
  app.post("/api/trades/schedules", authenticateToken, async (req: AuthenticatedRequest, res) => {
    const parsed = createJobScheduleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
    const client = await storage.getClientProfile(parsed.data.clientProfileId);
    if (!client || client.merchantId !== req.merchant!.id) return res.status(404).json({ message: "Client not found" });
    const row = await storage.createJobSchedule({
      ...parsed.data, merchantId: req.merchant!.id, nextRunDate: parsed.data.startDate,
    });
    res.status(201).json(row);
  });
  app.put("/api/trades/schedules/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    const existing = await storage.getJobSchedule(req.params.id);
    if (!existing || existing.merchantId !== req.merchant!.id) return res.status(404).json({ message: "Not found" });
    const parsed = updateJobScheduleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid" });
    res.json(await storage.updateJobSchedule(req.params.id, parsed.data));
  });
  app.delete("/api/trades/schedules/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    const existing = await storage.getJobSchedule(req.params.id);
    if (!existing || existing.merchantId !== req.merchant!.id) return res.status(404).json({ message: "Not found" });
    res.json(await storage.terminateJobSchedule(req.params.id));
  });
```

- [ ] **Step 7: Resolve `generateToken`**

If `generateToken` is not already a shared helper in routes.ts, mirror the property invoice POST token generation (grep `token:` near routes.ts:6026). If property uses an inline `crypto.randomBytes(...).toString('hex')`, extract a local `function generateToken() { return crypto.randomBytes(24).toString('base64url'); }` near the trades block and confirm `crypto` is imported.

- [ ] **Step 8: Typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add server/routes.ts
git commit -m "feat(trades): /api/trades routes — clients, quotes, job invoices, schedules

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Push schema + smoke verify

**Files:** none (operational)

- [ ] **Step 1: Push the new tables to the database**

Run: `npm run db:push`
Expected: drizzle-kit reports creating `client_profiles`, `quotes`, `job_invoices`, `job_schedules`, `job_events` and the `merchants.gst_registered` column. Accept the additive changes. If prompted about the `gstRegistered` column on existing rows, the `.default(false)` covers it.

- [ ] **Step 2: Run the smoke/syntax suite**

Run: `npx jest client/src/pages/__tests__/syntax-validation.test.tsx`
Expected: PASS (confirms nothing in the shared import graph broke).

- [ ] **Step 3: Boot check**

Run: `npm run check`
Expected: PASS, no errors across schema/storage/routes.

- [ ] **Step 4: Commit (if db:push generated migration metadata)**

```bash
git add -A
git commit -m "chore(trades): push trades schema to database

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase Roadmap (subsequent plans — each gets its own detailed plan when reached)

- **Phase 2 — Navigation & shells:** 3-way settings switch (`settings.tsx` ~line 1170, add Trades→`/trades`); `/trades/*` routes in `App.tsx` mirroring property; trades theme token module (`TRADES_THEME`, swappable); empty trades-dashboard/analytics/client-directory/client-profile page shells.
- **Phase 3 — Terminal core (reuse):** Port `property-terminal.tsx` → `trades-terminal.tsx` swapping tokens; action bar `clients · quote · invoice · external`; reuse keypad, ChooseClient, MarkExternal, SentSuccess, ConfirmButton, subbar/FAB/conveyor.
- **Phase 4 — Quote builder + quick invoice:** line-item editor screen, deposit toggle (%/$), recurring toggle, wire to `/api/trades/quotes` and `/api/trades/invoices`; job stack on home; JobActionSheet (send balance / complete / external / cancel).
- **Phase 5 — Dispatch + checkout + public quote page:** reuse property email/WhatsApp dispatcher for quotes/invoices; public quote accept/decline page hitting `/respond`; deposit→checkout (reuse split-payment/Windcave/SSE); 0.3% fee + "Invoice" labelling + GST line in PDF/UI.
- **Phase 6 — Maintenance cron:** extend the schedule engine (mirror `server/property-cron.ts`) to issue recurring job invoices from `job_schedules`.

---

## Self-Review

**Spec coverage:** Phase 1 covers spec §8 (data model — all 5 tables + Zod), §9 (GST constant + `gstRegistered` flag + inclusive computation), and the backend half of §5/§6 (lifecycle statuses, deposit auto-issue on accept, quick invoice, external, balance, complete). Spec §3 (nav), §4 (theme), §6 (action-bar UI), §7 (screens), §10 (fee/Invoice display), §11 (UI reuse) are explicitly deferred to Phases 2–5 in the roadmap — not gaps, sequencing.

**Placeholder scan:** The two `NOTE:` comments (email dispatch in §quote create; reuse note) point to Phase 5 and are real deferrals with a named home, not undefined work. `generateToken` is the one symbol defined-by-reference — Task 3 Step 7 resolves it concretely against the property pattern. No "TBD/handle edge cases" placeholders remain.

**Type consistency:** Table/Zod/method names are used identically across Tasks 1→2→3 (`clientProfiles`/`createClientProfile`, `jobInvoices`/`createJobInvoice`, `getJobInvoicesByMerchant({status,clientProfileId})`, `computeQuoteTotals` returns `{subtotalCents,gstCents,totalCents,depositCents}`). `depositValue`/`depositType`/`depositCents` consistent between schema, Zod, and the accept route.
