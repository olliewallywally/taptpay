import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { tradesFetch, tradesHeaders } from "@/lib/trades-api";
import { TRADES_THEME as T } from "@/lib/trades-theme";

const money = (c: number) => new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format((c || 0) / 100);
const fieldStyle = { width: "100%", boxSizing: "border-box" as const, padding: "11px 12px", borderRadius: 10, border: "1px solid rgba(6,21,14,.16)", font: "inherit" };

export default function ClientProfile() {
  const [, params] = useRoute("/trades/clients/:id");
  const id = params?.id || "";
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [message, setMessage] = useState("");
  const { data: client, isLoading } = useQuery<any>({ queryKey: ["/api/trades/clients", id], queryFn: () => tradesFetch(`/api/trades/clients/${id}`).then(r => r.ok ? r.json() : null), enabled: !!id });
  const { data: allQuotes = [] } = useQuery<any[]>({ queryKey: ["/api/trades/quotes"], queryFn: () => tradesFetch("/api/trades/quotes").then(r => r.ok ? r.json() : []), enabled: !!id });
  const { data: invoices = [] } = useQuery<any[]>({ queryKey: ["/api/trades/invoices", id], queryFn: () => tradesFetch(`/api/trades/invoices?clientProfileId=${id}`).then(r => r.ok ? r.json() : []), enabled: !!id });
  const { data: events = [] } = useQuery<any[]>({ queryKey: ["/api/trades/clients", id, "events"], queryFn: () => tradesFetch(`/api/trades/clients/${id}/events`).then(r => r.ok ? r.json() : []), enabled: !!id });
  const quotes = allQuotes.filter((quote: any) => quote.clientProfileId === id);
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ["/api/trades/clients", id] }); queryClient.invalidateQueries({ queryKey: ["/api/trades/invoices", id] }); queryClient.invalidateQueries({ queryKey: ["/api/trades/clients", id, "events"] }); };
  const request = useMutation({
    mutationFn: async ({ url, method = "POST", body }: any) => { const response = await fetch(url, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...tradesHeaders() }, body: body ? JSON.stringify(body) : undefined }); if (!response.ok) throw new Error(await response.json().then(d => d.message).catch(() => "Action failed")); return response.json(); },
    onSuccess: () => { refresh(); setEditing(false); setMessage("Updated"); setTimeout(() => setMessage(""), 1800); },
    onError: (err: any) => setMessage(err?.message || "Action failed"),
  });
  const startEdit = () => { setForm({ firstName: client.firstName, lastName: client.lastName, email: client.email || "", phone: client.phone || "", siteAddress: client.siteAddress, preferredChannel: client.preferredChannel, notes: client.notes || "" }); setEditing(true); };
  if (isLoading) return <Frame><p>Loading client...</p></Frame>;
  if (!client) return <Frame><h1>Client not found</h1><button onClick={() => setLocation("/trades/clients")} style={linkStyle}>Back to clients</button></Frame>;

  return <Frame>
    <button onClick={() => setLocation("/trades/clients")} style={linkStyle}>Back to clients</button>
    <div style={{ ...cardStyle, background: T.INK, color: "#fff" }}><div style={{ display: "flex", alignItems: "center", gap: 14 }}><span style={{ width: 50, height: 50, borderRadius: 999, background: T.ACCENT, display: "grid", placeItems: "center", fontWeight: 900 }}>{client.firstName?.[0]}{client.lastName?.[0]}</span><div style={{ flex: 1 }}><small style={{ color: T.ACCENT, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".12em" }}>Client</small><h1 style={{ margin: "3px 0" }}>{client.firstName} {client.lastName}</h1><div style={{ color: "rgba(255,255,255,.65)" }}>{client.siteAddress}</div></div><button onClick={startEdit} style={{ ...linkStyle, color: T.ACCENT }}>Edit</button></div><div style={{ marginTop: 18, fontSize: 14, lineHeight: 1.7 }}>{client.email && <div>{client.email}</div>}{client.phone && <div>{client.phone}</div>}<div>Preferred: {client.preferredChannel}</div></div></div>
    {editing && <div style={cardStyle}><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} style={fieldStyle}/><input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} style={fieldStyle}/></div><input value={form.siteAddress} onChange={e => setForm({ ...form, siteAddress: e.target.value })} style={{ ...fieldStyle, marginTop: 8 }}/><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={{ ...fieldStyle, marginTop: 8 }}/><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={{ ...fieldStyle, marginTop: 8 }}/><select value={form.preferredChannel} onChange={e => setForm({ ...form, preferredChannel: e.target.value })} style={{ ...fieldStyle, marginTop: 8 }}><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select><div style={{ display: "flex", gap: 8, marginTop: 12 }}><button onClick={() => setEditing(false)} style={secondaryButton}>Cancel</button><button onClick={() => request.mutate({ url: `/api/trades/clients/${id}`, method: "PUT", body: form })} style={primaryButton}>Save</button></div></div>}
    {message && <p style={{ color: message === "Updated" ? T.GREEN : T.RED, fontWeight: 700 }}>{message}</p>}
    <Section title="Quotes" empty="No quotes yet">{quotes.map((quote: any) => <Row key={quote.id} title={`Quote ${money(quote.totalCents)}`} detail={`${quote.status}${quote.depositEnabled ? ` - ${money(quote.depositCents)} deposit` : ""}`} action={<button onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/trades/quote/${quote.token}`)} style={linkStyle}>Copy link</button>}/>)}</Section>
    <Section title="Jobs and invoices" empty="No jobs or invoices yet">{invoices.map((invoice: any) => { const hasBalance = invoice.kind === "deposit" && invoices.some((other: any) => other.quoteId === invoice.quoteId && other.kind === "balance" && other.status !== "voided"); return <Row key={invoice.id} title={`${invoice.kind} ${money(invoice.amountCents)}`} detail={`${invoice.status}${invoice.completedAt ? " - complete" : ""}`} action={<div style={{ display: "flex", gap: 6 }}>{invoice.kind === "deposit" && !hasBalance && ["paid","paid_external","deposit_paid"].includes(invoice.status) && <button disabled={request.isPending} onClick={() => request.mutate({ url: `/api/trades/invoices/${invoice.id}/send-balance` })} style={miniButton}>Send balance</button>}{["paid","paid_external"].includes(invoice.status) && !invoice.completedAt && <button disabled={request.isPending} onClick={() => request.mutate({ url: `/api/trades/invoices/${invoice.id}/complete` })} style={miniButton}>Complete</button>}</div>}/>; })}</Section>
    <Section title="Activity" empty="No activity yet">{events.slice(0, 20).map((event: any) => <Row key={event.id} title={String(event.eventType).replace(/_/g, " ")} detail={new Date(event.createdAt).toLocaleString("en-NZ")}/>)}</Section>
    <button onClick={() => { if (window.confirm("Archive this client?")) request.mutate({ url: `/api/trades/clients/${id}/archive` }); }} style={{ ...secondaryButton, color: T.RED, marginTop: 20 }}>Archive client</button>
  </Frame>;
}

function Frame({ children }: { children: React.ReactNode }) { return <main style={{ minHeight: "100vh", background: T.OFFW, padding: "22px 16px 80px", color: T.INK, fontFamily: "Outfit, system-ui, sans-serif" }}><section style={{ maxWidth: 620, margin: "0 auto" }}>{children}</section></main>; }
function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) { const items = Array.isArray(children) ? children : [children]; return <section style={{ marginTop: 24 }}><h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: ".1em" }}>{title}</h2>{items.length && items.some(Boolean) ? <div style={cardStyle}>{children}</div> : <div style={{ ...cardStyle, color: "#7b8288" }}>{empty}</div>}</section>; }
function Row({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) { return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid rgba(6,21,14,.08)" }}><div><strong style={{ display: "block", textTransform: "capitalize" }}>{title}</strong><small style={{ color: "#687078", textTransform: "capitalize" }}>{detail}</small></div>{action}</div>; }
const cardStyle = { background: "#fff", borderRadius: 17, padding: 17, boxShadow: "0 8px 30px rgba(6,21,14,.05)" };
const linkStyle = { border: 0, background: "none", color: T.ACCENT, fontWeight: 700, padding: "10px 0", cursor: "pointer" };
const primaryButton = { flex: 1, border: 0, borderRadius: 11, padding: 12, background: T.ACCENT, color: "#fff", fontWeight: 800, cursor: "pointer" };
const secondaryButton = { flex: 1, border: "1px solid rgba(6,21,14,.14)", borderRadius: 11, padding: 12, background: "transparent", color: T.INK, fontWeight: 800, cursor: "pointer" };
const miniButton = { border: 0, borderRadius: 9, padding: "8px 10px", background: T.INK, color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer" };
