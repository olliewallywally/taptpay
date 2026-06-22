import { useLocation } from "wouter";
import { Shell, EmptyState } from "@/pages/trades/trades-dashboard";
import { TRADES_THEME as T } from "@/lib/trades-theme";

export default function TradesTerminal() {
  const [, setLocation] = useLocation();
  return (
    <Shell title="Terminal" subtitle="Take a deposit or balance payment">
      <EmptyState label="The trades terminal & action bar (clients · quote · invoice · external) is Phase 3." />
      <button
        onClick={() => setLocation('/trades')}
        style={{ marginTop: 18, background: 'none', border: 'none', color: T.ACCENT, fontWeight: 600, fontSize: 14, cursor: 'pointer', padding: 0 }}
      >
        ← Back to jobs
      </button>
    </Shell>
  );
}
