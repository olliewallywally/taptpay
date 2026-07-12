import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { X } from "lucide-react";
import { tradesFetch, tradesHeaders } from "@/lib/trades-api";
import { TRADES_THEME } from "@/lib/trades-theme";

/* ── Design tokens — mirrors the tenant directory (property) page ── */
const C = {
  ink: TRADES_THEME.INK,
  sky: TRADES_THEME.ACCENT,
  white: "#FFFFFF",
  gray: "#D9D7D7",
  sheet: TRADES_THEME.OFFW,
  body: "#E8E8E8",
  mute: "#8C8C8C",
  red: "#C71A2A",
};

type Channel = "email" | "whatsapp" | "sms";

type ClientForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  siteAddress: string;
  preferredChannel: Channel;
  notes: string;
};

const emptyForm: ClientForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  siteAddress: "",
  preferredChannel: "email",
  notes: "",
};

function fmtCents(c: number) {
  return "$" + (c / 100).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pulse(e: any) {
  const el = e.currentTarget;
  el.classList.remove("cdir-pulse");
  void el.offsetWidth;
  el.classList.add("cdir-pulse");
}

/* ── Shared field input (same as tenant directory sheet) ── */
function Field({ label, value, onChange, placeholder, required, type = "text" }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.sky, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
        {label}{required ? " *" : ""}
      </div>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={{ width: "100%", padding: "14px 16px", borderRadius: 14, background: C.gray, border: "none", outline: "none", color: C.ink, fontSize: 15, fontWeight: 500, boxSizing: "border-box", fontFamily: "inherit" }}
      />
    </div>
  );
}

function TextAreaField({ label, value, onChange, placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.sky, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={{ width: "100%", minHeight: 88, resize: "vertical", padding: "14px 16px", borderRadius: 14, background: C.gray, border: "none", outline: "none", color: C.ink, fontSize: 15, fontWeight: 500, boxSizing: "border-box", fontFamily: "inherit" }}
      />
    </div>
  );
}

/* ── Add Client Sheet (mirrors AddTenantSheet) ── */
function AddClientSheet({ onClose, onSave, saving, saveError }: {
  onClose: () => void;
  onSave: (data: ClientForm) => void;
  saving: boolean;
  saveError: string | null;
}) {
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [closing, setClosing] = useState(false);

  const setText = (key: keyof Omit<ClientForm, "preferredChannel">) => (value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const channelContactOk = form.preferredChannel === "email" ? !!form.email.trim() : !!form.phone.trim();
  const valid = !!form.firstName.trim() && !!form.lastName.trim() && !!form.siteAddress.trim() && channelContactOk;

  const handleClose = () => {
    setClosing(true);
    setTimeout(onClose, 320);
  };

  const handleSave = () => {
    if (!valid || saving) return;
    onSave(form);
  };

  const animIn = "atSlideUp 0.38s cubic-bezier(0.16,1,0.3,1) both";
  const animOut = "atSlideDown 0.32s cubic-bezier(0.4,0,0.2,1) both";
  const fadeIn = "atFdIn 0.28s ease both";
  const fadeOut = "atFdOut 0.28s ease both";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100 }}>
      <style>{`
        @keyframes atSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes atSlideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
        @keyframes atFdIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes atFdOut { from { opacity: 1; } to { opacity: 0; } }
      `}</style>

      <div
        onClick={handleClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(4,13,109,0.55)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          animation: closing ? fadeOut : fadeIn,
        }}
      />

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 390, background: C.sheet, borderRadius: "28px 28px 0 0", maxHeight: "92vh", overflowY: "auto", animation: closing ? animOut : animIn }}>
          <div style={{ display: "flex", justifyContent: "center", padding: "14px 0 2px" }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(0,0,0,0.1)" }} />
          </div>

          <div style={{ padding: "12px 24px 52px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <span style={{ fontWeight: 700, fontSize: 20, color: C.ink, letterSpacing: "-0.3px" }}>add client</span>
              <button
                onClick={handleClose}
                aria-label="Close add client sheet"
                style={{ width: 32, height: 32, borderRadius: 999, background: C.gray, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <X size={15} color={C.ink} strokeWidth={2.4} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
              <Field label="first name" value={form.firstName} onChange={setText("firstName")} required />
              <Field label="last name" value={form.lastName} onChange={setText("lastName")} required />
            </div>
            <Field label="site address" value={form.siteAddress} onChange={setText("siteAddress")} required />
            <Field label="email" value={form.email} onChange={setText("email")} type="email" />
            <Field label="phone" value={form.phone} onChange={setText("phone")} type="tel" />

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.sky, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>send invoice via</div>
              <div style={{ display: "flex", gap: 8 }}>
                {(["email", "whatsapp", "sms"] as const).map((channel) => (
                  <button
                    key={channel}
                    onClick={() => setForm((current) => ({ ...current, preferredChannel: channel }))}
                    style={{ flex: 1, padding: "13px 0", borderRadius: 14, border: "none", background: form.preferredChannel === channel ? C.ink : C.gray, color: form.preferredChannel === channel ? C.white : C.ink, fontWeight: 600, fontSize: 12.5, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.04em", transition: "background 0.18s, color 0.18s" }}
                  >
                    {channel}
                  </button>
                ))}
              </div>
              {!channelContactOk && (
                <div style={{ marginTop: 8, fontSize: 12, color: C.red, fontWeight: 500 }}>
                  add {form.preferredChannel === "email" ? "an email address" : "a phone number"} above to send via {form.preferredChannel}
                </div>
              )}
            </div>

            <TextAreaField label="notes" value={form.notes} onChange={setText("notes")} placeholder="job access, parking, gate code" />

            {saveError && (
              <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 14, background: "rgba(255,59,78,0.07)", border: "1px solid rgba(255,59,78,0.18)" }}>
                <p style={{ color: C.red, fontSize: 13, fontWeight: 500, margin: 0 }}>{saveError}</p>
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={!valid || saving}
              style={{ width: "100%", padding: "18px 0", borderRadius: 999, background: valid && !saving ? C.ink : C.gray, color: valid && !saving ? C.white : C.mute, fontWeight: 700, fontSize: 16, border: "none", cursor: valid && !saving ? "pointer" : "default", transition: "background 0.2s, color 0.2s" }}
            >
              {saving ? "adding…" : "add client"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Client list row (mirrors TenantRow) ── */
function initials(client: any) {
  return `${client.firstName?.[0] ?? ""}${client.lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

const LIVE_STATUSES = ["pending_dispatch", "dispatched", "viewed", "deposit_paid", "balance_due", "dispatch_failed"];

function isOverdue(invoice: any) {
  if (!invoice) return false;
  if (invoice.status === "overdue") return true;
  return !!invoice.dueAt
    && new Date(invoice.dueAt).getTime() < Date.now()
    && !["paid", "paid_external", "voided"].includes(invoice.status);
}

function fmtDue(invoice: any) {
  if (!invoice?.dueAt) return "";
  return new Date(invoice.dueAt).toLocaleDateString("en-NZ", { day: "2-digit", month: "2-digit" });
}

function ClientRow({ client, nextInvoice, onClick }: { client: any; nextInvoice: any; onClick: () => void }) {
  const fullName = `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || "client";
  const overdue = isOverdue(nextInvoice);
  const paid = nextInvoice && ["paid", "paid_external"].includes(nextInvoice.status);
  const label = overdue ? "overdue" : paid ? "paid" : "next invoice";

  return (
    <button type="button" className="cdir-row" onClick={onClick}>
      <span className="cdir-avatar">{initials(client)}</span>
      <span className="cdir-copy">
        <span className="cdir-name">{fullName}</span>
        <span className="cdir-address">{client.siteAddress || "no site address"}</span>
      </span>
      <span className="cdir-money">
        <span>{nextInvoice ? fmtCents(nextInvoice.amountCents ?? 0) : "—"}</span>
        {nextInvoice ? (
          <small className={overdue ? "overdue" : ""}>{label}<br />{fmtDue(nextInvoice)}</small>
        ) : (
          <small>no invoice</small>
        )}
      </span>
    </button>
  );
}

export default function ClientDirectory() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: clients = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/trades/clients"],
    queryFn: () => tradesFetch("/api/trades/clients").then((response) => response.ok ? response.json() : []),
    staleTime: 60000,
    retry: false,
  });

  const { data: invoices = [] } = useQuery<any[]>({
    queryKey: ["/api/trades/invoices"],
    queryFn: () => tradesFetch("/api/trades/invoices").then((response) => response.ok ? response.json() : []),
    staleTime: 30000,
    retry: false,
  });

  // Archived clients — fetched lazily only when the merchant expands the section.
  const { data: archivedClients = [] } = useQuery<any[]>({
    queryKey: ["/api/trades/clients", "archived"],
    queryFn: () => tradesFetch("/api/trades/clients?includeArchived=true").then((response) => response.ok ? response.json() : []),
    select: (list: any[]) => list.filter((client: any) => client.status === "archived"),
    enabled: showArchived,
    staleTime: 30000,
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: async (data: ClientForm) => {
      const response = await fetch("/api/trades/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...tradesHeaders() },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const message = await response.json().then((body) => body.message).catch(() => `Error ${response.status}`);
        throw new Error(message);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trades/clients"] });
      setSaveError(null);
      setShowAdd(false);
    },
    onError: (error) => {
      setSaveError(error instanceof Error ? error.message : "Failed to add client. The backend may not be connected yet.");
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/trades/clients/${id}/unarchive`, { method: "POST", headers: tradesHeaders() });
      if (!response.ok) throw new Error("Failed to restore");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trades/clients"] });
    },
  });

  /* Helpers — prospects are hidden quick-invoice profiles, never listed */
  const activeClients = clients.filter((client: any) => !["archived", "prospect"].includes(client.status));
  const term = search.trim().toLowerCase();
  const filtered = activeClients.filter((client: any) => {
    const haystack = `${client.firstName ?? ""} ${client.lastName ?? ""} ${client.siteAddress ?? ""}`.toLowerCase();
    return !term || haystack.includes(term);
  });
  const clientCountLabel = `active client${activeClients.length !== 1 ? "s" : ""}`;

  // Return the invoice that represents the worst-case status for this client
  // (failed > overdue > live > most recent) — same idea as the tenant directory.
  const invoiceByClient = (clientId: string) => {
    const live = invoices
      .filter((invoice: any) => invoice.clientProfileId === clientId && invoice.status !== "voided")
      .sort((a: any, b: any) => new Date(b.createdAt ?? b.dueAt).getTime() - new Date(a.createdAt ?? a.dueAt).getTime());
    if (live.length === 0) return undefined;

    const failed = live.find((invoice: any) => invoice.status === "dispatch_failed");
    if (failed) return failed;
    const overdue = live.find((invoice: any) => isOverdue(invoice));
    if (overdue) return overdue;
    const active = live.find((invoice: any) => LIVE_STATUSES.includes(invoice.status));
    if (active) return active;
    return live[0];
  };

  return (
    <div style={{ background: C.white, minHeight: "100svh", display: "flex", justifyContent: "center" }}>
    <div style={{ width: "100%", maxWidth: 430, minHeight: "100svh", background: C.sheet, paddingBottom: 128, fontFamily: "'Outfit', system-ui, sans-serif", overflow: "hidden" }}>
      <style>{DIRECTORY_CSS}</style>

      {/* Hero — big count over ink, same metrics as the tenant directory hero */}
      <section className="cdir-hero">
        <div className="pt-bounce cdir-hero-count" style={{ "--pt-d": "0ms" } as any}>{activeClients.length}</div>
        <div className="pt-bounce cdir-hero-label" style={{ "--pt-d": "60ms" } as any}>{clientCountLabel}</div>
      </section>

      <main className="cdir-body">
        <button type="button" className="cdir-add" onPointerDown={pulse} onClick={() => setShowAdd(true)} aria-label="Add client">
          <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <div className="pt-bounce cdir-search-row" style={{ "--pt-d": "140ms" } as any}>
          <label className="cdir-search">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="search clients or site"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} aria-label="Clear search">
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={C.mute} strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => setLocation("/trades")}
            aria-label="Go to trades dashboard"
            className="cdir-grid-btn"
          >
            <svg width={17} height={17} viewBox="0 0 20 20" fill={C.sky}><rect x="1" y="1" width="7" height="7" rx="1.5" /><rect x="12" y="1" width="7" height="7" rx="1.5" /><rect x="1" y="12" width="7" height="7" rx="1.5" /><rect x="12" y="12" width="7" height="7" rx="1.5" /></svg>
          </button>
        </div>

        <div className="cdir-list">
          {isLoading ? (
            <div className="pt-bounce cdir-empty" style={{ "--pt-d": "190ms" } as any}>loading clients...</div>
          ) : filtered.length === 0 ? (
            <div className="pt-bounce cdir-empty" style={{ "--pt-d": "190ms" } as any}>
              {search ? `no clients match "${search}"` : "no clients yet - tap + to add your first"}
            </div>
          ) : (
            filtered.map((client: any, i: number) => (
              <div key={client.id} className="pt-bounce" style={{ "--pt-d": `${190 + Math.min(i, 12) * 45}ms` } as any}>
                <ClientRow
                  client={client}
                  nextInvoice={invoiceByClient(client.id)}
                  onClick={() => setLocation(`/trades/clients/${client.id}`)}
                />
              </div>
            ))
          )}
        </div>

        <div className="pt-bounce cdir-archived" style={{ "--pt-d": `${190 + (Math.min(filtered.length, 12) + 1) * 45}ms` } as any}>
          <button type="button" onClick={() => setShowArchived((current) => !current)}>
            {showArchived ? "hide archived" : "show archived"}
          </button>
          {showArchived && (
            archivedClients.length === 0 ? (
              <div className="cdir-archived-empty">no archived clients</div>
            ) : (
              <div className="cdir-archived-list">
                {archivedClients.map((client: any) => (
                  <div key={client.id} className="cdir-archive-row">
                    <div>
                      <strong>{client.firstName} {client.lastName}</strong>
                      <span>{client.siteAddress}</span>
                    </div>
                    <button type="button" onClick={() => restoreMutation.mutate(client.id)} disabled={restoreMutation.isPending}>restore</button>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </main>

      {/* Add client sheet */}
      {showAdd && (
        <AddClientSheet
          onClose={() => { setShowAdd(false); setSaveError(null); }}
          onSave={(data) => { setSaveError(null); createMutation.mutate(data); }}
          saving={createMutation.isPending}
          saveError={saveError}
        />
      )}
    </div>
    </div>
  );
}

/* Mirrors the tenant directory's DIRECTORY_CSS with trades theme tokens.
   (cdir- prefix so the two pages' styles never collide.) */
const DIRECTORY_CSS = `
.cdir-hero {
  position: relative;
  height: 265px;
  background: ${C.ink};
  color: ${C.sky};
  padding: 78px 34px 0;
  box-sizing: border-box;
}
.cdir-hero-count {
  font-family: 'Outfit', system-ui, sans-serif;
  font-size: 100px;
  line-height: 0.95;
  font-weight: 800;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
}
.cdir-hero-label {
  margin-top: 16px;
  font-size: 13px;
  line-height: 1;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
.cdir-add {
  position: absolute;
  left: 50%;
  top: -34px;
  width: 68px;
  height: 68px;
  transform: translateX(-50%);
  opacity: 0;
  animation: cdirAddPop 0.52s cubic-bezier(0.34, 1.56, 0.64, 1) 90ms both;
  border: none;
  border-radius: 999px;
  background: ${C.sky};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(4,13,109,0.16);
  -webkit-tap-highlight-color: transparent;
}
.cdir-add::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  box-shadow: 0 0 0 0 rgba(88,171,255,0);
}
.cdir-add.cdir-pulse::after {
  animation: cdirAddRing 0.48s ease-out;
}
@keyframes cdirAddPop {
  0%   { opacity: 0; transform: translateX(-50%) translateY(30px) scale(0.86); }
  55%  { opacity: 1; transform: translateX(-50%) translateY(-7px) scale(1.045); }
  74%  { transform: translateX(-50%) translateY(3px) scale(0.983); }
  88%  { transform: translateX(-50%) translateY(-1.5px) scale(1.007); }
  100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
}
@keyframes cdirAddRing {
  0% { box-shadow: 0 0 0 0 rgba(88,171,255,0.48); }
  100% { box-shadow: 0 0 0 10px rgba(88,171,255,0); }
}
.cdir-body {
  position: relative;
  background: ${C.body};
  margin-top: -28px;
  border-radius: 28px 28px 0 0;
  min-height: calc(100svh - 237px);
  padding: 50px 13px 0;
  box-sizing: border-box;
}
.cdir-search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 40px;
  gap: 8px;
  align-items: center;
}
.cdir-search {
  height: 40px;
  border-radius: 999px;
  background: ${C.gray};
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 18px;
  box-sizing: border-box;
}
.cdir-search input {
  min-width: 0;
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: ${C.ink};
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 500;
  letter-spacing: 0;
}
.cdir-search input::placeholder { color: rgba(4,13,109,0.4); }
.cdir-search button {
  border: none;
  background: transparent;
  padding: 0;
  display: flex;
  cursor: pointer;
}
.cdir-grid-btn {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 13px;
  background: ${C.ink};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.cdir-list {
  display: flex;
  flex-direction: column;
  padding-top: 12px;
}
.cdir-row {
  width: 100%;
  border: none;
  background: transparent;
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  align-items: center;
  gap: 15px;
  padding: 15px 4px;
  box-sizing: border-box;
  color: ${C.ink};
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.cdir-row:active { transform: scale(0.99); opacity: 0.75; }
.cdir-avatar {
  width: 46px;
  height: 46px;
  border-radius: 999px;
  background: transparent;
  border: 1.5px solid ${C.sky};
  color: ${C.ink};
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 13px;
  letter-spacing: 0.02em;
  flex-shrink: 0;
  box-sizing: border-box;
}
.cdir-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.cdir-name {
  color: ${C.ink};
  font-weight: 700;
  font-size: 15px;
  line-height: 1.15;
  text-transform: lowercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cdir-address {
  color: rgba(4,13,109,0.75);
  font-weight: 500;
  font-size: 13.5px;
  line-height: 1.2;
  text-transform: lowercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cdir-money {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 76px;
  color: ${C.ink};
  justify-self: end;
}
.cdir-money span {
  font-size: 17px;
  line-height: 1;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.cdir-money small {
  font-size: 10px;
  line-height: 1.35;
  color: rgba(4,13,109,0.75);
  font-weight: 500;
  text-align: center;
  white-space: nowrap;
}
.cdir-money small.overdue { color: ${C.red}; font-weight: 700; }
.cdir-empty {
  padding: 34px 18px;
  color: rgba(4,13,109,0.55);
  text-align: center;
  font-size: 13px;
  font-weight: 600;
}
.cdir-archived {
  padding: 23px 2px 0;
}
.cdir-archived > button {
  border: none;
  background: transparent;
  color: rgba(4,13,109,0.48);
  font-family: inherit;
  font-size: 11px;
  font-weight: 850;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 0;
}
.cdir-archived-empty {
  padding: 14px 0;
  color: rgba(4,13,109,0.48);
  font-size: 13px;
  font-weight: 650;
}
.cdir-archived-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}
.cdir-archive-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 18px;
  background: ${C.gray};
}
.cdir-archive-row div {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.cdir-archive-row strong {
  color: ${C.ink};
  font-size: 13px;
  font-weight: 850;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cdir-archive-row span {
  color: rgba(4,13,109,0.55);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cdir-archive-row button {
  border: none;
  border-radius: 11px;
  background: ${C.ink};
  color: ${C.white};
  padding: 8px 13px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 850;
  cursor: pointer;
}
@media (max-width: 350px) {
  .cdir-body { padding-left: 10px; padding-right: 10px; }
  .cdir-row { grid-template-columns: 42px minmax(0, 1fr) auto; gap: 10px; padding-left: 2px; padding-right: 2px; }
  .cdir-avatar { width: 42px; height: 42px; }
  .cdir-money { min-width: 68px; }
  .cdir-money span { font-size: 15px; }
}
`;
