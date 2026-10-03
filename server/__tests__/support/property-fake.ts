/**
 * The property records, faked (C10 batch 6c; shared since R1-T3 batch (h)). The in-memory storage has
 * no property tables (its property methods answer nothing or throw), so the tenants, automations,
 * invoices and their history live here, in maps, with every read and write recorded. The technique of
 * invoice-document-attach-ownership.test.ts. What a test with it proves is the routes' decisions; the
 * SQL behind them is PostgreSQL's (the local convergence rehearsal).
 *
 * Call fakeProperty() in a test after resetTestStorage(); jest restores the spies between tests.
 */
import * as billing from "../../billing-card";
import * as propertyCron from "../../property-cron";
import { nextRunDateAfter } from "../../property-schedule";
import { parseInvoiceDocumentRef } from "../../upload-policy";
import { randomUUID } from "node:crypto";
import { storage } from "./http-harness";

export const TENANT = "22222222-2222-4222-8222-222222222222";
export const SCHEDULE = "33333333-3333-4333-8333-333333333333";
export const INVOICE = "44444444-4444-4444-8444-444444444444";
export const MISSING = "99999999-9999-4999-8999-999999999999";
/** The ids the fake gives what it makes. */
export const MADE_TENANT = "77777777-7777-4777-8777-777777777777";
export const MADE_SCHEDULE = "55555555-5555-4555-8555-555555555555";
export const MADE_INVOICE = "66666666-6666-4666-8666-666666666666";
const DAY = 86_400_000;
export const inDays = (days: number) => new Date(Date.now() + days * DAY);

export interface PropertyFake {
  tenants: Map<string, any>;
  schedules: Map<string, any>;
  invoices: Map<string, any>;
  /** The history logged (logTransactionEvent), oldest first. */
  events: any[];
  reads: string[];
  writes: string[];
}

export function fakeProperty(): PropertyFake {
  const fake: PropertyFake = { tenants: new Map(), schedules: new Map(), invoices: new Map(), events: [], reads: [], writes: [] };
  const read = (name: string, rows: Map<string, any>) =>
    jest.spyOn(storage as any, name).mockImplementation(async (id: unknown) => {
      fake.reads.push(name);
      return rows.get(id as string);
    });
  read("getTenantProfile", fake.tenants);
  jest.spyOn(storage, "getTenantProfileForMerchant").mockImplementation(async (id, merchantId) => {
    fake.reads.push("getTenantProfile");
    const row = fake.tenants.get(id);
    return row?.merchantId === merchantId ? row : undefined;
  });
  read("getActiveSchedule", fake.schedules);
  jest.spyOn(storage, "getActiveScheduleForMerchant").mockImplementation(async (id, merchantId) => {
    fake.reads.push("getActiveSchedule");
    const row = fake.schedules.get(id);
    return row?.merchantId === merchantId && fake.tenants.get(row.tenantProfileId)?.merchantId === merchantId ? row : undefined;
  });
  read("getInvoiceRentRequest", fake.invoices);
  jest.spyOn(storage, "getInvoiceRentRequestForMerchant").mockImplementation(async (id, merchantId) => {
    fake.reads.push("getInvoiceRentRequest");
    const row = fake.invoices.get(id);
    return row?.merchantId === merchantId && fake.tenants.get(row.tenantProfileId)?.merchantId === merchantId ? row : undefined;
  });
  const list = (name: string, rows: (...args: any[]) => any[]) =>
    jest.spyOn(storage as any, name).mockImplementation(async (...args: any[]) => {
      fake.reads.push(name);
      return rows(...args);
    });
  list("getTenantProfilesByMerchant", () => [...fake.tenants.values()]);
  list("getActiveSchedulesByMerchant", (merchantId: number) => [...fake.schedules.values()]
    .filter(row => row.merchantId === merchantId && fake.tenants.get(row.tenantProfileId)?.merchantId === merchantId));
  list("getInvoiceRentRequestsByMerchant", (merchantId: number) => [...fake.invoices.values()]
    .filter(row => row.merchantId === merchantId && fake.tenants.get(row.tenantProfileId)?.merchantId === merchantId));
  // Newest first, as the tenant's history screen reads it.
  list("getTransactionEventsByTenant", (tenantId: string) => fake.events.filter((row) => row.tenantProfileId === tenantId).reverse());
  jest.spyOn(storage, "getTransactionEventsByTenantForMerchant").mockImplementation(async (id, merchantId, limit = 100) => {
    fake.reads.push("getTransactionEventsByTenant");
    if (fake.tenants.get(id)?.merchantId !== merchantId) return [];
    return fake.events.filter(row => row.tenantProfileId === id && row.merchantId === merchantId).reverse().slice(0, limit);
  });
  const write = (name: string, apply: (...args: any[]) => any) =>
    jest.spyOn(storage as any, name).mockImplementation(async (...args: any[]) => {
      if (["updateTenantProfileForMerchant", "archiveTenantProfileForMerchant", "unarchiveTenantProfileForMerchant"].includes(name)) {
        const [id, merchantId, updates] = args;
        if (fake.tenants.get(id)?.merchantId !== merchantId) return undefined;
        fake.writes.push(name.replace("ForMerchant", ""));
        return apply(id, updates);
      }
      fake.writes.push(name.replace("ForMerchant", ""));
      return apply(...args);
    });
  write("createTenantProfileForMerchant", (merchantId: number, input: any) => {
    const data = { ...input, merchantId };
    const row = { id: MADE_TENANT, status: "active", ...data };
    fake.tenants.set(row.id, row);
    return row;
  });
  // As Drizzle does (mapUpdateSet), an update leaves out every field whose value is undefined.
  write("updateTenantProfileForMerchant", (id: string, updates: any) =>
    Object.assign(fake.tenants.get(id), Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined))));
  write("archiveTenantProfileForMerchant", (id: string) => {
    const row = fake.tenants.get(id);
    Object.assign(row, { status: "archived" });
    for (const schedule of fake.schedules.values()) {
      if (schedule.tenantProfileId === id && schedule.merchantId === row.merchantId && schedule.status !== "terminated") {
        Object.assign(schedule, { status: "terminated", terminatedAt: new Date() });
      }
    }
    return row;
  });
  write("unarchiveTenantProfileForMerchant", (id: string) => Object.assign(fake.tenants.get(id), { status: "active" }));
  jest.spyOn(storage, "createActiveScheduleForMerchant").mockImplementation(async (tenantProfileId, merchantId, data) => {
    const parent = fake.tenants.get(tenantProfileId);
    if (parent?.merchantId !== merchantId) return { kind: "not-found" };
    if (parent.status === "archived") return { kind: "conflict", reason: "archived" };
    const replaced = [...fake.schedules.values()].filter(row => row.tenantProfileId === tenantProfileId && row.merchantId === merchantId && row.status !== "terminated");
    fake.writes.push("createActiveSchedule");
    const schedule = { ...data, id: MADE_SCHEDULE, merchantId, tenantProfileId, status: "active", nextRunDate: data.startDate } as any;
    for (const old of replaced) Object.assign(old, { status: "terminated", terminatedAt: new Date() });
    fake.schedules.set(schedule.id, schedule);
    await storage.logTransactionEvent({ merchantId, tenantProfileId, scheduleId: schedule.id, eventType: "Schedule_Created", payload: { amountCents: schedule.amountCents, frequency: schedule.frequency } });
    for (const old of replaced) await storage.logTransactionEvent({ merchantId, tenantProfileId, scheduleId: old.id, eventType: "Schedule_Terminated", payload: { replacedBy: schedule.id } });
    return { kind: "ok", schedule };
  });
  write("updateActiveSchedule", (id: string, updates: any) => Object.assign(fake.schedules.get(id), updates));
  const mutateSchedule = async (id: string, merchantId: number, data?: any): Promise<any> => {
    const schedule = fake.schedules.get(id); const parent = fake.tenants.get(schedule?.tenantProfileId);
    if (schedule?.merchantId !== merchantId || parent?.merchantId !== merchantId) return { kind: "not-found" };
    if (data && schedule.status === "terminated") return { kind: "conflict", reason: "terminated" };
    if (data && parent.status === "archived") return { kind: "conflict", reason: "archived" };
    const updates = data ? { ...data } : { status: "terminated", terminatedAt: new Date() };
    if (schedule.status === "paused" && updates.status === "active") updates.nextRunDate = nextRunDateAfter(new Date(schedule.nextRunDate), updates.frequency ?? schedule.frequency, new Date());
    fake.writes.push(data ? "updateActiveSchedule" : "terminateActiveSchedule");
    Object.assign(schedule, updates);
    const eventType = !data ? "Schedule_Terminated" : data.status === "paused" ? "Schedule_Paused" : data.status === "active" ? "Schedule_Resumed" : undefined;
    if (eventType) await storage.logTransactionEvent({ merchantId, tenantProfileId: schedule.tenantProfileId, scheduleId: id, eventType, payload: {} });
    return { kind: "ok", schedule };
  };
  jest.spyOn(storage, "updateActiveScheduleForMerchant").mockImplementation(mutateSchedule);
  jest.spyOn(storage, "terminateActiveScheduleForMerchant").mockImplementation((id, merchantId) => mutateSchedule(id, merchantId));
  write("createInvoiceRentRequest", (data: any) => {
    const row = { id: MADE_INVOICE, ...data };
    fake.invoices.set(row.id, row);
    return row;
  });
  jest.spyOn(storage, "createOrReuseInvoiceRentRequestForMerchant").mockImplementation(async (tenantProfileId, merchantId, data) => {
    if (fake.tenants.get(tenantProfileId)?.merchantId !== merchantId) return { kind: "not-found" };
    if (data.documentUrl) {
      const ref = parseInvoiceDocumentRef(data.documentUrl);
      if (!ref || !(await storage.uploadedFileOwnedByMerchant(ref.relPath, merchantId))) return { kind: "invalid-document" };
    }
    if (data.kind !== "charge") {
      const live = [...fake.invoices.values()].filter(row => row.tenantProfileId === tenantProfileId && row.merchantId === merchantId
        && ["pending_dispatch", "dispatched", "overdue", "dispatch_failed"].includes(row.status))
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))[0];
      if (live && live.kind !== "charge") {
        if (live.amountCents !== data.amountCents) { fake.writes.push("updateInvoiceRentRequest"); Object.assign(live, { amountCents: data.amountCents, updatedAt: new Date() }); }
        return { kind: "ok", invoice: live, reused: true };
      }
    }
    fake.writes.push("createInvoiceRentRequest");
    const invoice = { ...data, id: fake.invoices.has(MADE_INVOICE) ? randomUUID() : MADE_INVOICE,
      merchantId, tenantProfileId, kind: data.kind || "rent", status: "pending_dispatch", token: `synthetic-${randomUUID()}`, createdAt: new Date() } as any;
    fake.invoices.set(invoice.id, invoice);
    await storage.logTransactionEvent({ merchantId, tenantProfileId, invoiceId: invoice.id,
      eventType: data.kind === "charge" ? "Charge_Created" : "Invoice_Generated",
      payload: { amountCents: invoice.amountCents, channel: invoice.deliveryChannel,
        ...(data.kind === "charge" ? { chargeType: data.chargeType, description: data.description } : {}) } });
    return { kind: "ok", invoice, reused: false };
  });
  write("updateInvoiceRentRequest", (id: string, updates: any) => Object.assign(fake.invoices.get(id), updates));
  const mutateInvoice = async (id: string, merchantId: number, operation: "void" | "paid-external", externalPaymentReference?: string): Promise<any> => {
    const invoice = fake.invoices.get(id); const parent = fake.tenants.get(invoice?.tenantProfileId);
    if (invoice?.merchantId !== merchantId || parent?.merchantId !== merchantId) return { kind: "not-found" };
    if (["paid", "paid_external"].includes(invoice.status)) return { kind: "conflict", reason: "paid" };
    if (operation === "paid-external" && invoice.status === "voided") return { kind: "conflict", reason: "voided" };
    fake.writes.push("updateInvoiceRentRequest");
    const now = new Date();
    Object.assign(invoice, operation === "void" ? { status: "voided", voidedAt: now, updatedAt: now }
      : { status: "paid_external", paidAt: now, externalPaymentReference: externalPaymentReference ?? null, updatedAt: now });
    await storage.logTransactionEvent({ merchantId, tenantProfileId: parent.id, invoiceId: id,
      eventType: operation === "void" ? "Invoice_Voided" : "Payment_External",
      payload: operation === "void" ? {} : { externalPaymentReference } });
    return { kind: "ok", invoice };
  };
  jest.spyOn(storage, "voidInvoiceRentRequestForMerchant").mockImplementation((id, merchantId) => mutateInvoice(id, merchantId, "void"));
  jest.spyOn(storage, "markInvoiceRentRequestPaidExternalForMerchant").mockImplementation((id, merchantId, reference) => mutateInvoice(id, merchantId, "paid-external", reference));
  write("logTransactionEvent", (data: any) => {
    const row = { id: `event-${fake.events.length + 1}`, createdAt: new Date(), ...data };
    fake.events.push(row);
    return row;
  });
  jest.spyOn(billing, "billingCardIsReady").mockReturnValue(true);
  jest.spyOn(propertyCron, "resendInvoiceEmailForMerchant").mockImplementation(async (id: string, merchantId: number) => {
    const invoice = fake.invoices.get(id);
    if (invoice?.merchantId !== merchantId || fake.tenants.get(invoice.tenantProfileId)?.merchantId !== merchantId) return { ok: false, reason: "not_found" };
    if (["paid", "paid_external", "voided"].includes(invoice.status)) return { ok: false, reason: "not_payable" };
    fake.writes.push("resendInvoiceEmail");
    return { ok: true, invoice };
  });
  return fake;
}

/** A business with one tenant, one weekly automation and one sent invoice, all its own. */
export function seedProperty(fake: PropertyFake, merchantId: number, state: { tenant?: object; schedule?: object; invoice?: object } = {}) {
  fake.tenants.set(TENANT, {
    id: TENANT, merchantId, firstName: "Tess", lastName: "Tenant", propertyAddress: "1 Test Road",
    email: "tess@example.test", preferredChannel: "email", status: "active", ...state.tenant,
  });
  fake.schedules.set(SCHEDULE, {
    id: SCHEDULE, merchantId, tenantProfileId: TENANT, amountCents: 50_000, frequency: "weekly",
    deliveryChannel: "email", status: "active", nextRunDate: inDays(3), ...state.schedule,
  });
  fake.invoices.set(INVOICE, {
    id: INVOICE, merchantId, tenantProfileId: TENANT, amountCents: 50_000, status: "dispatched",
    token: "checkout-token", deliveryChannel: "email", ...state.invoice,
  });
}
