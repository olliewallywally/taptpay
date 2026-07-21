import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { TutorialPageKey, TutorialPageStatus } from "@shared/tutorial";
import { TUTORIAL_REGISTRY, type TutorialStep } from "./tutorial-registry";
import "./tutorial.css";

interface TutorialProgressEntry {
  status: TutorialPageStatus;
  lastStep: number;
  startedAt?: string | null;
  completedAt?: string | null;
  dismissedAt?: string | null;
}

export interface TutorialState {
  generation: number;
  autoEnabled: boolean;
  pageCount: number;
  progress: Partial<Record<TutorialPageKey, TutorialProgressEntry>>;
}

interface ActiveTutorial {
  pageKey: TutorialPageKey;
  stepIndex: number;
}

interface TutorialContextValue {
  registerPage: (pageKey: TutorialPageKey) => () => void;
  restartTutorials: () => Promise<void>;
  visitedPages: number;
  pageCount: number;
  isRestarting: boolean;
  canRestart: boolean;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

export function useTutorial() {
  const value = useContext(TutorialContext);
  if (!value) throw new Error("useTutorial must be used within TutorialProvider");
  return value;
}

export function TutorialPageBoundary({ pageKey, children }: { pageKey: TutorialPageKey; children: React.ReactNode }) {
  const { registerPage } = useTutorial();

  useEffect(() => registerPage(pageKey), [pageKey, registerPage]);

  return <>{children}</>;
}

export function TutorialProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState<TutorialPageKey | null>(null);
  const [active, setActive] = useState<ActiveTutorial | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const registrationId = useRef(0);
  const startAttempt = useRef<string | null>(null);

  const stateQuery = useQuery<TutorialState>({
    queryKey: ["/api/tutorial/state"],
    enabled,
    staleTime: 30_000,
  });

  const registerPage = useCallback((pageKey: TutorialPageKey) => {
    const id = ++registrationId.current;
    setCurrentPage(pageKey);
    return () => {
      if (registrationId.current === id) setCurrentPage(null);
    };
  }, []);

  const setCachedProgress = useCallback((pageKey: TutorialPageKey, entry: TutorialProgressEntry) => {
    queryClient.setQueryData<TutorialState>(["/api/tutorial/state"], old => old ? ({
      ...old,
      progress: { ...old.progress, [pageKey]: entry },
    }) : old);
  }, [queryClient]);

  const saveProgress = useCallback(async (
    pageKey: TutorialPageKey,
    status: TutorialPageStatus,
    lastStep: number,
  ) => {
    const state = queryClient.getQueryData<TutorialState>(["/api/tutorial/state"]);
    if (!state) throw new Error("Tutorial state is unavailable");
    const response = await apiRequest("PATCH", `/api/tutorial/pages/${pageKey}`, {
      generation: state.generation,
      status,
      lastStep,
    });
    const saved = await response.json();
    const currentState = queryClient.getQueryData<TutorialState>(["/api/tutorial/state"]);
    // A restart can finish while an older request is still in flight. Never
    // copy progress from the previous generation into the newly-reset run.
    if (currentState?.generation !== state.generation) return;
    setCachedProgress(pageKey, {
      ...(state.progress[pageKey] ?? {}),
      status: saved.status,
      lastStep: saved.lastStep,
    });
  }, [queryClient, setCachedProgress]);

  useEffect(() => {
    const state = stateQuery.data;
    if (!enabled || !stateQuery.isSuccess || !state?.autoEnabled || !currentPage || active) return;
    if (state.progress[currentPage]) return;

    const attemptKey = `${state.generation}:${currentPage}`;
    if (startAttempt.current === attemptKey) return;
    startAttempt.current = attemptKey;
    let cancelled = false;

    // PageTransition exits for 220ms before the incoming route settles. This
    // delay also lets page data/empty states mount before the first measurement.
    const timer = window.setTimeout(async () => {
      try {
        await saveProgress(currentPage, "started", 0);
        if (!cancelled) setActive({ pageKey: currentPage, stepIndex: 0 });
      } catch {
        // Do not show an unpersisted first-run tutorial: it could unexpectedly
        // repeat after refresh. A later navigation can retry safely.
        startAttempt.current = null;
      }
    }, 420);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active, currentPage, enabled, saveProgress, stateQuery.data, stateQuery.isSuccess]);

  const closeTutorial = useCallback((status: "completed" | "dismissed") => {
    if (!active) return;
    const closing = active;
    setCachedProgress(closing.pageKey, {
      status,
      lastStep: closing.stepIndex,
    });
    setActive(null);
    void saveProgress(closing.pageKey, status, closing.stepIndex).catch(() => {
      // The already-saved "started" row still prevents an unwanted repeat.
      void queryClient.invalidateQueries({ queryKey: ["/api/tutorial/state"] });
    });
  }, [active, queryClient, saveProgress, setCachedProgress]);

  useEffect(() => {
    // The overlay blocks in-app navigation, but browser Back/Forward can still
    // change routes. Treat leaving as a dismissal so an old page tutorial card
    // can never remain over the destination page.
    if (active && currentPage !== active.pageKey) closeTutorial("dismissed");
  }, [active, closeTutorial, currentPage]);

  const nextStep = useCallback(() => {
    if (!active) return;
    const steps = TUTORIAL_REGISTRY[active.pageKey].steps;
    if (active.stepIndex >= steps.length - 1) {
      closeTutorial("completed");
      return;
    }
    const nextIndex = active.stepIndex + 1;
    setActive({ ...active, stepIndex: nextIndex });
    setCachedProgress(active.pageKey, { status: "started", lastStep: nextIndex });
    void saveProgress(active.pageKey, "started", nextIndex).catch(() => {});
  }, [active, closeTutorial, saveProgress, setCachedProgress]);

  const restartTutorials = useCallback(async () => {
    setIsRestarting(true);
    try {
      const response = await apiRequest("POST", "/api/tutorial/restart");
      const fresh = await response.json() as TutorialState;
      setActive(null);
      startAttempt.current = null;
      queryClient.setQueryData(["/api/tutorial/state"], fresh);
    } finally {
      setIsRestarting(false);
    }
  }, [queryClient]);

  const visitedPages = Object.keys(stateQuery.data?.progress ?? {}).length;
  const contextValue = useMemo<TutorialContextValue>(() => ({
    registerPage,
    restartTutorials,
    visitedPages,
    pageCount: stateQuery.data?.pageCount ?? 0,
    isRestarting,
    canRestart: stateQuery.isSuccess,
  }), [isRestarting, registerPage, restartTutorials, stateQuery.data?.pageCount, stateQuery.isSuccess, visitedPages]);

  const definition = active ? TUTORIAL_REGISTRY[active.pageKey] : null;
  const step = definition && active ? definition.steps[active.stepIndex] : null;

  return (
    <TutorialContext.Provider value={contextValue}>
      {children}
      <AnimatePresence>
        {active && definition && step && (
          <TutorialOverlay
            key={`${active.pageKey}:${active.stepIndex}`}
            pageLabel={definition.label}
            step={step}
            stepIndex={active.stepIndex}
            stepCount={definition.steps.length}
            onNext={nextStep}
            onDismiss={() => closeTutorial("dismissed")}
          />
        )}
      </AnimatePresence>
    </TutorialContext.Provider>
  );
}

interface Rect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

function visibleElement(selector: string): HTMLElement | null {
  try {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));
    return candidates.find(element => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    }) ?? null;
  } catch {
    return null;
  }
}

function paddedRect(element: HTMLElement | null): Rect | null {
  if (!element) return null;
  const raw = element.getBoundingClientRect();
  const padding = 9;
  const left = Math.max(8, raw.left - padding);
  const top = Math.max(8, raw.top - padding);
  const right = Math.min(window.innerWidth - 8, raw.right + padding);
  const bottom = Math.min(window.innerHeight - 8, raw.bottom + padding);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function TutorialOverlay({ pageLabel, step, stepIndex, stepCount, onNext, onDismiss }: {
  pageLabel: string;
  step: TutorialStep;
  stepIndex: number;
  stepCount: number;
  onNext: () => void;
  onDismiss: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardHeight, setCardHeight] = useState(220);

  useLayoutEffect(() => {
    const element = visibleElement(step.target) ?? (step.fallbackTarget ? visibleElement(step.fallbackTarget) : null);
    setTarget(element);
    if (element) {
      const raw = element.getBoundingClientRect();
      if (raw.top < 16 || raw.bottom > window.innerHeight - 16) {
        element.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center", inline: "nearest" });
      }
    }
  }, [reducedMotion, step]);

  useLayoutEffect(() => {
    const measure = () => {
      setRect(paddedRect(target));
      if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
    };
    measure();
    const raf = requestAnimationFrame(measure);
    const settle = window.setTimeout(measure, reducedMotion ? 0 : 360);
    const observer = target ? new ResizeObserver(measure) : null;
    if (target && observer) observer.observe(target);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [reducedMotion, target]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    nextRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
      if (event.key === "Tab" && cardRef.current) {
        const buttons = Array.from(cardRef.current.querySelectorAll<HTMLElement>("button:not([disabled])"));
        if (!buttons.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onDismiss]);

  const viewportWidth = typeof window === "undefined" ? 430 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
  const cardWidth = Math.min(344, viewportWidth - 32);
  const gap = 18;
  const placeBelow = rect && step.placement !== "top" && (
    step.placement === "bottom" || rect.bottom + gap + cardHeight <= viewportHeight - 16
  );
  const cardTop = rect
    ? Math.max(16, Math.min(viewportHeight - cardHeight - 16, placeBelow ? rect.bottom + gap : rect.top - cardHeight - gap))
    : Math.max(16, (viewportHeight - cardHeight) / 2);
  const cardLeft = rect
    ? Math.max(16, Math.min(viewportWidth - cardWidth - 16, rect.left + rect.width / 2 - cardWidth / 2))
    : Math.max(16, (viewportWidth - cardWidth) / 2);

  const overlay = (
    <motion.div
      className="tutorial-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.18 }}
      aria-hidden={false}
    >
      {rect ? (
        <>
          <BlurPanel style={{ top: 0, left: 0, right: 0, height: rect.top }} />
          <BlurPanel style={{ top: rect.bottom, left: 0, right: 0, bottom: 0 }} />
          <BlurPanel style={{ top: rect.top, left: 0, width: rect.left, height: rect.height }} />
          <BlurPanel style={{ top: rect.top, left: rect.right, right: 0, height: rect.height }} />
          <div className="tutorial-target-blocker" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
          <div className="tutorial-highlight" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
          <div className="tutorial-tag" style={{ top: Math.max(8, rect.top - 12), left: Math.max(12, Math.min(viewportWidth - 140, rect.left + 12)) }}>{step.tag}</div>
        </>
      ) : <BlurPanel style={{ inset: 0 }} />}

      <motion.div
        ref={cardRef}
        className="tutorial-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        aria-describedby="tutorial-description"
        style={{ top: cardTop, left: cardLeft, width: cardWidth }}
        initial={reducedMotion ? false : { opacity: 0, y: 18, scale: 0.88 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.96 }}
        transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 25 }}
      >
        <button className="tutorial-close" onClick={onDismiss} aria-label={`Exit ${pageLabel} tutorial`}>
          <X size={18} />
        </button>
        <div className="tutorial-eyebrow">{pageLabel}</div>
        <h2 id="tutorial-title">{step.title}</h2>
        <p id="tutorial-description">{step.body}</p>
        <div className="tutorial-footer">
          <span aria-live="polite">{stepIndex + 1} of {stepCount}</span>
          <button ref={nextRef} className="tutorial-next" onClick={onNext} aria-label={stepIndex === stepCount - 1 ? "Finish tutorial" : "Next tutorial step"}>
            <ArrowRight size={20} />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );

  return createPortal(overlay, document.body);
}

function BlurPanel({ style }: { style: React.CSSProperties }) {
  return <div className="tutorial-blur-panel" style={style} />;
}

