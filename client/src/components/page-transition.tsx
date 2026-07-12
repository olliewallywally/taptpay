import { AnimatePresence, motion } from "framer-motion";
import { useLocation } from "wouter";
import { isVTPending } from "@/lib/property-transition";

// Children is a render prop receiving the location this wrapper was created
// for. Callers must pin their route matching to it (<Switch location={...}>):
// during a mode="wait" exit the old wrapper's subtree keeps re-rendering with
// the *new* location from context, which would mount the destination page
// inside the exiting wrapper — a throwaway first mount that runs effects and
// consumes one-shot URL params (e.g. /trades/terminal?quick=1) before the
// real mount happens.
export function PageTransition({ children }: { children: (location: string) => React.ReactNode }) {
  const [location] = useLocation();

  // When the View Transitions API is handling the animation (hero morph between
  // property pages), bypass Framer Motion entirely so they don't fight.
  if (isVTPending()) {
    return <>{children(location)}</>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location}
        initial={{ opacity: 0, y: 14, scale: 0.982 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.988 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        // No permanent will-change here: it makes this wrapper the containing
        // block for every position:fixed overlay inside a page (sheets,
        // modals), anchoring them to the document instead of the viewport.
      >
        {children(location)}
      </motion.div>
    </AnimatePresence>
  );
}
