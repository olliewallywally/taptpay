import "./support/test-env";

import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { AppleIdentityTakenError, DatabaseStorage, MemStorage } from "../storage";

const KEY = { issuer: "https://appleid.apple.com", clientId: "nz.taptpay.signin.harness", subject: "001234.abcdef.0123" };
const OTHER = { ...KEY, subject: "005678.fedcba.0456" };
const NEW = { name: "Ada Appleton", businessName: "Ada Appleton", email: "ada@example.test" };

describe("R1-T5b — Apple identities (memory)", () => {
  test("an identity is found only by its issuer, client id and subject together", async () => {
    const storage = new MemStorage() as any;
    await storage.recordPendingAppleIdentity(KEY, { email: "ada@example.test", isPrivateEmail: false });
    expect(await storage.getAppleIdentity(KEY)).toMatchObject({ ...KEY, userId: null, email: "ada@example.test", linkedAt: null });
    for (const near of [{ ...KEY, issuer: "https://appleid.apple.com.example.test" }, { ...KEY, clientId: "nz.taptpay.other" }, OTHER]) {
      expect(await storage.getAppleIdentity(near)).toBeUndefined();
    }
  });

  test("recording a pending identity never changes one that exists, except to keep a first email it lacked", async () => {
    const storage = new MemStorage() as any;
    const first = await storage.recordPendingAppleIdentity(KEY, { isPrivateEmail: false });
    expect(first).toMatchObject({ userId: null, email: null });
    // The first email it is given is kept; a later, different one is not.
    expect(await storage.recordPendingAppleIdentity(KEY, { email: "ada@example.test", isPrivateEmail: true })).toMatchObject({ id: first.id, email: "ada@example.test", isPrivateEmail: true });
    expect(await storage.recordPendingAppleIdentity(KEY, { email: "other@example.test", isPrivateEmail: false })).toMatchObject({ id: first.id, email: "ada@example.test", isPrivateEmail: true });
    // A linked identity is left exactly as it is.
    const made = await storage.createMerchantWithAppleIdentity({ ...NEW, email: "linked@example.test" }, "hash", OTHER, { isPrivateEmail: false });
    const linked = { ...(await storage.getAppleIdentity(OTHER)) };
    expect(await storage.recordPendingAppleIdentity(OTHER, { email: "attacker@example.test", isPrivateEmail: true })).toEqual(linked);
    expect(linked.userId).toBe(made.userId);
  });

  test("a new business, its owner login and its identity are made together", async () => {
    const storage = new MemStorage() as any;
    const { merchant, userId } = await storage.createMerchantWithAppleIdentity({ ...NEW, email: "  ADA@Example.Test " }, "hash", KEY, { isPrivateEmail: true });
    expect(merchant).toMatchObject({ email: "ada@example.test", name: "Ada Appleton", status: "verified" });
    expect(await storage.getUserById(userId)).toMatchObject({ merchantId: merchant.id, role: "owner", email: "ada@example.test", status: "active" });
    expect(await storage.getAppleIdentity(KEY)).toMatchObject({ userId, email: "ada@example.test", isPrivateEmail: true, linkedAt: expect.any(Date) });
    expect(await storage.getSubscription(merchant.id)).toBeDefined();
  });

  test("a pending identity becomes the new login's; a linked one is never moved, and nothing is made", async () => {
    const storage = new MemStorage() as any;
    const pending = await storage.recordPendingAppleIdentity(KEY, { email: "ada@example.test", isPrivateEmail: false });
    const made = await storage.createMerchantWithAppleIdentity(NEW, "hash", KEY, { isPrivateEmail: false });
    expect(await storage.getAppleIdentity(KEY)).toMatchObject({ id: pending.id, userId: made.userId });
    const before = JSON.stringify([[...storage.merchants.values()], [...storage.users.values()], [...storage.appleIdentities.values()]]);
    await expect(storage.createMerchantWithAppleIdentity({ ...NEW, email: "second@example.test" }, "hash", KEY, { isPrivateEmail: false }))
      .rejects.toBeInstanceOf(AppleIdentityTakenError);
    expect(JSON.stringify([[...storage.merchants.values()], [...storage.users.values()], [...storage.appleIdentities.values()]])).toBe(before);
  });

  test("an address a business or a login already uses makes nothing", async () => {
    const storage = new MemStorage() as any;
    await storage.createMerchantWithAppleIdentity(NEW, "hash", KEY, { isPrivateEmail: false });
    const before = JSON.stringify([[...storage.merchants.values()], [...storage.users.values()], [...storage.appleIdentities.values()]]);
    await expect(storage.createMerchantWithAppleIdentity({ ...NEW, email: "ADA@example.test" }, "hash", OTHER, { isPrivateEmail: false })).rejects.toThrow();
    expect(JSON.stringify([[...storage.merchants.values()], [...storage.users.values()], [...storage.appleIdentities.values()]])).toBe(before);
    expect(await storage.getAppleIdentity(OTHER)).toBeUndefined();
  });
});

/** Every statement DatabaseStorage issues, in order, with the table it names; no database connection. */
function capture(options: { linked?: boolean; exists?: boolean } = {}) {
  const calls: any[] = [];
  const answer = (rows: any[]) => {
    const result: any = Promise.resolve(rows);
    const chain = (name: string) => (...args: any[]) => { calls[calls.length - 1][name] = args.length === 1 ? args[0] : args; return result; };
    for (const name of ["limit", "returning", "for", "onConflictDoNothing", "onConflictDoUpdate"]) result[name] = chain(name);
    return result;
  };
  const db: any = {
    transaction: async (run: any) => { calls.push({ kind: "transaction" }); return run(db); },
    select: () => ({ from: (table: any) => ({ where: (where: any) => {
      calls.push({ kind: "select", table: getTableName(table), where });
      return answer(getTableName(table) === "users" ? [{ id: 41 }] : [{ id: 7, userId: null }]);
    } }) }),
    insert: (table: any) => ({ values: (values: any) => {
      const name = getTableName(table);
      calls.push({ kind: "insert", table: name, values });
      if (name === "merchants") return answer([{ id: 29, email: values.email, name: values.name }]);
      if (name === "apple_identities") return answer(options.linked === false ? [] : options.exists ? [] : [{ id: 7 }]);
      return answer([{ id: 1 }]);
    } }),
    update: (table: any) => ({ set: (set: any) => ({ where: (where: any) => {
      calls.push({ kind: "update", table: getTableName(table), set, where });
      return answer([{ id: 29, email: "ada@example.test", name: "Ada Appleton" }]);
    } }) }),
  };
  return { storage: new DatabaseStorage(db) as any, calls };
}
const sqlOf = (where: any) => new PgDialect().sqlToQuery(where);

describe("R1-T5b — PostgreSQL statements", () => {
  test("the lookup names issuer, client id and subject in one predicate", async () => {
    const { storage, calls } = capture();
    await storage.getAppleIdentity(KEY);
    expect(calls.map((call) => [call.kind, call.table])).toEqual([["select", "apple_identities"]]);
    const query = sqlOf(calls[0].where);
    expect(query.sql).toBe('("apple_identities"."issuer" = $1 and "apple_identities"."client_id" = $2 and "apple_identities"."subject" = $3)');
    expect(query.params).toEqual([KEY.issuer, KEY.clientId, KEY.subject]);
  });

  test("a pending identity is inserted with no login, and an existing row is not replaced", async () => {
    const { storage, calls } = capture();
    await storage.recordPendingAppleIdentity(KEY, { email: "ada@example.test", isPrivateEmail: true });
    expect(calls.map((call) => [call.kind, call.table])).toEqual([["insert", "apple_identities"]]);
    expect(calls[0].values).toEqual({ ...KEY, userId: null, email: "ada@example.test", isPrivateEmail: true });
    expect(calls[0]).toHaveProperty("onConflictDoNothing");
    // It exists already: only a pending row with no email may take the first email; then it is read back.
    const existing = capture({ exists: true });
    await existing.storage.recordPendingAppleIdentity(KEY, { email: "ada@example.test", isPrivateEmail: true });
    expect(existing.calls.map((call) => [call.kind, call.table])).toEqual([["insert", "apple_identities"], ["update", "apple_identities"], ["select", "apple_identities"]]);
    expect(existing.calls[1].set).toEqual({ email: "ada@example.test", isPrivateEmail: true });
    const guard = sqlOf(existing.calls[1].where);
    expect(guard.sql).toContain('"apple_identities"."user_id" is null');
    expect(guard.sql).toContain('"apple_identities"."email" is null');
    expect(guard.params).toEqual([KEY.issuer, KEY.clientId, KEY.subject]);
  });

  test("the business, its owner login and the identity are written in one transaction, the identity for that owner", async () => {
    const { storage, calls } = capture();
    const made = await storage.createMerchantWithAppleIdentity(NEW, "hash", KEY, { isPrivateEmail: true });
    expect(made.userId).toBe(41);
    expect(calls[0]).toEqual({ kind: "transaction" });
    expect(calls.filter((call) => call.kind === "transaction")).toHaveLength(1);
    const identity = calls[calls.length - 1];
    expect([identity.kind, identity.table]).toEqual(["insert", "apple_identities"]);
    expect(identity.values).toEqual({ ...KEY, userId: 41, email: "ada@example.test", isPrivateEmail: true, linkedAt: expect.any(Date) });
    // A row that exists is taken over only while it has no login.
    expect(sqlOf(identity.onConflictDoUpdate.setWhere).sql).toBe('"apple_identities"."user_id" is null');
    expect(identity.onConflictDoUpdate.set).toMatchObject({ userId: 41, linkedAt: expect.any(Date) });
    // The owner it links is the new business's own.
    const owner = calls.filter((call) => call.kind === "select" && call.table === "users").pop();
    expect(sqlOf(owner.where).params).toEqual([29, "owner"]);
  });

  test("an identity that already has a login makes the whole creation fail", async () => {
    const { storage } = capture({ linked: false });
    await expect(storage.createMerchantWithAppleIdentity(NEW, "hash", KEY, { isPrivateEmail: false })).rejects.toBeInstanceOf(AppleIdentityTakenError);
  });
});
