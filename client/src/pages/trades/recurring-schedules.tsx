import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { tradesFetch, tradesHeaders } from "@/lib/trades-api";
import { formatNzd } from "@/lib/trades-money";
import { TRADES_THEME as T } from "@/lib/trades-theme";

const field = { width: "100%", boxSizing: "border-box" as const, padding: 12, borderRadius: 11, border: "1px solid rgba(6,21,14,.16)", background: "#fff", color: T.INK, font: "inherit" };

export default function RecurringSchedules() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ clientProfileId: "", amount: "", frequency: "monthly", deliveryChannel: "email", startDate: new Date().toISOString().slice(0, 10) });
  const [error, setError] = useState("");
  const { data: clients = [] } = useQuery<any[]>({ queryKey: ["/api/trades/clients"], queryFn: () => tradesFetch("/api/trades/clients").then(r => r.ok ? r.json() : []) });
  const { data: schedules = [] } = useQuery<any[]>({ queryKey: ["/api/trades/schedules"], queryFn: () => tradesFetch("/api/trades/schedules").then(r => r.ok ? r.json() : []) });
  const { data: reminders } = useQuery<any>({ queryKey: ["/api/trades/reminder-settings"], queryFn: () => tradesFetch("/api/trades/reminder-settings").then(r => r.ok ? r.json() : null) });
  const remindersEnabled = reminders?.tradeRemindersEnabled ?? true;
  const toggleReminders = useMutation({
    mutationFn: async (enabled: boolean) => { const r = await fetch("/api/trades/reminder-settings", { method: "PUT", headers: { "Content-Type": "application/json", ...tradesHeaders() }, body: JSON.stringify({ tradeRemindersEnabled: enabled }) }); if (!r.ok) throw new Error("Could not save"); return r.json(); },
    onMutate: async (enabled: boolean) => { await queryClient.cancelQueries({ queryKey: ["/api/trades/reminder-settings"] }); const prev = queryClient.getQueryData(["/api/trades/reminder-settings"]); queryClient.setQueryData(["/api/trades/reminder-settings"], { tradeRemindersEnabled: enabled }); return { prev }; },
    onError: (_e, _v, ctx: any) => { if (ctx?.prev !== undefined) queryClient.setQueryData(["/api/trades/reminder-settings"], ctx.prev); },
    onSuccess: (data: any) => queryClient.setQueryData(["/api/trades/reminder-settings"], data),
  });
  const client = (id: string) => clients.find((item: any) => item.id === id);
  const action = useMutation({
    mutationFn: async ({ url, method, body }: any) => { const response = await fetch(url, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...tradesHeaders() }, body: body ? JSON.stringify(body) : undefined }); if (!response.ok) throw new Error(await response.json().then(d => d.message).catch(() => "Action failed")); return response.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/trades/schedules"] }); setError(""); },
    onError: (err: any) => setError(err?.message || "Action failed"),
  });
  const create = () => {
    const amountCents = Math.round(Number(form.amount) * 100);
    if (!form.clientProfileId || amountCents <= 0) { setError("Choose a client and enter an amount"); return; }
    action.mutate({ url: "/api/trades/schedules", method: "POST", body: { clientProfileId: form.clientProfileId, amountCents, frequency: form.frequency, deliveryChannel: form.deliveryChannel, startDate: new Date(`${form.startDate}T09:00:00Z`).toISOString() } });
  };

  return <main style={{ minHeight: "100vh", background: T.OFFW, color: T.INK, padding: "22px 16px 70px", fontFamily: "Outfit, system-ui, sans-serif" }}><section style={{ maxWidth: 620, margin: "0 auto" }}>
    <button onClick={() => setLocation("/trades")} style={link}>Back to jobs</button>
    <div style={{ color: T.ACCENT, fontWeight: 900, fontSize: 11, textTransform: "uppercase", letterSpacing: ".13em" }}>Trades</div><h1 style={{ margin: "7px 0 4px" }}>Recurring invoices</h1><p style={{ margin: 0, color: "#687078" }}>Maintenance retainers and repeat jobs</p>
    <div style={card}>
      <select value={form.clientProfileId} onChange={e => setForm({ ...form, clientProfileId: e.target.value })} style={field}><option value="">Choose client</option>{clients.filter((c: any) => c.status !== "archived").map((c: any) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName} - {c.siteAddress}</option>)}</select>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}><input value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, "") })} placeholder="Amount" inputMode="decimal" style={field}/><select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} style={field}><option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option><option value="monthly">Monthly</option></select></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}><input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} style={field}/><select value={form.deliveryChannel} onChange={e => setForm({ ...form, deliveryChannel: e.target.value })} style={field}><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select></div>
      {error && <p style={{ color: T.RED, fontWeight: 700 }}>{error}</p>}<button onClick={create} disabled={action.isPending} style={{ ...primary, marginTop: 12 }}>{action.isPending ? "Saving..." : "Create recurring Invoice"}</button>
    </div>
    <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
      <div><div style={{ fontWeight: 700 }}>Overdue reminders</div><div style={{ color: "#687078", fontSize: 13, marginTop: 3 }}>Automatically chase unpaid job invoices past their due date</div></div>
      <button role="switch" aria-checked={remindersEnabled} aria-label="Toggle trades reminders" onClick={() => toggleReminders.mutate(!remindersEnabled)} disabled={toggleReminders.isPending}
        style={{ flexShrink: 0, width: 50, height: 30, borderRadius: 999, border: 0, cursor: "pointer", background: remindersEnabled ? T.GREEN : "rgba(6,21,14,.2)", position: "relative", transition: "background .15s" }}>
        <span style={{ position: "absolute", top: 3, left: remindersEnabled ? 23 : 3, width: 24, height: 24, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
      </button>
    </div>
    <h2 style={{ marginTop: 28, fontSize: 13, textTransform: "uppercase", letterSpacing: ".11em" }}>Schedules</h2>
    <div style={{ display: "grid", gap: 10 }}>{schedules.length === 0 ? <div style={{ ...card, color: "#7b8288", textAlign: "center" }}>No recurring invoices</div> : schedules.map((schedule: any) => { const c = client(schedule.clientProfileId); return <div key={schedule.id} style={{ ...card, marginTop: 0 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><div><strong>{c ? `${c.firstName} ${c.lastName}` : "Client"}</strong><div style={{ color: "#687078", marginTop: 4, textTransform: "capitalize" }}>{schedule.frequency} - {schedule.deliveryChannel}</div></div><div style={{ textAlign: "right" }}><strong>{formatNzd(schedule.amountCents)}</strong><div style={{ color: schedule.status === "active" ? T.GREEN : T.AMBER, textTransform: "capitalize", marginTop: 4 }}>{schedule.status}</div></div></div><div style={{ color: "#687078", fontSize: 12, marginTop: 12 }}>Next Invoice: {new Date(schedule.nextRunDate).toLocaleDateString("en-NZ")}</div>{schedule.status !== "terminated" && <div style={{ display: "flex", gap: 8, marginTop: 12 }}><button onClick={() => action.mutate({ url: `/api/trades/schedules/${schedule.id}`, method: "PUT", body: { status: schedule.status === "paused" ? "active" : "paused" } })} style={secondary}>{schedule.status === "paused" ? "Resume" : "Pause"}</button><button onClick={() => action.mutate({ url: `/api/trades/schedules/${schedule.id}`, method: "DELETE" })} style={{ ...secondary, color: T.RED }}>Cancel</button></div>}</div>; })}</div>
  </section></main>;
}

const card = { background: "#fff", borderRadius: 17, padding: 17, marginTop: 16, boxShadow: "0 8px 30px rgba(6,21,14,.05)" };
const primary = { width: "100%", border: 0, borderRadius: 12, padding: 14, background: T.ACCENT, color: "#fff", fontWeight: 800, cursor: "pointer" };
const secondary = { flex: 1, border: "1px solid rgba(6,21,14,.14)", borderRadius: 10, padding: 10, background: "transparent", color: T.INK, fontWeight: 700, cursor: "pointer" };
const link = { border: 0, background: "none", color: T.ACCENT, fontWeight: 700, padding: "10px 0", cursor: "pointer" };
