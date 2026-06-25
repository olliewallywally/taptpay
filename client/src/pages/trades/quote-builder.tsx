import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { tradesFetch, tradesHeaders } from "@/lib/trades-api";
import { formatNzd, tradesFeeCents } from "@/lib/trades-money";
import { computeQuoteTotals } from "@shared/trades-gst";
import { TRADES_THEME as T } from "@/lib/trades-theme";

type DraftLine = { id: number; description: string; qty: string; unitPrice: string };

const money = formatNzd; // canonical NZD formatter (Intl en-NZ) — see trades-money.ts
const inputStyle = { width: "100%", boxSizing: "border-box" as const, border: "1px solid rgba(20,64,43,.16)", borderRadius: 12, padding: "12px 13px", font: "inherit", background: "#fff", color: T.INK };

export default function QuoteBuilder() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ id: 1, description: "", qty: "1", unitPrice: "" }]);
  const [depositEnabled, setDepositEnabled] = useState(false);
  const [depositType, setDepositType] = useState<"percent" | "fixed">("percent");
  const [depositValue, setDepositValue] = useState("20");
  const [notes, setNotes] = useState("");
  const [created, setCreated] = useState<any>(null);
  const [error, setError] = useState("");

  const { data: clients = [] } = useQuery<any[]>({
    queryKey: ["/api/trades/clients"],
    queryFn: () => tradesFetch("/api/trades/clients").then(r => r.ok ? r.json() : []),
  });
  const { data: auth } = useQuery<any>({
    queryKey: ["/api/auth/me", "trades-quote"],
    queryFn: () => tradesFetch("/api/auth/me").then(r => r.ok ? r.json() : null),
  });

  const gstMode = auth?.user?.tradeGstMode === "exclusive" ? "exclusive" : "inclusive";
  const totals = useMemo(() => {
    const lineInputs = lines.map(line => ({
      qty: Math.max(0, Number(line.qty) || 0),
      unitPriceCents: Math.max(0, Math.round((Number(line.unitPrice) || 0) * 100)),
    }));
    const depositInput = depositEnabled
      ? depositType === "percent"
        ? Number(depositValue) || 0
        : Math.round((Number(depositValue) || 0) * 100)
      : undefined;
    const computed = computeQuoteTotals(lineInputs, {
      gstRegistered: !!auth?.user?.gstRegistered,
      gstMode,
      depositEnabled,
      depositType: depositEnabled ? depositType : undefined,
      depositValue: depositInput,
    });
    return {
      total: computed.totalCents,
      gst: computed.gstCents,
      net: computed.subtotalCents,
      deposit: computed.depositCents ?? 0,
    };
  }, [lines, auth?.user?.gstRegistered, gstMode, depositEnabled, depositType, depositValue]);

  const createQuote = useMutation({
    mutationFn: async () => {
      setError("");
      const lineItems = lines.map(line => {
        const qty = Number(line.qty);
        const unitPriceCents = Math.round(Number(line.unitPrice) * 100);
        return { description: line.description.trim(), qty, unitPriceCents, lineTotalCents: Math.round(qty * unitPriceCents) };
      });
      if (!clientId) throw new Error("Choose a client");
      if (lineItems.some(line => !line.description || !Number.isInteger(line.qty) || line.qty <= 0 || line.unitPriceCents < 0)) throw new Error("Complete every line item");
      const validUntil = new Date(); validUntil.setDate(validUntil.getDate() + 30);
      const selected = clients.find((client: any) => client.id === clientId);
      const body = {
        clientProfileId: clientId,
        lineItems,
        deliveryChannel: selected?.preferredChannel || "email",
        depositEnabled,
        depositType: depositEnabled ? depositType : undefined,
        depositValue: depositEnabled ? (depositType === "percent" ? Math.round(Number(depositValue)) : Math.round(Number(depositValue) * 100)) : undefined,
        validUntil: validUntil.toISOString(),
        notes: notes.trim() || undefined,
      };
      const response = await fetch("/api/trades/quotes", { method: "POST", headers: { "Content-Type": "application/json", ...tradesHeaders() }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(await response.json().then(d => d.message).catch(() => "Could not create quote"));
      return response.json();
    },
    onSuccess: quote => { queryClient.invalidateQueries({ queryKey: ["/api/trades/quotes"] }); setCreated(quote); },
    onError: (err: any) => setError(err?.message || "Could not create quote"),
  });

  const updateLine = (id: number, field: keyof DraftLine, value: string) => setLines(current => current.map(line => line.id === id ? { ...line, [field]: value } : line));
  const publicUrl = created ? `${window.location.origin}/trades/quote/${created.token}` : "";
  const downloadCreatedPdf = async () => {
    if (!created?.id) return;
    const response = await fetch(`/api/trades/quotes/${created.id}/pdf`, { headers: tradesHeaders() });
    if (!response.ok) {
      setError(await response.json().then(d => d.message).catch(() => "Could not download PDF"));
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `quote-${String(created.token || created.id).slice(0, 8)}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (created) return (
    <main style={{ minHeight: "100vh", background: T.OFFW, padding: "40px 18px", color: T.INK, fontFamily: "Outfit, system-ui, sans-serif" }}>
      <section style={{ maxWidth: 560, margin: "0 auto", background: "#fff", borderRadius: 22, padding: 24 }}>
        <div style={{ color: T.GREEN, fontWeight: 800, fontSize: 12, textTransform: "uppercase", letterSpacing: ".12em" }}>Quote created</div>
        <h1 style={{ margin: "10px 0 6px" }}>{money(created.totalCents)}</h1>
        <p style={{ color: "#687078" }}>{created.delivered ? "Quote sent to the client." : "Delivery was unavailable. Share this customer link instead."}</p>
        <input readOnly value={publicUrl} style={inputStyle} onFocus={e => e.currentTarget.select()} />
        <button onClick={() => navigator.clipboard?.writeText(publicUrl)} style={{ ...buttonStyle, marginTop: 12 }}>Copy link</button>
        <button onClick={downloadCreatedPdf} style={{ ...buttonStyle, marginTop: 10, background: T.INK }}>Download PDF</button>
        {error && <p role="alert" style={{ color: T.RED, fontWeight: 600 }}>{error}</p>}
        <button onClick={() => setLocation("/trades/terminal")} style={linkStyle}>Back to terminal</button>
      </section>
    </main>
  );

  return (
    <main style={{ minHeight: "100vh", background: T.OFFW, padding: "22px 16px 70px", color: T.INK, fontFamily: "Outfit, system-ui, sans-serif" }}>
      <section style={{ maxWidth: 620, margin: "0 auto" }}>
        <button onClick={() => setLocation("/trades/terminal")} style={linkStyle}>Back to terminal</button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12 }}>
          <div><div style={{ color: T.ACCENT, fontWeight: 800, fontSize: 11, textTransform: "uppercase", letterSpacing: ".13em" }}>Trades</div><h1 style={{ margin: "8px 0 4px" }}>New quote</h1></div>
          <div style={{ fontSize: 13, color: "#687078" }}>Valid 30 days</div>
        </div>

        <div style={cardStyle}>
          <label style={labelStyle}>Client</label>
          <select value={clientId} onChange={e => setClientId(e.target.value)} style={inputStyle}>
            <option value="">Choose client</option>
            {clients.filter((c: any) => c.status !== "archived").map((c: any) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName} - {c.siteAddress}</option>)}
          </select>
          <button onClick={() => setLocation("/trades/clients")} style={linkStyle}>Manage clients</button>
        </div>

        <div style={cardStyle}>
          <label style={labelStyle}>Line items</label>
          {lines.map((line, index) => (
            <div key={line.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 70px 110px 32px", gap: 8, marginTop: 10 }}>
              <input aria-label={`Item ${index + 1} description`} placeholder="Description" value={line.description} onChange={e => updateLine(line.id, "description", e.target.value)} style={inputStyle} />
              <input aria-label="Quantity" inputMode="numeric" placeholder="Qty" value={line.qty} onChange={e => updateLine(line.id, "qty", e.target.value.replace(/\D/g, ""))} style={inputStyle} />
              <input aria-label="Unit price" inputMode="decimal" placeholder="$0.00" value={line.unitPrice} onChange={e => updateLine(line.id, "unitPrice", e.target.value.replace(/[^\d.]/g, ""))} style={inputStyle} />
              <button aria-label="Remove item" disabled={lines.length === 1} onClick={() => setLines(current => current.filter(item => item.id !== line.id))} style={{ border: 0, background: "none", color: T.RED, fontSize: 22, cursor: "pointer" }}>x</button>
            </div>
          ))}
          <button onClick={() => setLines(current => [...current, { id: Date.now(), description: "", qty: "1", unitPrice: "" }])} style={linkStyle}>+ Add line</button>
        </div>

        <div style={cardStyle}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700 }}><input type="checkbox" checked={depositEnabled} onChange={e => setDepositEnabled(e.target.checked)} /> Require deposit</label>
          {depositEnabled && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
            <select value={depositType} onChange={e => setDepositType(e.target.value as any)} style={inputStyle}><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></select>
            <input value={depositValue} onChange={e => setDepositValue(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" style={inputStyle} aria-label="Deposit value" />
          </div>}
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Quote notes (optional)" maxLength={1000} style={{ ...inputStyle, minHeight: 90, marginTop: 14, resize: "vertical" }} />
        </div>

        <div style={{ ...cardStyle, background: T.INK, color: "#fff" }}>
          {!!auth?.user?.gstRegistered && <div style={totalRow}><span>{gstMode === "exclusive" ? "Subtotal" : "Subtotal (excl. GST)"}</span><strong>{money(totals.net)}</strong></div>}
          {!!auth?.user?.gstRegistered && <div style={totalRow}><span>{gstMode === "exclusive" ? "GST (15%)" : "GST (15%) included"}</span><span>{money(totals.gst)}</span></div>}
          {depositEnabled && <div style={totalRow}><span>Deposit due on acceptance</span><strong style={{ color: T.ACCENT }}>{money(totals.deposit)}</strong></div>}
          <div style={{ ...totalRow, borderTop: "1px solid rgba(255,255,255,.14)", paddingTop: 14, marginTop: 8, fontSize: 19 }}><span>{gstMode === "exclusive" && auth?.user?.gstRegistered ? "Total (incl GST)" : "Total"}</span><strong>{money(totals.total)}</strong></div>
          <div style={{ ...totalRow, color: "rgba(255,255,255,.55)", fontSize: 12 }}><span>TaptPay fee (0.3%)</span><span>{money(tradesFeeCents(totals.total))}</span></div>
        </div>
        {error && <p role="alert" style={{ color: T.RED, fontWeight: 600 }}>{error}</p>}
        <button disabled={createQuote.isPending || totals.total <= 0} onClick={() => createQuote.mutate()} style={{ ...buttonStyle, opacity: createQuote.isPending || totals.total <= 0 ? .55 : 1 }}>{createQuote.isPending ? "Creating..." : "Create quote"}</button>
      </section>
    </main>
  );
}

const cardStyle = { background: "#fff", borderRadius: 18, padding: 18, marginTop: 16, boxShadow: "0 8px 30px rgba(20,64,43,.05)" };
const labelStyle = { display: "block", fontWeight: 800, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: ".11em", marginBottom: 10 };
const buttonStyle = { width: "100%", border: 0, borderRadius: 14, padding: "15px 18px", background: T.ACCENT, color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" };
const linkStyle = { display: "inline-block", border: 0, background: "none", color: T.ACCENT, fontWeight: 700, padding: "12px 0", cursor: "pointer" };
const totalRow = { display: "flex", justifyContent: "space-between", gap: 20, padding: "6px 0" };
