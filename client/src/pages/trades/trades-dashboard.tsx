import { useLocation } from "wouter";
import { TRADES_THEME as T } from "@/lib/trades-theme";

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: T.OFFW, color: T.INK, padding: '24px 18px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 999, background: T.ACCENT, color: '#fff', fontWeight: 700, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' }}>Trades</div>
        <h1 style={{ fontWeight: 800, fontSize: 26, margin: '14px 0 4px', letterSpacing: '-0.5px' }}>{title}</h1>
        <p style={{ color: '#6B7177', fontSize: 14, margin: 0 }}>{subtitle}</p>
        <div style={{ marginTop: 24 }}>{children}</div>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ border: `1.5px dashed rgba(26,29,33,0.18)`, borderRadius: 16, padding: '40px 20px', textAlign: 'center', color: '#8A9097', fontSize: 14 }}>
      {label}
    </div>
  );
}

export { Shell, EmptyState };

export default function TradesDashboard() {
  const [, setLocation] = useLocation();
  return (
    <Shell title="Jobs" subtitle="Your quotes, jobs and invoices">
      <EmptyState label="Open the terminal to send an invoice. Quotes & the full job flow land in Phase 3b." />
      <button
        onClick={() => setLocation('/trades/terminal')}
        style={{ marginTop: 18, width: '100%', background: T.INK, border: 'none', borderRadius: 14, color: '#fff', fontWeight: 700, fontSize: 15, padding: '15px', cursor: 'pointer' }}
      >
        Open terminal →
      </button>
      <button
        onClick={() => setLocation('/settings')}
        style={{ marginTop: 14, background: 'none', border: 'none', color: T.ACCENT, fontWeight: 600, fontSize: 14, cursor: 'pointer', padding: 0 }}
      >
        ← Back to settings
      </button>
    </Shell>
  );
}
