/* ── Bounded loading for every lazy chunk ─────────────────────────────────────
   `import()` has two failure modes in production and neither of them ends on
   its own:

     1. the chunk 404s. This is the *normal* case, not an exotic one: a deploy
        rolls the content hashes, and any tab still holding the previous
        index.html asks for filenames that no longer exist. React sees a
        rejected lazy component, and with no boundary above it the whole tree
        unmounts — a blank white screen with no spinner, no text and no way out;
     2. the chunk hangs. The request is accepted and never answered, so the
        promise never settles, Suspense never resolves, and the route spinner
        stays up forever. That is indistinguishable to a merchant from the auth
        outage this branch of work started with.

   Everything below exists to make "waits forever" and "dies silently"
   unrepresentable, in the same shape the auth probe in App.tsx already uses:
   every attempt is bounded, the attempts are counted, and the sequence has
   exactly one exit.

   The cure for (1) is a reload, not a retry — see `claimReloadSlot`. */

import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * How long a single chunk fetch may take before we stop waiting on it.
 *
 * Shared with the desktop slot (`DESKTOP_CHUNK_TIMEOUT_MS` in App.tsx is this
 * constant) so the import gives up at the same moment the fallback tells the
 * user it has given up. Two different numbers there would either flash an error
 * over a screen that still says "loading", or leave a "took too long" message
 * on screen while the import is quietly still running.
 */
export const CHUNK_LOAD_TIMEOUT_MS = 8_000;

/**
 * Total attempts per chunk, so exactly one retry.
 *
 * Kept deliberately small: once a module URL has failed to fetch, the browser
 * records the failure in its module map and a second `import()` of the same
 * specifier resolves against that record instead of hitting the network again.
 * The retry is therefore worth one cheap attempt — it does recover a genuine
 * blip in engines that do re-fetch, and costs 400ms when it does not — but it
 * is not the mechanism that fixes a stale hash. The reload is.
 */
export const CHUNK_LOAD_ATTEMPTS = 2;

/** Long enough to outlast a momentary network stall, short enough to be unnoticed. */
export const CHUNK_RETRY_DELAY_MS = 400;

/**
 * One automatic reload per tab per minute.
 *
 * A reload cures a stale-hash 404 exactly once: the second request for
 * index.html returns the new document with the new hashes. If a chunk still
 * fails after that, reloading again would only produce a reload loop — an app
 * that flickers and never renders is worse than an app that says what is wrong.
 * So the second failure inside the window falls through to the error boundary,
 * which shows the same reload as a button the user chooses to press.
 */
export const CHUNK_RELOAD_GUARD_MS = 60_000;

/**
 * How long we stall after asking for a reload before rejecting anyway.
 *
 * The tab is being replaced, so rejecting immediately would flash a "we
 * couldn't load this" panel over a page that is already on its way out. But a
 * reload can be refused (an unload handler, an automation harness, a browser
 * that ignores it), and a promise that resolves neither way is the exact defect
 * this file exists to remove — so the rejection still comes, just late enough
 * that a working reload wins the race.
 */
export const CHUNK_RELOAD_GRACE_MS = 2_000;

const RELOAD_GUARD_KEY = "taptpay:chunk-reload-at";

/** Distinguishes "never answered" from "answered with a failure". */
export class ChunkLoadTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Chunk did not load within ${timeoutMs}ms`);
    this.name = "ChunkLoadTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export function isChunkTimeoutError(error: unknown): error is ChunkLoadTimeoutError {
  return error instanceof ChunkLoadTimeoutError || (error as Error | null)?.name === "ChunkLoadTimeoutError";
}

/* Every engine words this differently and none of them use an error code, so
   the message is all there is to match on. Chrome and Firefox each have their
   own phrasing, Safari has a third, and Vite's own preload helper adds a
   fourth for stylesheets. */
const CHUNK_LOAD_MESSAGES = [
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
  "unable to preload css",
  "chunkloaderror",
];

/**
 * Is this a chunk that failed to arrive, rather than a component that threw?
 *
 * The boundary above the router catches both, and they need different words:
 * "we couldn't download this page" is only honest about the first, and telling
 * a merchant to reload is only good advice for the first.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (isChunkTimeoutError(error)) return true;
  const message = typeof error === "string" ? error : (error as Error | null)?.message;
  if (typeof message !== "string") return false;
  const normalised = message.toLowerCase();
  return CHUNK_LOAD_MESSAGES.some((candidate) => normalised.includes(candidate));
}

/**
 * The one recovery that actually resolves a stale-hash 404.
 *
 * `location.reload()` revalidates the document, and this app serves index.html
 * with `max-age=0` while its service worker is network-first for navigations
 * (`client/public/sw.js`), so the reload really does come back with the new
 * asset hashes rather than the cached ones that are 404ing.
 */
export function hardReload() {
  window.location.reload();
}

type ChunkStorage = Pick<Storage, "getItem" | "setItem">;

export type ChunkLoadOptions = {
  timeoutMs?: number;
  attempts?: number;
  retryDelayMs?: number;
  reloadGraceMs?: number;
  /** Injected so the bounds can be tested without navigating the test runner. */
  reload?: () => void;
  storage?: ChunkStorage | null;
  now?: () => number;
};

function resolveSessionStorage(): ChunkStorage | null {
  try {
    return window.sessionStorage ?? null;
  } catch {
    // Privacy-restricted contexts throw on access rather than returning null.
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ChunkLoadTimeoutError(timeoutMs)), timeoutMs);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Takes the tab's single automatic reload, if it is still available.
 *
 * Without storage we cannot tell a first failure from a hundredth, so we refuse
 * the reload rather than risk a loop; the user still gets the button.
 */
function claimReloadSlot(storage: ChunkStorage | null, now: number): boolean {
  if (!storage) return false;
  try {
    const last = Number(storage.getItem(RELOAD_GUARD_KEY));
    if (Number.isFinite(last) && last > 0 && now - last < CHUNK_RELOAD_GUARD_MS) return false;
    storage.setItem(RELOAD_GUARD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads a chunk, or fails in bounded time with an error a boundary can render.
 *
 * Never resolves late and never hangs: the worst case is
 * `attempts × timeoutMs + retries × retryDelayMs + reloadGraceMs`, and the
 * common cases are far shorter — an abort fails immediately, and a hang costs
 * exactly one timeout because it is not retried.
 */
export async function loadChunkWithRetry<T>(
  factory: () => Promise<T>,
  options: ChunkLoadOptions = {},
): Promise<T> {
  const {
    timeoutMs = CHUNK_LOAD_TIMEOUT_MS,
    attempts = CHUNK_LOAD_ATTEMPTS,
    retryDelayMs = CHUNK_RETRY_DELAY_MS,
    reloadGraceMs = CHUNK_RELOAD_GRACE_MS,
    reload = hardReload,
    storage = resolveSessionStorage(),
    now = Date.now,
  } = options;

  let lastError: unknown = new ChunkLoadTimeoutError(timeoutMs);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await withTimeout(factory(), timeoutMs);
    } catch (error) {
      lastError = error;
      /* A hang is never retried. The pending fetch is still in the browser's
         module map, so a second `import()` of the same specifier waits on the
         very same promise — the retry cannot do anything except spend another
         `timeoutMs` before reporting the identical failure. Reporting it now is
         strictly better for the person watching the screen. */
      if (isChunkTimeoutError(error)) break;
      if (attempt < attempts) await delay(retryDelayMs);
    }
  }

  /* Only a real fetch failure earns the reload. A hang would reload straight
     into the same hang, and reloading out from under a "taking too long"
     message steals the screen from a user who was about to act on it. */
  if (!isChunkTimeoutError(lastError) && claimReloadSlot(storage, now())) {
    reload();
    await delay(reloadGraceMs);
  }

  throw lastError;
}

/**
 * `React.lazy`, with the bounds above.
 *
 * Drop-in for `lazy()` at every route in App.tsx. Not used for the idle
 * route-warming imports: those are best-effort, already swallow their errors,
 * and must never be able to reload the tab out from under a merchant who is
 * mid-transaction on a page that loaded perfectly well.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  options?: ChunkLoadOptions,
): LazyExoticComponent<T> {
  return lazy(() => loadChunkWithRetry(factory, options));
}
