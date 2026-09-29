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
  read("getActiveSchedule", fake.schedules);
  read("getInvoiceRentRequest", fake.invoices);
  const list = (name: string, rows: (...args: any[]) => any[]) =>
    jest.spyOn(storage as any, name).mockImplementation(async (...args: any[]) => {
      fake.reads.push(name);
      return rows(...args);
    });
  list("getTenantProfilesByMerchant", () => [...fake.tenants.values()]);
  list("getActiveSchedulesByMerchant", () => [...fake.schedules.values()]);
  jest.spyOn(storage as any, "getActiveSchedulesByTenant").mockImplementation(async (tenantId: unknown) => {
    fake.reads.push("getActiveSchedulesByTenant");
    return [...fake.schedules.values()].filter((row) => row.tenantProfileId === tenantId);
  });
  list("getInvoiceRentRequestsByMerchant", () => [...fake.invoices.values()]);
  // Newest first, as the tenant's history screen reads it.
  list("getTransactionEventsByTenant", (tenantId: string) => fake.events.filter((row) => row.tenantProfileId === tenantId).reverse());
  jest.spyOn(storage, "getLiveInvoiceByTenant").mockResolvedValue(undefined as any);
  const write = (name: string, apply: (...args: any[]) => any) =>
    jest.spyOn(storage as any, name).mockImplementation(async (...args: any[]) => {
      fake.writes.push(name);
      return apply(...args);
    });
  write("createTenantProfile", (data: any) => {
    const row = { id: MADE_TENANT, status: "active", ...data };
    fake.tenants.set(row.id, row);
    return row;
  });
  // As Drizzle does (mapUpdateSet), an update leaves out every field whose value is undefined.
  write("updateTenantProfile", (id: string, updates: any) =>
    Object.assign(fake.tenants.get(id), Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined))));
  write("archiveTenantProfile", (id: string) => Object.assign(fake.tenants.get(id), { status: "archived" }));
  write("unarchiveTenantProfile", (id: string) => Object.assign(fake.tenants.get(id), { status: "active" }));
  write("createActiveSchedule", (data: any) => {
    const row = { id: MADE_SCHEDULE, status: "active", ...data };
    fake.schedules.set(row.id, row);
    return row;
  });
  write("updateActiveSchedule", (id: string, updates: any) => Object.assign(fake.schedules.get(id), updates));
  write("terminateActiveSchedule", (id: string) => Object.assign(fake.schedules.get(id), { status: "terminated", terminatedAt: new Date() }));
  write("createInvoiceRentRequest", (data: any) => {
    const row = { id: MADE_INVOICE, ...data };
    fake.invoices.set(row.id, row);
    return row;
  });
  write("updateInvoiceRentRequest", (id: string, updates: any) => Object.assign(fake.invoices.get(id), updates));
  write("logTransactionEvent", (data: any) => {
    const row = { id: `event-${fake.events.length + 1}`, createdAt: new Date(), ...data };
    fake.events.push(row);
    return row;
  });
  jest.spyOn(billing, "billingCardIsReady").mockReturnValue(true);
  jest.spyOn(propertyCron, "resendInvoiceEmail").mockImplementation(async (id: string) => {
    fake.writes.push("resendInvoiceEmail");
    return { ok: true, invoice: fake.invoices.get(id) };
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
