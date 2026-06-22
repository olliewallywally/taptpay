import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { tradesFetch } from "@/lib/trades-api";
import { formatNzd, tradesFeeCents } from "@/lib/trades-money";
import { TRADES_THEME as T } from "@/lib/trades-theme";

const liveStatuses = ["pending_dispatch", "dispatched", "viewed", "deposit_paid", "balance_due", "dispatch_failed"];

export default function TradesDashboard() {
  const [, setLocation] = useLocation();
  const { data: clients = [] } = useQuery<any[]>({ queryKey: ["/api/trades/clients"], queryFn: () => tradesFetch("/api/trades/clients").then(r => r.ok ? r.json() : []) });
  const { data: quotes = [] } = useQuery<any[]>({ queryKey: ["/api/trades/quotes"], queryFn: () => tradesFetch("/api/trades/quotes").then(r => r.ok ? r.json() : []) });
  const { data: invoices = [], isError, refetch } = useQuery<any[]>({ queryKey: ["/api/trades/invoices"], queryFn: () => tradesFetch("/api/trades/invoices").then(r => { if (!r.ok) throw new Error("load failed"); return r.json(); }) });
  const { data: schedules = [] } = useQuery<any[]>({ queryKey: ["/api/trades/schedules"], queryFn: () => tradesFetch("/api/trades/schedules").then(r => r.ok ? r.json() : []) });
  const clientName = (id: string) => { const c = clients.find((item: any) => item.id === id); return c ? `${c.firstName} ${c.lastName}` : "Client"; };
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const paid = invoices.filter((invoice: any) => ["paid", "paid_external"].includes(invoice.status));
  const monthPaid = paid.filter((invoice: any) => invoice.paidAt && new Date(invoice.paidAt) >= monthStart).reduce((sum: number, invoice: any) => sum + invoice.amountCents, 0);
  const outstanding = invoices.filter((invoice: any) => liveStatuses.includes(invoice.status)).reduce((sum: number, invoice: any) => sum + invoice.amountCents, 0);
  const accepted = quotes.filter((quote: any) => quote.status === "accepted").length;
  const responded = quotes.filter((quote: any) => ["accepted", "declined"].includes(quote.status)).length;
  const conversion = responded ? Math.round(accepted / responded * 100) : 0;
  const recent = [...invoices].filter((invoice: any) => invoice.status !== "voided").sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  return <main style={{ minHeight: "100vh", background: T.OFFW, color: T.INK, padding: "26px 16px 80px", fontFamily: "Outfit, system-ui, sans-serif" }}><section style={{ maxWidth: 620, margin: "0 auto" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><div style={{ color: T.ACCENT, fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".13em" }}>Trades</div><h1 style={{ margin: "7px 0 3px" }}>Jobs</h1><p style={{ margin: 0, color: "#687078" }}>Quotes, invoices and repeat work</p></div><button onClick={() => setLocation("/settings")} style={roundButton}>Settings</button></div>
    {isError && <div style={{ ...card, color: T.RED }}>Could not load invoices. <button onClick={() => refetch()} style={link}>Retry</button></div>}
    <div style={{ ...card, background: T.INK, color: "#fff", padding: 22 }}><small style={{ color: T.ACCENT, textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 800 }}>Collected this month</small><div style={{ fontSize: 44, fontWeight: 900, marginTop: 7 }}>{formatNzd(monthPaid)}</div><div style={{ color: "rgba(255,255,255,.55)", marginTop: 8 }}>TaptPay fee at 0.3%: {formatNzd(tradesFeeCents(monthPaid))}</div></div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, marginTop: 10 }}><Stat label="Outstanding" value={formatNzd(outstanding)} /><Stat label="Active jobs" value={String(invoices.filter((i: any) => liveStatuses.includes(i.status)).length)} /><Stat label="Quote conversion" value={`${conversion}%`} /><Stat label="Recurring" value={String(schedules.filter((s: any) => s.status === "active").length)} /></div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, marginTop: 18 }}><button onClick={() => setLocation("/trades/terminal")} style={primary}>Open terminal</button><button onClick={() => setLocation("/trades/quote")} style={primary}>New quote</button><button onClick={() => setLocation("/trades/clients")} style={secondary}>Clients</button><button onClick={() => setLocation("/trades/recurring")} style={secondary}>Recurring</button></div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28 }}><h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".11em" }}>Recent Invoices</h2><button onClick={() => setLocation("/trades/analytics")} style={link}>Analytics</button></div>
    <div style={{ display: "grid", gap: 9 }}>{recent.length === 0 ? <div style={{ ...card, color: "#7b8288", textAlign: "center" }}>No invoices yet</div> : recent.map((invoice: any) => <button key={invoice.id} onClick={() => setLocation(`/trades/clients/${invoice.clientProfileId}`)} style={{ ...card, border: 0, textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, marginTop: 0 }}><span><strong style={{ display: "block" }}>{clientName(invoice.clientProfileId)}</strong><small style={{ color: "#687078", textTransform: "capitalize" }}>{invoice.kind} Invoice - {invoice.status.replace(/_/g, " ")}</small></span><strong style={{ color: ["paid","paid_external"].includes(invoice.status) ? T.GREEN : T.INK }}>{formatNzd(invoice.amountCents)}</strong></button>)}</div>
  </section></main>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div style={card}><small style={{ color: "#687078", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700 }}>{label}</small><div style={{ fontSize: 24, fontWeight: 900, marginTop: 7 }}>{value}</div></div>; }
const card = { background: "#fff", borderRadius: 17, padding: 16, boxShadow: "0 8px 30px rgba(26,29,33,.05)" };
const primary = { border: 0, borderRadius: 13, padding: 14, background: T.ACCENT, color: "#fff", fontWeight: 800, cursor: "pointer" };
const secondary = { border: 0, borderRadius: 13, padding: 14, background: T.INK, color: "#fff", fontWeight: 800, cursor: "pointer" };
const roundButton = { border: 0, borderRadius: 999, padding: "10px 14px", background: T.INK, color: "#fff", fontWeight: 700, cursor: "pointer" };
const link = { border: 0, background: "none", color: T.ACCENT, fontWeight: 700, padding: "8px 0", cursor: "pointer" };
