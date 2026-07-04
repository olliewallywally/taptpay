// Standalone /trades/quote route — a direct-link fallback that renders the same
// in-terminal QuoteScreen (PM ChargeBill layout) inside a phone-width viewport.
// The primary path is the trades terminal, which renders <QuoteScreen> directly.
import { useLocation } from "wouter";
import { TP_TERM_CSS, QuoteScreen } from "./trades-terminal";

export default function QuoteBuilder() {
  const [, setLocation] = useLocation();
  const exit = () => setLocation("/trades/terminal");
  return (
    <div className="tp-viewport">
      <style>{TP_TERM_CSS}</style>
      <QuoteScreen onCancel={exit} onExit={exit} />
    </div>
  );
}
