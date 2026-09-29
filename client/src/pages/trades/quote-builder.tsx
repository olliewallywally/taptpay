// Standalone /trades/quote route — a direct-link fallback that renders the same
// in-terminal QuoteScreen (PM ChargeBill layout) inside a phone-width viewport.
// The primary path is the trades terminal, which renders <QuoteScreen> directly.
//
// The chrome comes from the vertical's scoped stylesheet, so this root carries
// `trades-terminal-view` — without that class every `.tp-*` rule misses. It used
// to inject its own unscoped copy (`TP_TERM_CSS`), which phase 2 deleted; see
// docs/PLAN-2026-08-17-mobile-responsive-ui.md §5.1.
import { useLocation } from "wouter";
import { QuoteScreen } from "./trades-terminal";
import "@/features/terminal/terminal-keyframes.css";
import "@/features/terminal/terminal-tokens.css";
import "@/features/terminal/trades/trades-terminal-view.css";

export default function QuoteBuilder() {
  const [, setLocation] = useLocation();
  const exit = () => setLocation("/trades/terminal");
  return (
    <div className="trades-terminal-view tp-viewport">
      <QuoteScreen onCancel={exit} onExit={exit} />
    </div>
  );
}
