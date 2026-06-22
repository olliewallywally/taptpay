import { useLocation } from "wouter";
import { Shell, EmptyState } from "@/pages/trades/trades-dashboard";
import { TRADES_THEME as T } from "@/lib/trades-theme";

export default function ClientDirectory() {
  const [, setLocation] = useLocation();
  return (
    <Shell title="Clients" subtitle="People and sites you invoice">
      <EmptyState label="No clients yet — add them from the quote flow (Phase 3)." />
      <button
        onClick={() => setLocation('/trades')}
        style={{ marginTop: 18, background: 'none', border: 'none', color: T.ACCENT, fontWeight: 600, fontSize: 14, cursor: 'pointer', padding: 0 }}
      >
        ← Back to jobs
      </button>
    </Shell>
  );
}
