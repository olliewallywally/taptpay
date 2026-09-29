import { reconcileExistingWebPushSubscription } from "./use-push-notifications";

function encoded(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function subscription(endpoint: string, applicationServerKey: number[]) {
  return {
    endpoint,
    options: {
      applicationServerKey: Uint8Array.from(applicationServerKey).buffer,
    },
    toJSON: () => ({
      endpoint,
      keys: { p256dh: "browser-public", auth: "browser-auth" },
    }),
    unsubscribe: jest.fn().mockResolvedValue(true),
  } as unknown as PushSubscription;
}

describe("web-push VAPID rotation recovery", () => {
  test("replaces an existing subscription whose application-server key changed", async () => {
    const stale = subscription("https://push.example.test/stale", [1, 2, 3]);
    const replacement = subscription("https://push.example.test/replacement", [4, 5, 6]);
    const pushManager = {
      getSubscription: jest.fn().mockResolvedValue(stale),
      subscribe: jest.fn().mockResolvedValue(replacement),
    };
    const request = jest.fn().mockResolvedValue({ ok: true });

    await expect(reconcileExistingWebPushSubscription(
      { pushManager } as unknown as ServiceWorkerRegistration,
      encoded([4, 5, 6]),
      request as unknown as typeof fetch,
    )).resolves.toBe(true);

    expect(stale.unsubscribe).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenNthCalledWith(1, "/api/push/unsubscribe", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ endpoint: stale.endpoint }),
    }));
    expect(pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({
      userVisibleOnly: true,
      applicationServerKey: Uint8Array.from([4, 5, 6]),
    }));
    expect(request).toHaveBeenNthCalledWith(2, "/api/push/subscribe", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ subscription: replacement.toJSON() }),
    }));
  });

  test("keeps a matching subscription without touching the server", async () => {
    const current = subscription("https://push.example.test/current", [7, 8, 9]);
    const pushManager = {
      getSubscription: jest.fn().mockResolvedValue(current),
      subscribe: jest.fn(),
    };
    const request = jest.fn();

    await expect(reconcileExistingWebPushSubscription(
      { pushManager } as unknown as ServiceWorkerRegistration,
      encoded([7, 8, 9]),
      request as unknown as typeof fetch,
    )).resolves.toBe(true);

    expect(current.unsubscribe).not.toHaveBeenCalled();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  test("does not opt a merchant in when no subscription exists", async () => {
    const pushManager = {
      getSubscription: jest.fn().mockResolvedValue(null),
      subscribe: jest.fn(),
    };

    await expect(reconcileExistingWebPushSubscription(
      { pushManager } as unknown as ServiceWorkerRegistration,
      encoded([1, 2, 3]),
      jest.fn() as unknown as typeof fetch,
    )).resolves.toBe(false);

    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });
});
