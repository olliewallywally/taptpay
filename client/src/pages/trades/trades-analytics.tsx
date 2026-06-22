import { useLocation } from "wouter";
import { Shell, EmptyState } from "@/pages/trades/trades-dashboard";
import { TRADES_THEME as T } from "@/lib/trades-theme";

export default function TradesAnalytics() {
  const [, setLocation] = useLocation();
  return (
    <Shell title="Analytics" subtitle="Revenue, deposits and job throughput">
      <EmptyState label="Trades analytics arrives after the core flow (Phase 4+)." />
      <button
        onClick={() => setLocation('/trades')}
        style={{ marginTop: 18, background: 'none', border: 'none', color: T.ACCENT, fontWeight: 600, fontSize: 14, cursor: 'pointer', padding: 0 }}
      >
        ← Back to jobs
      </button>
    </Shell>
  );
}
