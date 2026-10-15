/**
 * The app must be able to tell "your session is invalid" from "our backend is
 * broken", and must survive the second without either logging the merchant out
 * or stranding them on a loading spinner.
 *
 * The spinner half is the regression test for a real outage: AuthProvider
 * awaited `/api/auth/me` and only cleared its loading flag in `.finally()`, so a
 * backend that accepted the connection and never answered left every device on
 * a full-screen loader with no error and no way out.
 *
 * R1-T4 phase E: the session is an HttpOnly cookie the page can neither read nor
 * delete, and the start-up check is GET /api/auth/session. "Costing the session"
 * can now only mean the page giving it up itself: treating an outage as signed
 * out, or asking the server to end the session. A deliberate sign-out the server
 * could not be reached for is finished by the next load, and until then no load
 * signs the browser back in. What the page kept in storage before the switch is
 * removed on every load.
 */

// App.tsx statically imports the public pages. None of them are under test, and
// one of them (the landing page) is being edited in parallel — stub them so this
// file exercises the auth logic and nothing else.
jest.mock("@/plugins/TaptPayPlugin", () => ({}));
jest.mock("@/pages/landing-page", () => ({ LandingPage: () => null }));
jest.mock("@/pages/login", () => ({ __esModule: true, default: () => null }));
jest.mock("@/pages/app-login", () => ({ __esModule: true, default: () => null }));
jest.mock("@/pages/merchant-signup", () => ({ __esModule: true, default: () => null }));

import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  AUTH_ATTEMPT_TIMEOUT_MS,
  AUTH_MAX_ATTEMPTS,
  AUTH_RETRY_DELAYS_MS,
  AUTH_TOTAL_DEADLINE_MS,
  AuthProvider,
  ProtectedRoute,
} from "../App";
import { SIGN_OUT_PENDING_KEY, heldSession, releaseSession } from "@/lib/session";

// jsdom serves a real Storage here, so spy on the prototype rather than trusting
// the global stub in jest.setup.js. The spies are backed by a real map.
let store: Record<string, string>;

const requests = () =>
  (global.fetch as jest.Mock).mock.calls.map(([url, init]) => `${(init as RequestInit | undefined)?.method ?? "GET"} ${String(url)}`);

/** The page never gave the session up: it asked no one to end it, and marked no sign-out as begun. */
function expectSessionKept() {
  expect(requests().filter((request) => request !== "GET /api/auth/session")).toEqual([]);
  expect(store[SIGN_OUT_PENDING_KEY]).toBeUndefined();
}

function renderProtectedApp() {
  return render(
    <AuthProvider>
      <ProtectedRoute>
        <div data-testid="protected-content">merchant dashboard</div>
      </ProtectedRoute>
    </AuthProvider>,
  );
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function validAuthBody(overrides: Record<string, unknown> = {}) {
  return {
    signedIn: true,
    csrfToken: "c".repeat(43),
    user: {
      id: 7,
      email: "owner@example.test",
      merchantId: "22",
      role: "owner",
      onboardingCompleted: true,
      ...overrides,
    },
  };
}

/** A backend that accepts the request and then simply never answers. */
function neverAnswers() {
  return jest.fn(() => new Promise<Response>(() => {}));
}

/** The same, but honouring the abort signal the way a real `fetch` does. */
function neverAnswersButHonoursAbort() {
  return jest.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      }),
  );
}

/**
 * Drives fake timers forward in slices, flushing microtasks between them, so a
 * sequence of `await`s chained off timers actually progresses.
 */
async function advance(totalMs: number, stepMs = 100) {
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      jest.advanceTimersByTime(stepMs);
    });
  }
}

/** Lets an immediately-resolving fetch mock settle through to a state update. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  releaseSession("business");
  store = { authToken: "a-token-stored-before-the-switch", user: "{}", merchantId: "22" };
  jest.spyOn(Storage.prototype, "getItem").mockImplementation((key: string) => store[key] ?? null);
  jest.spyOn(Storage.prototype, "setItem").mockImplementation((key: string, value: string) => {
    store[key] = value;
  });
  jest.spyOn(Storage.prototype, "removeItem").mockImplementation((key: string) => {
    delete store[key];
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("the bounds are actually bounds", () => {
  it("finishes its worst-case attempt sequence inside the hard deadline", () => {
    const delays = AUTH_RETRY_DELAYS_MS.slice(0, AUTH_MAX_ATTEMPTS - 1);
    const worstCase =
      AUTH_MAX_ATTEMPTS * AUTH_ATTEMPT_TIMEOUT_MS + delays.reduce((sum, d) => sum + d, 0);

    // If this ever inverts, the deadline stops being a backstop and becomes the
    // normal exit — attempts would be cut short and the wait would grow.
    expect(worstCase).toBeLessThan(AUTH_TOTAL_DEADLINE_MS);
    expect(AUTH_MAX_ATTEMPTS).toBeGreaterThan(0);
    expect(AUTH_RETRY_DELAYS_MS.length).toBeGreaterThanOrEqual(AUTH_MAX_ATTEMPTS - 1);
  });
});

describe("a backend that never answers", () => {
  it("gives up on a hung request even when the abort is ignored", async () => {
    // The strongest form of the original bug: a promise that never settles, and
    // an abort that does nothing. Only the deadline can end this, and it must.
    jest.useFakeTimers();
    global.fetch = neverAnswers() as unknown as typeof fetch;
    renderProtectedApp();

    expect(screen.getByTestId("page-loader")).toBeInTheDocument();

    await advance(AUTH_TOTAL_DEADLINE_MS + 1000);

    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
    expect(screen.getByTestId("auth-unavailable")).toBeInTheDocument();
    expectSessionKept();
  });

  it("stops after a bounded number of attempts when aborts do work", async () => {
    jest.useFakeTimers();
    const fetchSpy = neverAnswersButHonoursAbort();
    global.fetch = fetchSpy as unknown as typeof fetch;
    renderProtectedApp();

    await advance(AUTH_TOTAL_DEADLINE_MS + 1000);

    expect(fetchSpy).toHaveBeenCalledTimes(AUTH_MAX_ATTEMPTS);
    expect(screen.getByTestId("auth-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
    expectSessionKept();
  });

  it("keeps waiting no longer than the deadline even if timers keep running", async () => {
    jest.useFakeTimers();
    global.fetch = neverAnswers() as unknown as typeof fetch;
    renderProtectedApp();

    await advance(AUTH_TOTAL_DEADLINE_MS + 5000);
    // Nothing is left pending that could revive the check or re-enter loading.
    expect(jest.getTimerCount()).toBe(0);
    expect(screen.getByTestId("auth-unavailable")).toBeInTheDocument();
  });
});

describe("infrastructure failure never costs the session", () => {
  it("keeps the session through repeated 503s and shows the recovery screen", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(async () => jsonResponse(503, { code: "AUTH_BACKEND_UNAVAILABLE" })) as any;
    renderProtectedApp();

    await advance(AUTH_TOTAL_DEADLINE_MS);

    expectSessionKept();
    expect(screen.getByTestId("auth-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });

  it("keeps the session through a network error", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as any;
    renderProtectedApp();

    await advance(AUTH_TOTAL_DEADLINE_MS);

    expectSessionKept();
    expect(screen.getByTestId("auth-unavailable")).toBeInTheDocument();
  });

  it("retries a 500 and honours the recovery it gets", async () => {
    jest.useFakeTimers();
    let call = 0;
    global.fetch = jest.fn(async () => {
      call += 1;
      return call === 1
        ? jsonResponse(500, { message: "boom" })
        : jsonResponse(200, validAuthBody());
    }) as any;
    renderProtectedApp();

    await advance(AUTH_TOTAL_DEADLINE_MS);

    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    expectSessionKept();
  });

  it("takes a 404 as a refusal, once, instead of presenting it as an outage", async () => {
    jest.useFakeTimers();
    const fetchSpy = jest.fn(async () => jsonResponse(404, { message: "User not found" }));
    global.fetch = fetchSpy as any;
    renderProtectedApp();

    await flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(heldSession("business")).toBeNull();
    expect(screen.queryByTestId("auth-unavailable")).not.toBeInTheDocument();
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });

  it("never authenticates a malformed 200 response", async () => {
    jest.useFakeTimers();
    const fetchSpy = jest.fn(async () => jsonResponse(200, {}));
    global.fetch = fetchSpy as any;
    renderProtectedApp();

    await advance(AUTH_TOTAL_DEADLINE_MS);

    expect(fetchSpy).toHaveBeenCalledTimes(AUTH_MAX_ATTEMPTS);
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("auth-unavailable")).toBeInTheDocument();
    expectSessionKept();
  });
});

describe("a reply that is not a whole session reply", () => {
  it("is never a sign-in when it names the login but carries no CSRF token", async () => {
    jest.useFakeTimers();
    const { csrfToken: _withheld, ...withoutToken } = validAuthBody();
    const fetchSpy = jest.fn(async () => jsonResponse(200, withoutToken));
    global.fetch = fetchSpy as any;
    renderProtectedApp();

    await advance(AUTH_TOTAL_DEADLINE_MS);

    expect(fetchSpy).toHaveBeenCalledTimes(AUTH_MAX_ATTEMPTS);
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("auth-unavailable")).toBeInTheDocument();
    expect(heldSession("business")).toBeNull();
  });
});

describe("a refused session is still a refused session", () => {
  it.each([
    ["the start-up check's ordinary 'not signed in'", () => jsonResponse(200, { signedIn: false })],
    ["a 401", () => jsonResponse(401, { message: "nope" })],
    ["a 403", () => jsonResponse(403, { message: "nope" })],
  ])("is signed out on %s, asked once, and holds nothing", async (_name, answer) => {
    const fetchSpy = jest.fn(async () => answer());
    global.fetch = fetchSpy as any;
    renderProtectedApp();
    await flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(heldSession("business")).toBeNull();
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(screen.queryByTestId("auth-unavailable")).not.toBeInTheDocument();
    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
  });

  it("signs a valid session in, holding who it is and its CSRF token in memory only", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(200, validAuthBody()),
    ) as any;
    renderProtectedApp();
    await flush();

    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    expect(heldSession("business")).toMatchObject({ user: { id: 7, merchantId: 22, role: "owner" }, csrfToken: "c".repeat(43) });
    expectSessionKept();
    // Nothing of the sign-in is in storage: what the page kept there before the switch is removed.
    expect(store).toEqual({});
  });

  it("always asks: the page cannot tell on its own whether the browser holds a session", async () => {
    store = {};
    const fetchSpy = jest.fn(async (_url: string, _init?: RequestInit) => jsonResponse(200, { signedIn: false }));
    global.fetch = fetchSpy as any;
    renderProtectedApp();
    await flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/auth/session");
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ credentials: "same-origin" });
    expect(new Headers(fetchSpy.mock.calls[0][1]?.headers).get("Authorization")).toBeNull();
    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
    expect(screen.queryByTestId("auth-unavailable")).not.toBeInTheDocument();
  });
});

describe("the recovery screen is a way out, not a dead end", () => {
  it("recovers the live session when the backend comes back", async () => {
    jest.useFakeTimers();
    let healthy = false;
    global.fetch = jest.fn(async () =>
      healthy
        ? jsonResponse(200, validAuthBody())
        : jsonResponse(503, { message: "down" }),
    ) as any;
    renderProtectedApp();

    await advance(AUTH_TOTAL_DEADLINE_MS);
    expect(screen.getByTestId("auth-unavailable")).toBeInTheDocument();

    healthy = true;
    await act(async () => {
      fireEvent.click(screen.getByTestId("auth-unavailable-retry"));
    });
    await advance(1000);

    // The same session, never given up, is what signs them back in.
    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    expectSessionKept();
  });

  it("cannot get stuck on a loader when a retry fails too", async () => {
    jest.useFakeTimers();
    global.fetch = neverAnswers() as any;
    renderProtectedApp();

    await advance(AUTH_TOTAL_DEADLINE_MS);
    await act(async () => {
      fireEvent.click(screen.getByTestId("auth-unavailable-retry"));
    });

    // The retry keeps the error on screen rather than reverting to a spinner…
    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
    expect(screen.getByTestId("auth-unavailable")).toBeInTheDocument();

    // …and it is bounded by exactly the same deadline.
    await advance(AUTH_TOTAL_DEADLINE_MS + 1000);
    expect(screen.getByTestId("auth-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
    expectSessionKept();
  });

  it("lets the user sign out deliberately from the recovery screen, though the server cannot be reached to end the session", async () => {
    jest.useFakeTimers();
    global.fetch = neverAnswers() as any;
    renderProtectedApp();

    await advance(AUTH_TOTAL_DEADLINE_MS);
    await act(async () => {
      fireEvent.click(screen.getByTestId("auth-unavailable-signout"));
    });
    await flush();

    // The page is signed out at once. Ending the session is owed: only the server can do it.
    expect(store[SIGN_OUT_PENDING_KEY]).toBe("1");
    expect(heldSession("business")).toBeNull();
    expect(screen.queryByTestId("auth-unavailable")).not.toBeInTheDocument();
    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });

  it("does not let a late retry undo a deliberate sign-out", async () => {
    jest.useFakeTimers();
    let calls = 0;
    let releaseRetry: ((response: Response) => void) | null = null;
    global.fetch = jest.fn(() => {
      calls += 1;
      // The first check fails outright; the retry is left hanging so the user
      // can sign out while it is still in the air. The sign-out's own requests
      // find the server still down.
      if (calls <= AUTH_MAX_ATTEMPTS || releaseRetry) return Promise.resolve(jsonResponse(503, { message: "down" }));
      return new Promise<Response>((resolve) => {
        releaseRetry = resolve;
      });
    }) as any;
    renderProtectedApp();

    await advance(AUTH_TOTAL_DEADLINE_MS);
    await act(async () => {
      fireEvent.click(screen.getByTestId("auth-unavailable-retry"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("auth-unavailable-signout"));
    });

    // The backend recovers a moment too late — it must not resurrect a session
    // the user has explicitly ended.
    await act(async () => {
      releaseRetry?.(jsonResponse(200, validAuthBody()));
    });
    await advance(1000);

    expect(releaseRetry).not.toBeNull();
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(screen.queryByTestId("auth-unavailable")).not.toBeInTheDocument();
    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
    // Nor does the page take the late answer for its sign-in: it holds no session, and the sign-out is still owed.
    expect(heldSession("business")).toBeNull();
    expect(store[SIGN_OUT_PENDING_KEY]).toBe("1");
  });

  it("a load that finds a sign-out still owed signs no one in, and has the server end the session", async () => {
    store[SIGN_OUT_PENDING_KEY] = "1";
    const fetchSpy = jest.fn(async (url: string, _init?: RequestInit) =>
      url === "/api/auth/session" ? jsonResponse(200, validAuthBody()) : jsonResponse(204, {}));
    global.fetch = fetchSpy as any;
    renderProtectedApp();
    await flush();
    await flush();

    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
    expect(heldSession("business")).toBeNull();
    expect(requests()).toEqual(["GET /api/auth/session", "POST /api/auth/logout"]);
    expect(new Headers(fetchSpy.mock.calls[1][1]?.headers).get("X-CSRF-Token")).toBe("c".repeat(43));
    expect(store[SIGN_OUT_PENDING_KEY]).toBeUndefined();
  });

  it("a load that still cannot reach the server stays signed out, with the sign-out still owed", async () => {
    store[SIGN_OUT_PENDING_KEY] = "1";
    global.fetch = jest.fn(async () => jsonResponse(503, { message: "down" })) as any;
    renderProtectedApp();
    await flush();
    await flush();

    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(screen.queryByTestId("auth-unavailable")).not.toBeInTheDocument();
    expect(store[SIGN_OUT_PENDING_KEY]).toBe("1");
  });
});
