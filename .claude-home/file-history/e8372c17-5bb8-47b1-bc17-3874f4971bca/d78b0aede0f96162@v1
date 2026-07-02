import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { tradesFetch } from "@/lib/trades-api";
import { formatNzd, includedGstCents, tradesFeeCents } from "@/lib/trades-money";
import { TRADES_THEME as T } from "@/lib/trades-theme";

type Period = "week" | "month" | "quarter" | "year";
const periodDays: Record<Period, number> = { week: 7, month: 30, quarter: 90, year: 365 };

export default function TradesAnalytics() {
  const [, setLocation] = useLocation();
  const [period, setPeriod] = useState<Period>("month");
  const { data: invoices = [] } = useQuery<any[]>({ queryKey: ["/api/trades/invoices"], queryFn: () => tradesFetch("/api/trades/invoices").then(r => r.ok ? r.json() : []) });
  const { data: quotes = [] } = useQuery<any[]>({ queryKey: ["/api/trades/quotes"], queryFn: () => tradesFetch("/api/trades/quotes").then(r => r.ok ? r.json() : []) });
  const { data: auth } = useQuery<any>({ queryKey: ["/api/auth/me", "trades-analytics"], queryFn: () => tradesFetch("/api/auth/me").then(r => r.ok ? r.json() : null) });
  const cutoff = new Date(Date.now() - periodDays[period] * 86400000);
  const active = invoices.filter((invoice: any) => invoice.status !== "voided");
  const filtered = active.filter((invoice: any) => new Date(invoice.createdAt) >= cutoff);
  // Revenue counts what was PAID within the window (by paidAt), not what was
  // created in it — so an older invoice paid this period is included, and the
  // headline matches the paidAt-based trend bars below.
  const paid = active.filter((invoice: any) => ["paid", "paid_external"].includes(invoice.status) && new Date(invoice.paidAt || invoice.createdAt) >= cutoff);
  const revenue = paid.reduce((sum: number, invoice: any) => sum + invoice.amountCents, 0);
  const outstanding = filtered.filter((invoice: any) => !["paid", "paid_external"].includes(invoice.status)).reduce((sum: number, invoice: any) => sum + invoice.amountCents, 0);
  const accepted = quotes.filter((quote: any) => quote.status === "accepted" && new Date(quote.createdAt) >= cutoff).length;
  const declined = quotes.filter((quote: any) => quote.status === "declined" && new Date(quote.createdAt) >= cutoff).length;
  const conversion = accepted + declined ? Math.round(accepted / (accepted + declined) * 100) : 0;
  const bars = useMemo(() => Array.from({ length: 8 }, (_, index) => {
    const end = new Date(Date.now() - (7 - index) * periodDays[period] / 8 * 86400000);
    const start = new Date(Date.now() - (8 - index) * periodDays[period] / 8 * 86400000);
    return paid.filter((invoice: any) => { const date = new Date(invoice.paidAt || invoice.createdAt); return date >= start && date < end; }).reduce((sum: number, invoice: any) => sum + invoice.amountCents, 0);
  }), [paid, period]);
  const maxBar = Math.max(...bars, 1);

  return <main style={{ minHeight: "100vh", background: T.INK, color: "#fff", padding: "24px 16px 80px", fontFamily: "Outfit, system-ui, sans-serif" }}><section style={{ maxWidth: 620, margin: "0 auto" }}>
    <button onClick={() => setLocation("/trades")} style={link}>Back to jobs</button><div style={{ color: T.ACCENT, fontWeight: 900, fontSize: 11, letterSpacing: ".13em", textTransform: "uppercase" }}>Trades</div><h1 style={{ margin: "7px 0 4px" }}>Analytics</h1><p style={{ margin: 0, color: "rgba(255,255,255,.5)" }}>Revenue, GST and job performance</p>
    <div style={{ display: "flex", background: "rgba(255,255,255,.07)", padding: 4, borderRadius: 999, marginTop: 20 }}>{(["week","month","quarter","year"] as Period[]).map(item => <button key={item} onClick={() => setPeriod(item)} style={{ flex: 1, border: 0, borderRadius: 999, padding: 9, background: item === period ? T.ACCENT : "transparent", color: item === period ? "#fff" : "rgba(255,255,255,.55)", fontWeight: 700, textTransform: "capitalize", cursor: "pointer" }}>{item}</button>)}</div>
    <div style={{ marginTop: 26, textAlign: "center" }}><small style={{ color: "rgba(255,255,255,.45)", textTransform: "uppercase", letterSpacing: ".1em" }}>Collected revenue</small><div style={{ fontSize: 48, fontWeight: 900, marginTop: 7 }}>{formatNzd(revenue)}</div></div>
    <div style={{ height: 150, display: "flex", alignItems: "end", gap: 8, marginTop: 20, padding: "0 6px" }}>{bars.map((value, index) => <div key={index} title={formatNzd(value)} style={{ flex: 1, minHeight: 5, height: `${Math.max(4, value / maxBar * 100)}%`, borderRadius: "7px 7px 2px 2px", background: value ? T.ACCENT : "rgba(255,255,255,.1)" }}/>)}</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, marginTop: 24 }}><Stat label="Outstanding" value={formatNzd(outstanding)}/><Stat label="Quote conversion" value={`${conversion}%`}/><Stat label="TaptPay fee (0.3%)" value={formatNzd(tradesFeeCents(revenue))}/><Stat label="GST (15%) included" value={auth?.user?.gstRegistered ? formatNzd(includedGstCents(revenue)) : "Not registered"}/></div>
    <div style={{ ...panel, marginTop: 18 }}><h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".1em", marginTop: 0 }}>Invoice status</h2>{["paid", "paid_external", "pending_dispatch", "dispatched", "viewed", "dispatch_failed"].map(status => { const count = filtered.filter((invoice: any) => invoice.status === status).length; return count ? <div key={status} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,.07)", textTransform: "capitalize" }}><span style={{ color: "rgba(255,255,255,.65)" }}>{status.replace(/_/g, " ")}</span><strong>{count}</strong></div> : null; })}</div>
  </section></main>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div style={panel}><small style={{ color: "rgba(255,255,255,.48)", textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 700 }}>{label}</small><div style={{ fontSize: 21, fontWeight: 900, marginTop: 8 }}>{value}</div></div>; }
const panel = { background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: 16 };
const link = { border: 0, background: "none", color: T.ACCENT, fontWeight: 700, padding: "10px 0", cursor: "pointer" };
