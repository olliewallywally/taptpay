import "./support/test-env";
import request from "supertest";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage, signedIn } from "./support/http-harness";
import { fakeTrades, seedTrades, CLIENT } from "./support/trades-fake";
import { observeRefusalEffects } from "./support/refusal-effects";
beforeEach(() => resetTestStorage()); afterEach(() => jest.restoreAllMocks());
test.each(["update", "archive", "unarchive", "promote", "events"])("%s rechecks a moved client after lookup without state/history/delivery effects", async action => {
  const { app } = await createTestApp(); const owner = await createOwnerPrincipal(); const other = await createOwnerPrincipal();
  const fake = fakeTrades(); seedTrades(fake, owner.merchantId, { client: { status: "prospect" } });
  fake.events.push({ merchantId: owner.merchantId, clientProfileId: CLIENT, eventType: "private_history" });
  const snapshot = () => JSON.stringify({ clients: [...fake.clients], schedules: [...fake.schedules], events: fake.events });
  let before: string | undefined;
  const lookup = async () => {
    const stale = { ...fake.clients.get(CLIENT) }; fake.clients.get(CLIENT).merchantId = other.merchantId;
    before = snapshot(); return stale;
  };
  jest.spyOn(storage, "getClientProfile").mockImplementation(lookup);
  if (typeof (storage as any).getClientProfileForMerchant === "function") jest.spyOn(storage as any, "getClientProfileForMerchant").mockImplementation(lookup);
  const effects = observeRefusalEffects();
  try {
    const path = `/api/trades/clients/${CLIENT}${action === "update" ? "" : `/${action}`}`;
    const res = await (action === "update" ? request(app).put(path).send({ firstName: "Changed" }) : action === "events" ? request(app).get(path) : request(app).post(path)).set(signedIn(owner));
    expect(res.status).toBe(action === "events" ? 200 : 404);
    if (action === "events") expect(res.body).toEqual([]);
    expect(before).toBeDefined(); expect(snapshot()).toBe(before); expect(fake.writes).toEqual([]); effects.assertNone();
  } finally { effects.restore(); }
});
test("promotion refuses a client archived after lookup without making it active", async () => {
  const { app } = await createTestApp(); const owner = await createOwnerPrincipal();
  const fake = fakeTrades(); seedTrades(fake, owner.merchantId, { client: { status: "prospect" } });
  const lookup = async () => { const stale = { ...fake.clients.get(CLIENT) }; fake.clients.get(CLIENT).status = "archived"; return stale; };
  jest.spyOn(storage, "getClientProfile").mockImplementation(lookup);
  if (typeof (storage as any).getClientProfileForMerchant === "function") jest.spyOn(storage as any, "getClientProfileForMerchant").mockImplementation(lookup);
  const effects = observeRefusalEffects();
  try {
    const res = await request(app).post(`/api/trades/clients/${CLIENT}/promote`).set(signedIn(owner));
    expect(res.status).toBe(409); expect(fake.clients.get(CLIENT).status).toBe("archived"); expect(fake.writes).toEqual([]); effects.assertNone();
  } finally { effects.restore(); }
});
