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
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useDeviceClass } from "@/hooks/use-device-class";
import type { TutorialPageKey, TutorialPageStatus } from "@shared/tutorial";
import {
  TUTORIAL_REGISTRY,
  tutorialStepsForDevice,
  type TutorialStep,
} from "./tutorial-registry";
import "./tutorial.css";
import { apiPath, apiTo } from "@shared/api-path";

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
  location: string;
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
  const deviceClass = useDeviceClass();
  const [location] = useLocation();
  const [currentPage, setCurrentPage] = useState<TutorialPageKey | null>(null);
  const [active, setActive] = useState<ActiveTutorial | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const registrationId = useRef(0);
  const startAttempt = useRef<string | null>(null);
  const focusOrigin = useRef<{ element: HTMLElement; location: string } | null>(null);
  const live = useRef({ mounted: false, enabled, location });
  live.current.enabled = enabled;
  live.current.location = location;
  useEffect(() => {
    live.current.mounted = true;
    return () => { live.current.mounted = false; };
  }, []);

  const stateQuery = useQuery<TutorialState>({
    queryKey: [apiPath("GET /api/tutorial/state")],
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
    queryClient.setQueryData<TutorialState>([apiPath("GET /api/tutorial/state")], old => old ? ({
      ...old,
      progress: { ...old.progress, [pageKey]: entry },
    }) : old);
  }, [queryClient]);

  const saveProgress = useCallback(async (
    pageKey: TutorialPageKey,
    status: TutorialPageStatus,
    lastStep: number,
  ) => {
    const state = queryClient.getQueryData<TutorialState>([apiPath("GET /api/tutorial/state")]);
    if (!state) throw new Error("Tutorial state is unavailable");
    const response = await apiRequest(...apiTo("PATCH /api/tutorial/pages/:pageKey", { pageKey }), {
      generation: state.generation,
      status,
      lastStep,
    });
    const saved = await response.json();
    const currentState = queryClient.getQueryData<TutorialState>([apiPath("GET /api/tutorial/state")]);
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
    let started = false;

    // PageTransition exits for 220ms before the incoming route settles. This
    // delay also lets page data/empty states mount before the first measurement.
    const timer = window.setTimeout(async () => {
      started = true;
      try {
        await saveProgress(currentPage, "started", 0);
        if (live.current.mounted && live.current.enabled && live.current.location === location) {
          const element = document.activeElement;
          focusOrigin.current = element instanceof HTMLElement && element !== document.body ? { element, location } : null;
          setActive({ pageKey: currentPage, stepIndex: 0, location });
        }
      } catch {
        // Do not show an unpersisted first-run tutorial: it could unexpectedly
        // repeat after refresh. A later navigation can retry safely.
        startAttempt.current = null;
      }
    }, 420);

    return () => {
      window.clearTimeout(timer);
      // An unsent first-visit attempt can retry after responsive registration
      // returns. A write already in flight stays unique and uses live route
      // eligibility above when it completes.
      if (!started && startAttempt.current === attemptKey) startAttempt.current = null;
    };
  }, [active, currentPage, enabled, location, saveProgress, stateQuery.data, stateQuery.isSuccess]);

  const closeTutorial = useCallback((status: "completed" | "dismissed") => {
    if (!active) return;
    const closing = active;
    const lastStep = Math.min(closing.stepIndex, tutorialStepsForDevice(closing.pageKey, deviceClass).length - 1);
    setCachedProgress(closing.pageKey, {
      status,
      lastStep,
    });
    setActive(null);
    const origin = focusOrigin.current;
    focusOrigin.current = null;
    // Keep one origin across step remounts. Browser Back/route changes must not
    // return focus to a control on the page the user has just left.
    if (origin && live.current.enabled && live.current.location === origin.location &&
        (currentPage === null || currentPage === closing.pageKey) && origin.element.isConnected) {
      origin.element.focus({ preventScroll: true });
    }
    void saveProgress(closing.pageKey, status, lastStep).catch(() => {
      // The already-saved "started" row still prevents an unwanted repeat.
      void queryClient.invalidateQueries({ queryKey: [apiPath("GET /api/tutorial/state")] });
    });
  }, [active, currentPage, deviceClass, queryClient, saveProgress, setCachedProgress]);

  useEffect(() => {
    // The overlay blocks in-app navigation, but browser Back/Forward can still
    // change routes. Treat leaving as a dismissal so an old page tutorial card
    // can never remain over the destination page.
    // Responsive chrome can briefly unregister and lazily remount the same
    // page. Only a real route/page change or lost eligibility ends its tutorial.
    if (active && (!enabled || location !== active.location || (currentPage !== null && currentPage !== active.pageKey))) closeTutorial("dismissed");
  }, [active, closeTutorial, currentPage, enabled, location]);

  const nextStep = useCallback(() => {
    if (!active) return;
    const steps = tutorialStepsForDevice(active.pageKey, deviceClass);
    if (active.stepIndex >= steps.length - 1) {
      closeTutorial("completed");
      return;
    }
    const nextIndex = Math.min(active.stepIndex, steps.length - 1) + 1;
    setActive({ ...active, stepIndex: nextIndex });
    setCachedProgress(active.pageKey, { status: "started", lastStep: nextIndex });
    void saveProgress(active.pageKey, "started", nextIndex).catch(() => {});
  }, [active, closeTutorial, deviceClass, saveProgress, setCachedProgress]);

  const restartTutorials = useCallback(async () => {
    setIsRestarting(true);
    try {
      const response = await apiRequest(...apiTo("POST /api/tutorial/restart"));
      const fresh = await response.json() as TutorialState;
      setActive(null);
      focusOrigin.current = null;
      startAttempt.current = null;
      queryClient.setQueryData([apiPath("GET /api/tutorial/state")], fresh);
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
  const activePage = active?.pageKey;
  const steps = useMemo(() => activePage ? tutorialStepsForDevice(activePage, deviceClass) : [], [activePage, deviceClass]);
  const displayedStep = active ? Math.min(active.stepIndex, steps.length - 1) : 0;
  const step = definition && active ? steps[displayedStep] : null;

  return (
    <TutorialContext.Provider value={contextValue}>
      {children}
      <AnimatePresence>
        {active && definition && step && (
          <TutorialOverlay
            key={`${active.pageKey}:${displayedStep}`}
            pageLabel={definition.label}
            step={step}
            stepIndex={displayedStep}
            stepCount={steps.length}
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
    const eligible = candidates.filter(element => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      for (let node: HTMLElement | null = element; node; node = node.parentElement) {
        const style = window.getComputedStyle(node);
        if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0" || node.hasAttribute("inert") || node.getAttribute("aria-hidden") === "true") return false;
        if (node !== element && node !== document.body && node !== document.documentElement) {
          const clip = node.getBoundingClientRect();
          if (/hidden|clip/.test(style.overflowX) && (rect.right <= clip.left || rect.left >= clip.right)) return false;
          if (/hidden|clip/.test(style.overflowY) && (rect.bottom <= clip.top || rect.top >= clip.bottom)) return false;
        }
      }
      return true;
    });
    // Prefer an already-visible candidate; offscreen, scrollable content can
    // still be brought into view without opening a hidden application panel.
    return eligible.find(element => {
      const rect = element.getBoundingClientRect();
      return rect.right > 0 && rect.left < window.innerWidth && rect.bottom > 0 && rect.top < window.innerHeight;
    }) ?? eligible[0] ?? null;
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
  if (right <= left || bottom <= top) return null;
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
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardHeight, setCardHeight] = useState(220);

  useLayoutEffect(() => {
    let selected: HTMLElement | null = null;
    let raf = 0;
    let until = 0;
    const observer = new ResizeObserver(() => schedule());
    const measure = () => {
      const element = visibleElement(step.target) ?? (step.fallbackTarget ? visibleElement(step.fallbackTarget) : null);
      if (selected !== element) {
        selected = element;
        observer.disconnect();
        if (element) {
          observer.observe(element);
          const raw = element.getBoundingClientRect();
          if (raw.top < 16 || raw.bottom > window.innerHeight - 16) {
            element.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center", inline: "nearest" });
          }
        }
      }
      const next = paddedRect(element);
      setRect(old => old?.left === next?.left && old?.top === next?.top && old?.width === next?.width && old?.height === next?.height ? old : next);
      if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
    };
    const tick = () => {
      measure();
      raf = performance.now() < until ? requestAnimationFrame(tick) : 0;
    };
    function schedule() {
      until = performance.now() + 800;
      if (!raf) raf = requestAnimationFrame(tick);
    }
    // Measure through responsive/lazy entry animations, then stop polling.
    // Ignore the overlay's own styles so its rect updates cannot feed back.
    const mutations = new MutationObserver(records => {
      if (records.some(record => !(record.target instanceof Element) || !record.target.closest('.tutorial-overlay'))) schedule();
    });
    mutations.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'inert', 'aria-hidden'] });
    const onAnimation = (event: Event) => {
      if (event.target instanceof Element && !event.target.closest('.tutorial-overlay')) schedule();
    };
    measure(); schedule();
    document.addEventListener("animationstart", onAnimation, true);
    document.addEventListener("animationend", onAnimation, true);
    document.addEventListener("transitionend", onAnimation, true);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(raf);
      mutations.disconnect(); observer.disconnect();
      document.removeEventListener("animationstart", onAnimation, true);
      document.removeEventListener("animationend", onAnimation, true);
      document.removeEventListener("transitionend", onAnimation, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [reducedMotion, step]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    nextRef.current?.focus({ preventScroll: true });
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
