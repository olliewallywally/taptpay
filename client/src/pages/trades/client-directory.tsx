import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { tradesFetch, tradesHeaders } from "@/lib/trades-api";
import { TRADES_THEME as T } from "@/lib/trades-theme";

const emptyForm = { firstName: "", lastName: "", email: "", phone: "", siteAddress: "", preferredChannel: "email", notes: "" };
const fieldStyle = { width: "100%", boxSizing: "border-box" as const, padding: "12px 13px", borderRadius: 11, border: "1px solid rgba(26,29,33,.16)", background: "#fff", color: T.INK, font: "inherit" };

export default function ClientDirectory() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>(emptyForm);
  const [error, setError] = useState("");
  const { data: clients = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/trades/clients"],
    queryFn: () => tradesFetch("/api/trades/clients").then(r => r.ok ? r.json() : []),
  });
  const create = useMutation({
    mutationFn: async () => {
      setError("");
      if (!form.firstName.trim() || !form.lastName.trim() || !form.siteAddress.trim()) throw new Error("Name and site address are required");
      if (form.preferredChannel === "email" && !form.email.trim()) throw new Error("Email is required for email delivery");
      if (form.preferredChannel !== "email" && !form.phone.trim()) throw new Error("Phone is required for message delivery");
      const response = await fetch("/api/trades/clients", { method: "POST", headers: { "Content-Type": "application/json", ...tradesHeaders() }, body: JSON.stringify(form) });
      if (!response.ok) throw new Error(await response.json().then(d => d.message).catch(() => "Could not add client"));
      return response.json();
    },
    onSuccess: client => { queryClient.invalidateQueries({ queryKey: ["/api/trades/clients"] }); setForm(emptyForm); setAdding(false); setLocation(`/trades/clients/${client.id}`); },
    onError: (err: any) => setError(err?.message || "Could not add client"),
  });
  const term = search.toLowerCase().trim();
  const visible = clients.filter((c: any) => c.status !== "archived" && (!term || `${c.firstName} ${c.lastName} ${c.siteAddress}`.toLowerCase().includes(term)));

  return <main style={{ minHeight: "100vh", background: T.OFFW, color: T.INK, padding: "22px 16px 70px", fontFamily: "Outfit, system-ui, sans-serif" }}>
    <section style={{ maxWidth: 620, margin: "0 auto" }}>
      <button onClick={() => setLocation("/trades")} style={linkStyle}>Back to jobs</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}><div><div style={{ color: T.ACCENT, fontWeight: 800, fontSize: 11, textTransform: "uppercase", letterSpacing: ".13em" }}>Trades</div><h1 style={{ margin: "7px 0 3px" }}>Clients</h1><p style={{ margin: 0, color: "#687078" }}>People and sites you quote and invoice</p></div><button onClick={() => setAdding(value => !value)} style={smallButton}>{adding ? "Cancel" : "+ Add"}</button></div>
      {adding && <div style={cardStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><input placeholder="First name" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} style={fieldStyle}/><input placeholder="Last name" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} style={fieldStyle}/></div>
        <input placeholder="Site address" value={form.siteAddress} onChange={e => setForm({ ...form, siteAddress: e.target.value })} style={{ ...fieldStyle, marginTop: 10 }}/>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}><input type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={fieldStyle}/><input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={fieldStyle}/></div>
        <select value={form.preferredChannel} onChange={e => setForm({ ...form, preferredChannel: e.target.value })} style={{ ...fieldStyle, marginTop: 10 }}><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select>
        <textarea placeholder="Notes (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...fieldStyle, minHeight: 72, marginTop: 10 }}/>
        {error && <p style={{ color: T.RED, fontWeight: 600 }}>{error}</p>}
        <button disabled={create.isPending} onClick={() => create.mutate()} style={{ ...primaryButton, marginTop: 12 }}>{create.isPending ? "Adding..." : "Add client"}</button>
      </div>}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients or sites" style={{ ...fieldStyle, marginTop: 20 }}/>
      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        {isLoading ? <p>Loading clients...</p> : visible.length === 0 ? <div style={{ ...cardStyle, textAlign: "center", color: "#7b8288" }}>No clients found</div> : visible.map((client: any) => <button key={client.id} onClick={() => setLocation(`/trades/clients/${client.id}`)} style={{ ...cardStyle, border: 0, marginTop: 0, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}><span style={{ width: 42, height: 42, borderRadius: 999, background: T.ACCENT, color: "#fff", display: "grid", placeItems: "center", fontWeight: 900 }}>{client.firstName?.[0]}{client.lastName?.[0]}</span><span style={{ flex: 1 }}><strong style={{ display: "block", fontSize: 16 }}>{client.firstName} {client.lastName}</strong><small style={{ color: "#687078" }}>{client.siteAddress}</small></span><span style={{ color: T.ACCENT, fontSize: 20 }}>›</span></button>)}
      </div>
    </section>
  </main>;
}

const cardStyle = { background: "#fff", borderRadius: 17, padding: 17, marginTop: 16, boxShadow: "0 8px 30px rgba(26,29,33,.05)" };
const primaryButton = { width: "100%", padding: 14, borderRadius: 12, border: 0, background: T.ACCENT, color: "#fff", fontWeight: 800, cursor: "pointer" };
const smallButton = { padding: "10px 15px", borderRadius: 999, border: 0, background: T.INK, color: "#fff", fontWeight: 800, cursor: "pointer" };
const linkStyle = { border: 0, background: "none", color: T.ACCENT, fontWeight: 700, padding: "10px 0", cursor: "pointer" };
