import { useParams, useLocation } from "wouter";
import { Shell, EmptyState } from "@/pages/trades/trades-dashboard";
import { TRADES_THEME as T } from "@/lib/trades-theme";

export default function ClientProfile() {
  const params = useParams();
  const [, setLocation] = useLocation();
  return (
    <Shell title="Client" subtitle={`Client #${params.id ?? '—'}`}>
      <EmptyState label="Client detail, quotes & job timeline land in Phase 3." />
      <button
        onClick={() => setLocation('/trades/clients')}
        style={{ marginTop: 18, background: 'none', border: 'none', color: T.ACCENT, fontWeight: 600, fontSize: 14, cursor: 'pointer', padding: 0 }}
      >
        ← Back to clients
      </button>
    </Shell>
  );
}
