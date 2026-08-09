/**
 * The app must be able to tell "your session is invalid" from "our backend is
 * broken", and must survive the second without either logging the merchant out
 * or stranding them on a loading spinner.
 *
 * The spinner half is the regression test for a real outage: AuthProvider
 * awaited `/api/auth/me` and only cleared its loading flag in `.finally()`, so a
 * backend that accepted the connection and never answered left every device on
 * a full-screen loader with no error and no way out.
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

// jsdom serves a real Storage here, so spy on the prototype rather than trusting
// the global stub in jest.setup.js. The spies are backed by a real map: whether
// a later read still finds the token is the whole subject of these tests.
let store: Record<string, string>;
let removeItem: jest.SpyInstance;

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
  store = { authToken: "a-stored-session-token" };
  jest.spyOn(Storage.prototype, "getItem").mockImplementation((key: string) => store[key] ?? null);
  removeItem = jest
    .spyOn(Storage.prototype, "removeItem")
    .mockImplementation((key: string) => {
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
    expect(removeItem).not.toHaveBeenCalled();
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
    expect(removeItem).not.toHaveBeenCalled();
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
  it("keeps the token through repeated 503s and shows the recovery screen", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(async () => jsonResponse(503, { code: "AUTH_BACKEND_UNAVAILABLE" })) as any;
    renderProtectedApp();

    await advance(AUTH_TOTAL_DEADLINE_MS);

    expect(removeItem).not.toHaveBeenCalled();
    expect(screen.getByTestId("auth-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });

  it("keeps the token through a network error", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as any;
    renderProtectedApp();

    await advance(AUTH_TOTAL_DEADLINE_MS);

    expect(removeItem).not.toHaveBeenCalled();
    expect(screen.getByTestId("auth-unavailable")).toBeInTheDocument();
  });

  it("retries a 500 and honours the recovery it gets", async () => {
    jest.useFakeTimers();
    let call = 0;
    global.fetch = jest.fn(async () => {
      call += 1;
      return call === 1
        ? jsonResponse(500, { message: "boom" })
        : jsonResponse(200, { user: { merchantId: "22", role: "owner", onboardingCompleted: true } });
    }) as any;
    renderProtectedApp();

    await advance(AUTH_TOTAL_DEADLINE_MS);

    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it("does not retry a 404, and still does not discard the session", async () => {
    // The server now reserves 404 for an account that genuinely is not there.
    // Asking again cannot change that, but it is still not a rejection of these
    // credentials — so: no retry, no clearing, an explicit way out on screen.
    jest.useFakeTimers();
    const fetchSpy = jest.fn(async () => jsonResponse(404, { message: "User not found" }));
    global.fetch = fetchSpy as any;
    renderProtectedApp();

    await advance(AUTH_TOTAL_DEADLINE_MS);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(removeItem).not.toHaveBeenCalled();
    expect(screen.getByTestId("auth-unavailable")).toBeInTheDocument();
    expect(screen.getByTestId("auth-unavailable-signout")).toBeInTheDocument();
  });
});

describe("a rejected credential is still a rejected credential", () => {
  it.each([401, 403])("clears the stored session on %i", async (status) => {
    global.fetch = jest.fn(async () => jsonResponse(status, { message: "nope" })) as any;
    renderProtectedApp();
    await flush();

    expect(removeItem).toHaveBeenCalledWith("authToken");
    expect(removeItem).toHaveBeenCalledWith("user");
    expect(removeItem).toHaveBeenCalledWith("merchantId");
    expect(screen.queryByTestId("auth-unavailable")).not.toBeInTheDocument();
    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
  });

  it("signs a valid session in without touching storage", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(200, { user: { merchantId: "22", role: "owner", onboardingCompleted: true } }),
    ) as any;
    renderProtectedApp();
    await flush();

    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it("resolves straight to signed out when there is no token at all", async () => {
    delete store.authToken;
    global.fetch = neverAnswers() as any;
    renderProtectedApp();
    await flush();

    expect(global.fetch).not.toHaveBeenCalled();
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
        ? jsonResponse(200, { user: { merchantId: "22", role: "owner", onboardingCompleted: true } })
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

    // The same token that was never discarded is what signs them back in.
    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    expect(removeItem).not.toHaveBeenCalled();
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
    expect(removeItem).not.toHaveBeenCalled();
  });

  it("lets the user sign out deliberately from the recovery screen", async () => {
    jest.useFakeTimers();
    global.fetch = neverAnswers() as any;
    renderProtectedApp();

    await advance(AUTH_TOTAL_DEADLINE_MS);
    await act(async () => {
      fireEvent.click(screen.getByTestId("auth-unavailable-signout"));
    });

    expect(removeItem).toHaveBeenCalledWith("authToken");
    expect(store.authToken).toBeUndefined();
    expect(screen.queryByTestId("auth-unavailable")).not.toBeInTheDocument();
    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
  });

  it("does not let a late retry undo a deliberate sign-out", async () => {
    jest.useFakeTimers();
    let calls = 0;
    let release: ((response: Response) => void) | null = null;
    global.fetch = jest.fn(() => {
      calls += 1;
      // The first check fails outright; the retry is left hanging so the user
      // can sign out while it is still in the air.
      if (calls <= AUTH_MAX_ATTEMPTS) return Promise.resolve(jsonResponse(503, { message: "down" }));
      return new Promise<Response>((resolve) => {
        release = resolve;
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
      release?.(jsonResponse(200, { user: { merchantId: "22", role: "owner", onboardingCompleted: true } }));
    });
    await advance(1000);

    expect(store.authToken).toBeUndefined();
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(screen.queryByTestId("auth-unavailable")).not.toBeInTheDocument();
    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
  });
});
