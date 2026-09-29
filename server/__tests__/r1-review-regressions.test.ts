import './support/test-env';
import './support/push-test-env';
import { isStreamSessionActive } from "../auth";
import request from 'supertest';
import dns from 'node:dns';
import { extractSourceInventory } from '../route-inventory';
import { SseBroker } from '../sse-broker';
import { startGoogleSignIn, verifyGoogleSignInState, OAUTH_STATE_TTL_MS } from '../google-sign-in';
import { takeNetworkViolations } from './support/no-network';
import { bearer, createOwnerPrincipal, createTestApp, resetTestStorage, storage } from './support/http-harness';

beforeEach(() => resetTestStorage());

test('REVIEW T1: DNS query for localhost cannot dispatch to an off-machine resolver', async () => {
  const resolver = new dns.Resolver();
  resolver.setServers(['192.0.2.53']); // configure only; never contact it
  const dispatch = jest.spyOn((resolver as any)._handle, 'queryA').mockReturnValue(-3008);
  try {
    try { await new Promise<void>(resolve => resolver.resolve4('localhost', () => resolve())); } catch { /* native dispatch stub returns ENOTFOUND synchronously */ }
    // Native dispatch is replaced before the call, so this test makes NO DNS request.
    expect(dispatch).not.toHaveBeenCalled();
  } finally { dispatch.mockRestore(); takeNetworkViolations(); }
});

test('REVIEW T2: an explicit OPTIONS route must appear in source inventory', () => {
  const inventory = extractSourceInventory('import express from "express"; const app = express(); app.options("/review-uninventoried", (_req, res) => res.sendStatus(204));', 'server/index.ts');
  expect(inventory.registrations).toEqual([expect.objectContaining({method:'OPTIONS',path:'/review-uninventoried'})]);
});

test.each([['/api/push/native-subscribe', {deviceToken: 'review-lost-device'}], ['/api/push/subscribe', {subscription: {endpoint: 'https://fcm.googleapis.com/fcm/send/review-lost-device', keys: {p256dh: 'test-key', auth: 'test-auth'}}}]])('in-flight %s cannot reactivate push after sign-out everywhere', async (path, body) => {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  let entered!: () => void;
  let release!: () => void;
  const atWrite = new Promise<void>(resolve => { entered = resolve; });
  const mayWrite = new Promise<void>(resolve => { release = resolve; });
  const original = storage.createPushSubscription.bind(storage);
  const spy = jest.spyOn(storage, 'createPushSubscription').mockImplementation(async data => {
    entered(); await mayWrite; return original(data);
  });
  const pending = request(app).post(path as string).set(bearer(owner))
    .send(body).then(response => response);
  try {
    await atWrite;
    const ended = await request(app).post('/api/auth/sign-out-everywhere').set(bearer(owner));
    expect(ended.status).toBe(204);
    expect((await request(app).get('/api/auth/me').set(bearer(owner))).status).toBe(401);
    release();
    const registered = await pending;
    const active = await storage.getPushSubscriptionsByMerchant(owner.merchantId);
    expect({status:registered.status, active:active.map(row => row.endpoint)})
      .toEqual({status:401, active:[]});
  } finally { release(); await pending; spy.mockRestore(); }
});

test('REVIEW T4: a retained OAuth state is refused after the ten-minute TTL', () => {
  const start = startGoogleSignIn();
  const clock = jest.spyOn(Date,'now').mockReturnValue(Date.now()+OAUTH_STATE_TTL_MS+1);
  try { expect(verifyGoogleSignInState(start.cookieValue,start.state)).toBeNull(); }
  finally { clock.mockRestore(); }
});

test('a revoked login cannot receive a private event from another instance', async () => {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const otherInstance = new SseBroker();
  const connection = {write: jest.fn(), end: jest.fn()};
  otherInstance.subscribe(owner.merchantId, {kind: 'merchant', userId: owner.user.id, principal: 'user'}, connection,
    () => isStreamSessionActive(`Bearer ${owner.token}`));
  try {
    connection.write.mockClear();
    await otherInstance.broadcast(owner.merchantId, null, {type: 'transaction_updated', transactionId: 1});
    expect(connection.write).toHaveBeenCalledTimes(1);
    connection.write.mockClear();
    expect((await request(app).post('/api/auth/sign-out-everywhere').set(bearer(owner))).status).toBe(204);
    await otherInstance.broadcast(owner.merchantId, null, {type: 'transaction_updated', transactionId: 2});
    expect(connection.write).not.toHaveBeenCalled();
    expect(connection.end).toHaveBeenCalledTimes(1);
  } finally { otherInstance.clear(); }
});

test('the production events route installs a shared-session validator', async () => {
  const { sseBroker } = await import('../sse-broker');
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  let authorize: (() => Promise<boolean>) | undefined;
  const subscribe = jest.spyOn(sseBroker, 'subscribe').mockImplementation((_merchant, _audience, connection, check) => {
    authorize = check;
    connection.end?.();
    return () => undefined;
  });
  try {
    expect((await request(app).get(`/api/merchants/${owner.merchantId}/events`).set(bearer(owner))).status).toBe(200);
    expect(authorize).toEqual(expect.any(Function));
    expect(await authorize!()).toBe(true);
    // A different instance advances shared storage without notifying this broker.
    await storage.advanceUserSessionVersion(owner.user.id);
    expect(await authorize!()).toBe(false);
  } finally { subscribe.mockRestore(); }
});

test('a remote revocation closes even an idle authenticated stream on its next check', async () => {
  const owner = await createOwnerPrincipal();
  const broker = new SseBroker();
  const connection = {write: jest.fn(), end: jest.fn()};
  jest.useFakeTimers();
  try {
    broker.subscribe(owner.merchantId, {kind: 'merchant', userId: owner.user.id, principal: 'user'}, connection,
      () => isStreamSessionActive(`Bearer ${owner.token}`));
    await storage.advanceUserSessionVersion(owner.user.id);
    await jest.advanceTimersByTimeAsync(5000);
    expect(connection.end).toHaveBeenCalledTimes(1);
    expect(broker.subscriberCount()).toBe(0);
  } finally { broker.clear(); jest.useRealTimers(); }
});

test('editing a retained OAuth cookie cannot extend its server-enforced lifetime', () => {
  const start = startGoogleSignIn();
  const parts = start.cookieValue.split('.');
  parts[2] = String(Date.now() + 1);
  expect(verifyGoogleSignInState(parts.join('.'), start.state)).toBeNull();
  expect(verifyGoogleSignInState(start.cookieValue, start.state)).not.toBeNull();
});
