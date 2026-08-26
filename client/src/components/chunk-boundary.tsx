/* ── The screens a failing lazy chunk is allowed to end on ────────────────────
   Generalised from the desktop-only version added in ebae323. That commit
   proved the shape works — a Suspense fallback that admits, after
   CHUNK_LOAD_TIMEOUT_MS, that it has been waiting too long, and an error
   boundary above it that catches the import rejection — but it only covered the
   desktop slot. The main router still had a bare `<Suspense>` with nothing
   above it, so every phone and every public route kept both original failure
   modes: a 404'd chunk blanked the screen, and a hung chunk span forever.

   Rather than write a second mechanism for the router, the desktop one moved
   here and both slots now use it. The variants below differ only in which
   `data-testid` they carry (the transition probes gate on the desktop ones) and
   whether the loading state is the route spinner or the in-frame panel.

   Every actionable state — timed out, or failed — carries
   `data-chunk-recovery`, which is what scripts/verify-chunk-resilience.mjs
   waits for. The marker means "the user can see what happened and do something
   about it", regardless of which of the two layers produced it. */

import {
  Component,
  Suspense,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";

import {
  CHUNK_LOAD_TIMEOUT_MS,
  hardReload,
  isChunkLoadError,
  isChunkTimeoutError,
} from "@/lib/lazy-with-retry";

type ChunkRecoveryReason = "timeout" | "error";

export type ChunkSlot = "desktop-chrome" | "desktop-page" | "route";

/* Testids are load-bearing, not decoration:
   `desktop-page-fallback` / `desktop-chrome-fallback` / `desktop-page-error`
   are read by scripts/desktop-shots/probe-transitions.mjs, and `page-loader` by
   both that probe and auth-outage-resilience.test.tsx. Renaming any of them
   silently disarms a gate. */
const SLOTS: Record<ChunkSlot, {
  fullScreen: boolean;
  loadingTestId: string;
  errorTestId: string;
  label: string;
}> = {
  "desktop-chrome": {
    fullScreen: true,
    loadingTestId: "desktop-chrome-fallback",
    errorTestId: "desktop-page-error",
    label: "Desktop chrome",
  },
  "desktop-page": {
    fullScreen: false,
    loadingTestId: "desktop-page-fallback",
    errorTestId: "desktop-page-error",
    label: "Desktop page",
  },
  route: {
    fullScreen: true,
    loadingTestId: "route-chunk-fallback",
    errorTestId: "route-chunk-error",
    label: "Route",
  },
};

/**
 * The route-level full-screen loader, for mobile and public routes.
 *
 * `data-testid` marks it as exactly that: the transition probes gate on this
 * element appearing, and must not confuse it with a page's own content spinner,
 * which shares the `animate-spin` utility class but covers nothing.
 */
export function PageLoader() {
  return (
    <div data-testid="page-loader" className="min-h-screen flex items-center justify-center" style={{ background: "#060D1F" }}>
      <div className="w-8 h-8 border-2 border-[#00DFC8] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ChunkSurface({
  busy,
  children,
  fullScreen,
  loadingState,
  recovery,
  testId,
}: {
  busy?: boolean;
  children: ReactNode;
  fullScreen: boolean;
  loadingState?: "loading" | "timed-out";
  recovery?: ChunkRecoveryReason;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      data-loading-state={loadingState}
      data-chunk-recovery={recovery}
      role={recovery ? "alert" : "status"}
      aria-live="polite"
      aria-busy={busy}
      style={{
        alignItems: "center",
        background: "#000926",
        color: "#F4F6FF",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        height: fullScreen ? "100vh" : "100%",
        justifyContent: "center",
        minHeight: fullScreen ? "100vh" : 240,
        padding: 24,
        textAlign: "center",
        width: "100%",
      }}
    >
      {children}
    </div>
  );
}

/** Says what happened and offers the one thing that fixes it. */
function ChunkRecoveryBody({
  message,
  onReload,
  title,
}: {
  message: string;
  onReload: () => void;
  title: string;
}) {
  return (
    <>
      <strong>{title}</strong>
      <span style={{ color: "#AFC4E8", maxWidth: 420 }}>{message}</span>
      <button
        type="button"
        onClick={onReload}
        data-testid="chunk-reload"
        style={{
          background: "#66A9FF",
          border: 0,
          borderRadius: 999,
          color: "#000F3F",
          cursor: "pointer",
          fontWeight: 700,
          padding: "11px 20px",
        }}
      >
        Reload app
      </button>
    </>
  );
}

/**
 * The Suspense fallback. Loading, until it has been loading too long.
 *
 * The escalation is the backstop for anything the import bounds cannot see —
 * a chunk loaded by something other than `lazyWithRetry`, or a component that
 * suspends on data. Its timer is the same CHUNK_LOAD_TIMEOUT_MS the import uses,
 * so the two layers agree on when "slow" has become "stuck".
 */
export function ChunkLoadState({
  loading,
  onReload = hardReload,
  slot,
  timeoutMs = CHUNK_LOAD_TIMEOUT_MS,
}: {
  /** Rendered instead of the panel while still within budget. */
  loading?: ReactNode;
  onReload?: () => void;
  slot: ChunkSlot;
  timeoutMs?: number;
}) {
  const [timedOut, setTimedOut] = useState(false);
  const { fullScreen, loadingTestId } = SLOTS[slot];

  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [timeoutMs]);

  if (!timedOut && loading) return <>{loading}</>;

  return (
    <ChunkSurface
      busy={!timedOut}
      fullScreen={fullScreen}
      loadingState={timedOut ? "timed-out" : "loading"}
      recovery={timedOut ? "timeout" : undefined}
      testId={loadingTestId}
    >
      {timedOut ? (
        <ChunkRecoveryBody
          title="This page is taking too long to load"
          message="Check your connection, then reload the app. Your signed-in session is preserved."
          onReload={onReload}
        />
      ) : (
        <>
          <strong>Loading page…</strong>
          <span style={{ color: "#AFC4E8" }}>The app frame will stay in place while this finishes.</span>
        </>
      )}
    </ChunkSurface>
  );
}

/* A boundary above the router catches more than failed downloads — a page that
   throws while rendering lands here too. Telling that merchant "we couldn't
   load this part of the app" would be a lie, and the reload advice would be a
   guess, so the copy follows the error. */
function copyForError(error: unknown) {
  if (isChunkTimeoutError(error)) {
    return {
      title: "This page is taking too long to load",
      message: "Check your connection, then reload the app. Your signed-in session is preserved.",
    };
  }
  if (isChunkLoadError(error)) {
    return {
      title: "We couldn't load this part of the app",
      message: "Reload to try the download again. Your signed-in session is preserved.",
    };
  }
  return {
    title: "Something went wrong on this page",
    message: "Reloading usually clears it. Your signed-in session is preserved, and nothing you have already sent was affected.",
  };
}

type ChunkErrorBoundaryProps = {
  children: ReactNode;
  onReload?: () => void;
  /** Changing this clears a failure, so one broken route cannot hold the app hostage. */
  resetKey: string;
  slot: ChunkSlot;
};

export class ChunkErrorBoundary extends Component<
  ChunkErrorBoundaryProps,
  { error: unknown }
> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${SLOTS[this.props.slot].label} failed`, error, info.componentStack);
  }

  componentDidUpdate(previous: ChunkErrorBoundaryProps) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { errorTestId, fullScreen } = SLOTS[this.props.slot];
    const { message, title } = copyForError(error);
    return (
      <ChunkSurface
        fullScreen={fullScreen}
        recovery={isChunkTimeoutError(error) ? "timeout" : "error"}
        testId={errorTestId}
      >
        <ChunkRecoveryBody title={title} message={message} onReload={this.props.onReload ?? hardReload} />
      </ChunkSurface>
    );
  }
}

/**
 * Boundary and Suspense as one unit, because a lazy chunk needs both: Suspense
 * covers "not here yet" and the boundary covers "not coming".
 */
export function ChunkBoundary({
  children,
  onReload,
  resetKey,
  slot,
}: {
  children: ReactNode;
  onReload?: () => void;
  resetKey: string;
  slot: ChunkSlot;
}) {
  return (
    <ChunkErrorBoundary slot={slot} resetKey={resetKey} onReload={onReload}>
      <Suspense
        fallback={
          <ChunkLoadState
            slot={slot}
            onReload={onReload}
            /* Route transitions keep the existing spinner for the first eight
               seconds: it is what the mobile app has always shown between
               pages, and swapping it for a wall of text on every hop would be a
               regression dressed as a fix. */
            loading={slot === "route" ? <PageLoader /> : undefined}
          />
        }
      >
        {children}
      </Suspense>
    </ChunkErrorBoundary>
  );
}
