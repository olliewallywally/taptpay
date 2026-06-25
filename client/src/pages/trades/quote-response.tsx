import { useMutation, useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { TRADES_THEME as T } from "@/lib/trades-theme";

const money = (cents: number) => new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format(cents / 100);

export default function QuoteResponse() {
  const [, params] = useRoute("/trades/quote/:token");
  const token = params?.token || "";
  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/trades/quotes/token", token],
    queryFn: () => fetch(`/api/trades/quotes/token/${token}`).then(async r => { if (!r.ok) throw new Error((await r.json()).message || "Quote not found"); return r.json(); }),
    enabled: !!token,
  });
  const respond = useMutation({
    mutationFn: async (accept: boolean) => {
      const response = await fetch(`/api/trades/quotes/token/${token}/respond`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accept }) });
      if (!response.ok) throw new Error(await response.json().then(d => d.message).catch(() => "Could not respond"));
      return response.json();
    },
  });

  if (isLoading) return <Frame><p>Loading quote...</p></Frame>;
  if (error || !data) return <Frame><h1>Quote unavailable</h1><p>{(error as Error)?.message}</p></Frame>;
  const { quote, client, merchant } = data;
  const result = respond.data;
  if (result) return <Frame><div style={{ color: result.quote.status === "accepted" ? T.GREEN : T.RED, fontWeight: 900, fontSize: 12, textTransform: "uppercase", letterSpacing: ".14em" }}>{result.quote.status}</div><h1>{result.quote.status === "accepted" ? "Thank you" : "Response received"}</h1><p>{result.quote.status === "accepted" ? (result.delivered ? "Your payment link has been sent and is ready below." : "Your payment link is ready below.") : "The business has been notified that you declined this quote."}</p>{result.depositInvoice && <div style={summaryStyle}><span>{result.depositInvoice.kind === "deposit" ? "Deposit" : "Invoice"}</span><strong>{money(result.depositInvoice.amountCents)}</strong></div>}{result.paymentUrl && <a href={result.paymentUrl} style={{ ...actionStyle, display: "block", textAlign: "center", textDecoration: "none", background: T.ACCENT, color: "#fff", marginTop: 18 }}>Pay {result.depositInvoice?.kind === "deposit" ? "deposit" : "invoice"}</a>}</Frame>;

  const closed = quote.status === "accepted" || quote.status === "declined" || quote.status === "expired";
  const gstMode = quote.gstMode === "exclusive" ? "exclusive" : "inclusive";
  return <Frame>
    <div style={{ color: T.ACCENT, fontWeight: 900, fontSize: 11, textTransform: "uppercase", letterSpacing: ".13em" }}>Quote from {merchant.businessName || merchant.name}</div>
    <h1 style={{ marginBottom: 4 }}>{money(quote.totalCents)}</h1>
    <p style={{ marginTop: 0, color: "#687078" }}>For {client.firstName} {client.lastName} at {client.siteAddress}</p>
    <div style={{ marginTop: 24 }}>
      {(quote.lineItems || []).map((line: any, index: number) => <div key={index} style={{ ...summaryStyle, borderBottom: "1px solid rgba(26,29,33,.08)" }}><span>{line.description}<small style={{ display: "block", color: "#7b8288" }}>{line.qty} x {money(line.unitPriceCents)}</small></span><strong>{money(line.lineTotalCents)}</strong></div>)}
    </div>
    {!!quote.gstCents && <div style={summaryStyle}><span>{gstMode === "exclusive" ? "Subtotal" : "Subtotal (excl. GST)"}</span><strong>{money(quote.subtotalCents)}</strong></div>}
    {!!quote.gstCents && <div style={summaryStyle}><span>{gstMode === "exclusive" ? "GST (15%)" : "GST (15%) included"}</span><span>{money(quote.gstCents)}</span></div>}
    {quote.depositEnabled && <div style={{ ...summaryStyle, background: "rgba(255,122,26,.09)", borderRadius: 12, padding: 14 }}><span>Deposit on acceptance</span><strong>{money(quote.depositCents)}</strong></div>}
    {quote.notes && <p style={{ background: T.OFFW, borderRadius: 12, padding: 14 }}>{quote.notes}</p>}
    <a href={`/api/trades/quotes/token/${token}/pdf`} style={{ ...actionStyle, display: "block", textAlign: "center", textDecoration: "none", background: "transparent", color: T.ACCENT, border: `1px solid ${T.ACCENT}`, marginTop: 18 }}>Download PDF</a>
    {closed ? <p style={{ fontWeight: 700 }}>This quote is {quote.status}.</p> : <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 24 }}><button disabled={respond.isPending} onClick={() => respond.mutate(false)} style={{ ...actionStyle, background: "transparent", color: T.RED, border: `1px solid ${T.RED}` }}>Decline</button><button disabled={respond.isPending} onClick={() => respond.mutate(true)} style={{ ...actionStyle, background: T.ACCENT, color: "#fff", border: 0 }}>Accept quote</button></div>}
    {respond.error && <p style={{ color: T.RED }}>{(respond.error as Error).message}</p>}
  </Frame>;
}

function Frame({ children }: { children: React.ReactNode }) { return <main style={{ minHeight: "100vh", background: T.OFFW, padding: "36px 16px", color: T.INK, fontFamily: "Outfit, system-ui, sans-serif" }}><section style={{ maxWidth: 560, margin: "0 auto", background: "#fff", borderRadius: 22, padding: 24, boxShadow: "0 16px 50px rgba(26,29,33,.08)" }}>{children}</section></main>; }
const summaryStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, padding: "12px 0" };
const actionStyle = { borderRadius: 14, padding: 15, fontWeight: 800, cursor: "pointer" };
