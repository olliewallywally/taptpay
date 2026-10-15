import "./support/test-env";

import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { DatabaseStorage, MemStorage } from "../storage";

/**
 * R1-T5c: connecting an Apple identity to a signed-in owner's login, and disconnecting it. A linked
 * identity is never moved; a login has one; only an active owner's login takes one.
 */
const KEY = { issuer: "https://appleid.apple.com", clientId: "nz.taptpay.signin.harness", subject: "001234.abcdef.0123" };
const OTHER = { ...KEY, subject: "005678.fedcba.0456" };
const BAD_IDS = [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2, "7" as unknown as number, null as unknown as number];

async function memory() {
  const storage = new MemStorage() as any;
  const business = async (email: string) => {
    const merchant = await storage.createMerchantWithPassword({ name: "A Business", businessName: "A Business", email, status: "verified" }, "hash");
    return { merchant, owner: (await storage.getUserByEmail(email))! };
  };
  const snapshot = () => JSON.stringify([[...storage.merchants.values()], [...storage.users.values()], [...storage.appleIdentities.values()]]);
  return { storage, business, snapshot };
}

describe("R1-T5c — connecting an Apple identity (memory)", () => {
  test("an identity never seen becomes the owner's, with the verified email Apple gave", async () => {
    const { storage, business } = await memory();
    const { owner } = await business("ada@example.test");
    expect(await storage.getAppleIdentityForLogin(owner.id)).toBeUndefined();
    expect(await storage.connectAppleIdentity(owner.id, KEY, { email: "ada.apple@example.test", isPrivateEmail: true })).toBe("connected");
    const row = await storage.getAppleIdentity(KEY);
    expect(row).toMatchObject({ ...KEY, userId: owner.id, email: "ada.apple@example.test", isPrivateEmail: true, linkedAt: expect.any(Date) });
    expect(await storage.getAppleIdentityForLogin(owner.id)).toEqual(row);
  });

  test("a pending identity becomes the owner's as the same row; its email is replaced only by one Apple gives now", async () => {
    const { storage, business } = await memory();
    const { owner } = await business("ada@example.test");
    const pending = await storage.recordPendingAppleIdentity(KEY, { email: "first@example.test", isPrivateEmail: true });
    expect(await storage.connectAppleIdentity(owner.id, KEY, { isPrivateEmail: false })).toBe("connected");
    expect(await storage.getAppleIdentity(KEY)).toMatchObject({ id: pending.id, userId: owner.id, email: "first@example.test", isPrivateEmail: true });

    const second = await business("grace@example.test");
    await storage.recordPendingAppleIdentity(OTHER, { email: "first@example.test", isPrivateEmail: true });
    expect(await storage.connectAppleIdentity(second.owner.id, OTHER, { email: "now@example.test", isPrivateEmail: false })).toBe("connected");
    expect(await storage.getAppleIdentity(OTHER)).toMatchObject({ userId: second.owner.id, email: "now@example.test", isPrivateEmail: false });
  });

  test("the same identity again changes nothing", async () => {
    const { storage, business, snapshot } = await memory();
    const { owner } = await business("ada@example.test");
    await storage.connectAppleIdentity(owner.id, KEY, { email: "ada@example.test", isPrivateEmail: false });
    const before = snapshot();
    expect(await storage.connectAppleIdentity(owner.id, KEY, { email: "other@example.test", isPrivateEmail: true })).toBe("already-connected");
    expect(snapshot()).toBe(before);
  });

  test("an identity that is another login's is never moved", async () => {
    const { storage, business, snapshot } = await memory();
    const first = await business("ada@example.test");
    const second = await business("grace@example.test");
    await storage.connectAppleIdentity(first.owner.id, KEY, { isPrivateEmail: false });
    const before = snapshot();
    expect(await storage.connectAppleIdentity(second.owner.id, KEY, { isPrivateEmail: false })).toBe("identity-taken");
    expect(snapshot()).toBe(before);
    expect(await storage.getAppleIdentityForLogin(second.owner.id)).toBeUndefined();
  });

  test("a login that has an identity takes no second one, and the second is not recorded", async () => {
    const { storage, business, snapshot } = await memory();
    const { owner } = await business("ada@example.test");
    await storage.connectAppleIdentity(owner.id, KEY, { isPrivateEmail: false });
    const before = snapshot();
    expect(await storage.connectAppleIdentity(owner.id, OTHER, { email: "x@example.test", isPrivateEmail: false })).toBe("login-has-another");
    expect(snapshot()).toBe(before);
    expect(await storage.getAppleIdentity(OTHER)).toBeUndefined();
  });

  test("only an active owner's login takes an identity", async () => {
    const { storage, business, snapshot } = await memory();
    const { owner } = await business("ada@example.test");
    const member = { ...owner, id: owner.id + 100, email: "member@example.test", role: "member" };
    storage.users.set(member.id, member);
    const before = snapshot();
    expect(await storage.connectAppleIdentity(member.id, KEY, { isPrivateEmail: false })).toBe("no-login");
    expect(await storage.connectAppleIdentity(owner.id + 999, KEY, { isPrivateEmail: false })).toBe("no-login");
    for (const bad of BAD_IDS) expect([bad, await storage.connectAppleIdentity(bad, KEY, { isPrivateEmail: false })]).toEqual([bad, "no-login"]);
    storage.users.get(owner.id).status = "disabled";
    const disabled = snapshot();
    expect(await storage.connectAppleIdentity(owner.id, KEY, { isPrivateEmail: false })).toBe("no-login");
    expect(snapshot()).toBe(disabled);
    storage.users.get(owner.id).status = "active";
    expect(snapshot()).toBe(before);
    expect(await storage.getAppleIdentity(KEY)).toBeUndefined();
  });

  test("disconnecting removes that login's identity and no one else's", async () => {
    const { storage, business } = await memory();
    const first = await business("ada@example.test");
    const second = await business("grace@example.test");
    await storage.connectAppleIdentity(first.owner.id, KEY, { isPrivateEmail: false });
    await storage.connectAppleIdentity(second.owner.id, OTHER, { isPrivateEmail: false });
    await storage.recordPendingAppleIdentity({ ...KEY, subject: "pending.subject" }, { email: "ada@example.test", isPrivateEmail: false });
    expect(await storage.disconnectAppleIdentity(first.owner.id)).toBe(true);
    expect(await storage.getAppleIdentity(KEY)).toBeUndefined();
    expect(await storage.getAppleIdentityForLogin(first.owner.id)).toBeUndefined();
    expect(await storage.getAppleIdentity(OTHER)).toMatchObject({ userId: second.owner.id });
    expect(storage.appleIdentities.size).toBe(2);
    // Nothing to remove: false, and nothing changes. A pending row belongs to no login and stays.
    expect(await storage.disconnectAppleIdentity(first.owner.id)).toBe(false);
    for (const bad of BAD_IDS) expect([bad, await storage.disconnectAppleIdentity(bad)]).toEqual([bad, false]);
    expect(storage.appleIdentities.size).toBe(2);
    // The identity is unknown again, so it can be connected again.
    expect(await storage.connectAppleIdentity(first.owner.id, KEY, { isPrivateEmail: false })).toBe("connected");
  });

  test("a login's identity is found only by that login's id", async () => {
    const { storage, business } = await memory();
    const { owner } = await business("ada@example.test");
    await storage.recordPendingAppleIdentity(OTHER, { email: "ada@example.test", isPrivateEmail: false });
    for (const bad of BAD_IDS) expect([bad, await storage.getAppleIdentityForLogin(bad)]).toEqual([bad, undefined]);
    expect(await storage.getAppleIdentityForLogin(owner.id)).toBeUndefined();
  });
});

/** Every statement DatabaseStorage issues, in order, with the table it names; no database connection. */
function capture(rows: { owner?: any[]; mine?: any[]; linked?: any[]; removed?: any[] } = {}) {
  const calls: any[] = [];
  const answer = (found: any[]) => {
    const result: any = Promise.resolve(found);
    const chain = (name: string) => (...args: any[]) => { calls[calls.length - 1][name] = args.length === 1 ? args[0] : args; return result; };
    for (const name of ["limit", "returning", "for", "onConflictDoUpdate"]) result[name] = chain(name);
    return result;
  };
  const db: any = {
    transaction: async (run: any) => { calls.push({ kind: "transaction" }); return run(db); },
    select: () => ({ from: (table: any) => ({ where: (where: any) => {
      const name = getTableName(table);
      calls.push({ kind: "select", table: name, where });
      return answer(name === "users" ? rows.owner ?? [{ id: 41 }] : rows.mine ?? []);
    } }) }),
    insert: (table: any) => ({ values: (values: any) => {
      calls.push({ kind: "insert", table: getTableName(table), values });
      return answer(rows.linked ?? [{ id: 7 }]);
    } }),
    delete: (table: any) => ({ where: (where: any) => {
      calls.push({ kind: "delete", table: getTableName(table), where });
      return answer(rows.removed ?? [{ id: 7 }]);
    } }),
  };
  return { storage: new DatabaseStorage(db) as any, calls };
}
const sqlOf = (where: any) => new PgDialect().sqlToQuery(where);
const shape = (calls: any[]) => calls.map((call) => (call.table ? [call.kind, call.table] : [call.kind]));

describe("R1-T5c — PostgreSQL statements", () => {
  test("connecting is one transaction: the owner's login under a row lock, its own identity, then the link", async () => {
    const { storage, calls } = capture();
    expect(await storage.connectAppleIdentity(41, KEY, { email: "ada@example.test", isPrivateEmail: true })).toBe("connected");
    expect(shape(calls)).toEqual([["transaction"], ["select", "users"], ["select", "apple_identities"], ["insert", "apple_identities"]]);
    // Only an active owner's login, and held for the transaction so two connects for one login queue.
    const login = sqlOf(calls[1].where);
    expect(login.sql).toBe('("users"."id" = $1 and "users"."role" = $2 and "users"."status" = $3)');
    expect(login.params).toEqual([41, "owner", "active"]);
    expect(calls[1].for).toBe("update");
    const mine = sqlOf(calls[2].where);
    expect(mine.sql).toBe('"apple_identities"."user_id" = $1');
    expect(mine.params).toEqual([41]);
    expect(calls[3].values).toEqual({ ...KEY, userId: 41, email: "ada@example.test", isPrivateEmail: true, linkedAt: expect.any(Date) });
    // A row that exists is taken over only while it has no login; a linked one is never moved.
    const conflict = calls[3].onConflictDoUpdate;
    expect(sqlOf(conflict.setWhere).sql).toBe('"apple_identities"."user_id" is null');
    expect(conflict.target.map((column: any) => column.name)).toEqual(["issuer", "client_id", "subject"]);
    expect(conflict.set).toMatchObject({ userId: 41, linkedAt: expect.any(Date) });
    // The row's email is replaced only by one given now.
    expect(sqlOf(conflict.set.email).sql).toBe('coalesce(excluded.email, "apple_identities"."email")');
    expect(sqlOf(conflict.set.isPrivateEmail).sql).toBe('case when excluded.email is null then "apple_identities"."is_private_email" else excluded.is_private_email end');
    expect(calls[3]).toHaveProperty("returning");
  });

  test("a token with no email writes none", async () => {
    const { storage, calls } = capture();
    await storage.connectAppleIdentity(41, KEY, { isPrivateEmail: false });
    expect(calls[3].values).toEqual({ ...KEY, userId: 41, email: null, isPrivateEmail: false, linkedAt: expect.any(Date) });
  });

  test("no active owner login: nothing is read or written after the login", async () => {
    const { storage, calls } = capture({ owner: [] });
    expect(await storage.connectAppleIdentity(41, KEY, { isPrivateEmail: false })).toBe("no-login");
    expect(shape(calls)).toEqual([["transaction"], ["select", "users"]]);
  });

  test("the login's own identity decides before anything is written", async () => {
    const same = capture({ mine: [{ id: 7, ...KEY, userId: 41 }] });
    expect(await same.storage.connectAppleIdentity(41, KEY, { isPrivateEmail: false })).toBe("already-connected");
    expect(shape(same.calls)).toEqual([["transaction"], ["select", "users"], ["select", "apple_identities"]]);
    for (const near of [{ ...KEY, issuer: "https://appleid.apple.com.example.test" }, { ...KEY, clientId: "nz.taptpay.other" }, OTHER]) {
      const another = capture({ mine: [{ id: 7, ...near, userId: 41 }] });
      expect(await another.storage.connectAppleIdentity(41, KEY, { isPrivateEmail: false })).toBe("login-has-another");
      expect(shape(another.calls)).toEqual([["transaction"], ["select", "users"], ["select", "apple_identities"]]);
    }
  });

  test("an identity that already has a login is not taken over", async () => {
    const { storage } = capture({ linked: [] });
    expect(await storage.connectAppleIdentity(41, KEY, { isPrivateEmail: false })).toBe("identity-taken");
  });

  test("a login's identity is read, and removed, by its login id alone", async () => {
    const read = capture({ mine: [{ id: 7, ...KEY, userId: 41 }] });
    expect(await read.storage.getAppleIdentityForLogin(41)).toMatchObject({ id: 7, userId: 41 });
    expect(shape(read.calls)).toEqual([["select", "apple_identities"]]);
    expect(sqlOf(read.calls[0].where)).toMatchObject({ sql: '"apple_identities"."user_id" = $1', params: [41] });

    const removed = capture();
    expect(await removed.storage.disconnectAppleIdentity(41)).toBe(true);
    expect(shape(removed.calls)).toEqual([["delete", "apple_identities"]]);
    expect(sqlOf(removed.calls[0].where)).toMatchObject({ sql: '"apple_identities"."user_id" = $1', params: [41] });
    expect(removed.calls[0]).toHaveProperty("returning");
    expect(await capture({ removed: [] }).storage.disconnectAppleIdentity(41)).toBe(false);
  });

  test("an id that is not a login id issues no statement at all", async () => {
    for (const bad of BAD_IDS) {
      const { storage, calls } = capture();
      expect(await storage.connectAppleIdentity(bad, KEY, { isPrivateEmail: false })).toBe("no-login");
      expect(await storage.getAppleIdentityForLogin(bad)).toBeUndefined();
      expect(await storage.disconnectAppleIdentity(bad)).toBe(false);
      expect([bad, calls]).toEqual([bad, []]);
    }
  });
});
