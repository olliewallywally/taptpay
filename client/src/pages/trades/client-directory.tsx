import { useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { LayoutGrid, Pencil, Plus, RotateCcw, Search, X } from "lucide-react";
import { tradesFetch, tradesHeaders } from "@/lib/trades-api";
import { TRADES_THEME } from "@/lib/trades-theme";

const C = {
  ink: TRADES_THEME.INK,
  panel: TRADES_THEME.ACCENT,
  cream: TRADES_THEME.OFFW,
  white: "#FFFFFF",
  gray: "#E7E6E5",
  mute: "#8C8C8C",
  green: TRADES_THEME.GREEN,
  red: TRADES_THEME.RED,
  amber: TRADES_THEME.AMBER,
};

const STATUS_MAP: Record<string, { dot: string; bg: string; fg: string; label: string }> = {
  paid: { dot: C.green, bg: "rgba(27,191,133,0.14)", fg: "#0B7D63", label: "paid" },
  overdue: { dot: C.red, bg: "rgba(255,59,78,0.12)", fg: "#C71A2A", label: "overdue" },
  failed: { dot: C.amber, bg: "rgba(255,176,46,0.18)", fg: "#9A6A00", label: "not delivered" },
  dueSoon: { dot: C.amber, bg: "rgba(255,176,46,0.18)", fg: "#9A6A00", label: "due soon" },
  upcoming: { dot: C.panel, bg: "rgba(34,34,34,0.12)", fg: C.panel, label: "upcoming" },
};

const LIVE_STATUSES = ["pending_dispatch", "dispatched", "viewed", "deposit_paid", "balance_due", "dispatch_failed"];

const GLASS: CSSProperties = {
  background: "linear-gradient(140deg, rgba(255,255,255,0.92) 0%, rgba(234,238,244,0.72) 50%, rgba(220,227,240,0.62) 100%)",
  backdropFilter: "blur(16px) saturate(130%)",
  WebkitBackdropFilter: "blur(16px) saturate(130%)",
  border: "1px solid rgba(255,255,255,0.7)",
  boxShadow: "0 12px 32px rgba(6,21,14,0.10), inset 0 1px 0 rgba(255,255,255,0.95)",
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

function StatusBox({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? STATUS_MAP.upcoming;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 8, background: s.bg, color: s.fg, fontWeight: 600, fontSize: 11, letterSpacing: 0, textTransform: "uppercase" }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: s.dot, flexShrink: 0 }} />
      {s.label}
    </div>
  );
}

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
      <div style={{ fontSize: 11, fontWeight: 700, color: C.panel, letterSpacing: 0, textTransform: "uppercase", marginBottom: 6 }}>
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
      <div style={{ fontSize: 11, fontWeight: 700, color: C.panel, letterSpacing: 0, textTransform: "uppercase", marginBottom: 6 }}>
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
          background: "rgba(6,21,14,0.55)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          animation: closing ? fadeOut : fadeIn,
        }}
      />

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 390, background: C.cream, borderRadius: "28px 28px 0 0", maxHeight: "92vh", overflowY: "auto", animation: closing ? animOut : animIn }}>
          <div style={{ display: "flex", justifyContent: "center", padding: "14px 0 2px" }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(0,0,0,0.1)" }} />
          </div>

          <div style={{ padding: "12px 24px 52px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <span style={{ fontWeight: 700, fontSize: 20, color: C.ink, letterSpacing: 0 }}>add client</span>
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
              <div style={{ fontSize: 11, fontWeight: 700, color: C.panel, letterSpacing: 0, textTransform: "uppercase", marginBottom: 8 }}>send invoice via</div>
              <div style={{ display: "flex", gap: 8 }}>
                {(["email", "whatsapp", "sms"] as const).map((channel) => (
                  <button
                    key={channel}
                    onClick={() => setForm((current) => ({ ...current, preferredChannel: channel }))}
                    style={{ flex: 1, padding: "13px 0", borderRadius: 14, border: "none", background: form.preferredChannel === channel ? C.ink : C.gray, color: form.preferredChannel === channel ? C.cream : C.ink, fontWeight: 700, fontSize: 12.5, cursor: "pointer", textTransform: "uppercase", letterSpacing: 0, transition: "background 0.18s, color 0.18s" }}
                  >
                    {channel}
                  </button>
                ))}
              </div>
              {!channelContactOk && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#C71A2A", fontWeight: 600 }}>
                  add {form.preferredChannel === "email" ? "an email address" : "a phone number"} above to send via {form.preferredChannel}
                </div>
              )}
            </div>

            <TextAreaField label="notes" value={form.notes} onChange={setText("notes")} placeholder="job access, parking, gate code" />

            {saveError && (
              <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 14, background: "rgba(255,59,78,0.07)", border: "1px solid rgba(255,59,78,0.18)" }}>
                <p style={{ color: "#C71A2A", fontSize: 13, fontWeight: 600, margin: 0 }}>{saveError}</p>
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={!valid || saving}
              style={{ width: "100%", padding: "18px 0", borderRadius: 999, background: valid && !saving ? C.ink : C.gray, color: valid && !saving ? C.cream : C.mute, fontWeight: 700, fontSize: 16, border: "none", cursor: valid && !saving ? "pointer" : "default", transition: "background 0.2s, color 0.2s" }}
            >
              {saving ? "adding..." : "add client"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function invoiceStatus(invoice: any): string {
  if (!invoice) return "upcoming";
  if (invoice.status === "paid" || invoice.status === "paid_external") return "paid";
  if (invoice.status === "overdue") return "overdue";
  if (invoice.status === "dispatch_failed") return "failed";
  if (invoice.dueAt && new Date(invoice.dueAt).getTime() < Date.now() && !["paid", "paid_external", "voided"].includes(invoice.status)) return "overdue";
  return "upcoming";
}

function ClientRow({ client, nextInvoice, onClick }: { client: any; nextInvoice: any; onClick: () => void }) {
  const fullName = `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || "Client";
  const status = invoiceStatus(nextInvoice);
  const dueDate = nextInvoice?.dueAt ? new Date(nextInvoice.dueAt).toLocaleDateString("en-NZ", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "-";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 12 }}>
      <div style={{ ...GLASS, borderRadius: 18, padding: "16px 16px 14px", position: "relative", display: "flex", flexDirection: "column", cursor: "pointer" }} onClick={onClick}>
        <button
          onClick={(event) => { event.stopPropagation(); onClick(); }}
          aria-label={`Open ${fullName}`}
          style={{ position: "absolute", top: 12, right: 12, width: 28, height: 28, borderRadius: 999, background: C.white, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 1px 3px rgba(6,21,14,0.12)" }}
        >
          <Pencil size={14} color={C.ink} strokeWidth={1.9} />
        </button>
        <div style={{ fontWeight: 600, fontSize: 14, color: C.ink, textTransform: "uppercase", letterSpacing: 0, paddingRight: 30, lineHeight: 1.25 }}>{fullName}</div>
        <div style={{ fontWeight: 500, fontSize: 12.5, color: C.ink, textTransform: "uppercase", letterSpacing: 0, marginTop: 5, lineHeight: 1.35 }}>{client.siteAddress || "site address needed"}</div>
        <div style={{ marginTop: 12 }}><StatusBox status={status} /></div>
      </div>

      <div style={{ ...GLASS, borderRadius: 18, padding: "16px 12px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div style={{ fontWeight: 900, fontSize: 27, color: C.ink, letterSpacing: 0, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {nextInvoice ? fmtCents(nextInvoice.amountCents ?? 0) : "-"}
        </div>
        <div style={{ fontWeight: 500, fontSize: 11, color: C.mute, marginTop: 8 }}>next invoice</div>
        <div style={{ fontWeight: 600, fontSize: 11, color: C.mute, marginTop: 1, fontVariantNumeric: "tabular-nums" }}>{dueDate}</div>
      </div>
    </div>
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

  const activeClients = clients.filter((client: any) => client.status !== "archived");
  const term = search.trim().toLowerCase();
  const filtered = activeClients.filter((client: any) => {
    const haystack = `${client.firstName ?? ""} ${client.lastName ?? ""} ${client.siteAddress ?? ""}`.toLowerCase();
    return !term || haystack.includes(term);
  });

  const invoiceByClient = (clientId: string) => {
    const live = invoices
      .filter((invoice: any) => invoice.clientProfileId === clientId && invoice.status !== "voided")
      .sort((a: any, b: any) => new Date(b.createdAt ?? b.dueAt).getTime() - new Date(a.createdAt ?? a.dueAt).getTime());
    if (live.length === 0) return undefined;

    const failed = live.find((invoice: any) => invoice.status === "dispatch_failed");
    if (failed) return failed;
    const overdue = live.find((invoice: any) => invoice.status === "overdue" || (invoice.dueAt && new Date(invoice.dueAt).getTime() < Date.now() && !["paid", "paid_external"].includes(invoice.status)));
    if (overdue) return overdue;
    const active = live.find((invoice: any) => LIVE_STATUSES.includes(invoice.status));
    if (active) return active;
    return live[0];
  };

  return (
    <div style={{ background: C.white, minHeight: "100svh", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 430, minHeight: "100svh", background: C.cream, paddingBottom: 130, fontFamily: "'Outfit', system-ui, sans-serif" }}>
        <div style={{ height: 54 }} />

        <div style={{ padding: "0 18px" }}>
          <div style={{ background: C.ink, borderRadius: 24, padding: "26px 26px 30px", position: "relative" }}>
            <div style={{ fontWeight: 900, fontSize: 64, color: C.cream, letterSpacing: 0, lineHeight: 0.92, fontVariantNumeric: "tabular-nums" }}>
              {activeClients.length}
            </div>
            <div style={{ fontWeight: 600, fontSize: 12, color: C.cream, letterSpacing: 0, textTransform: "uppercase", marginTop: 6 }}>
              active client{activeClients.length !== 1 ? "s" : ""}
            </div>
            <button
              onClick={() => setShowAdd(true)}
              aria-label="Add client"
              style={{ position: "absolute", right: 24, bottom: -20, width: 46, height: 46, borderRadius: 999, background: C.cream, color: C.ink, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 6px 16px rgba(6,21,14,0.32)" }}
            >
              <Plus size={22} strokeWidth={2.6} />
            </button>
          </div>
        </div>

        <div style={{ padding: "38px 18px 0", display: "flex", gap: 10 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: C.gray, borderRadius: 14, padding: "0 14px", height: 46 }}>
            <Search size={18} color={C.ink} strokeWidth={2} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="search clients or site"
              style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontWeight: 500, fontSize: 14, color: C.ink }}
            />
            {search && (
              <button onClick={() => setSearch("")} aria-label="Clear search" style={{ border: "none", background: "transparent", cursor: "pointer", display: "flex", padding: 0 }}>
                <X size={16} color={C.mute} strokeWidth={2.2} />
              </button>
            )}
          </div>
          <button
            onClick={() => setLocation("/trades")}
            aria-label="Go to trades dashboard"
            style={{ width: 46, height: 46, borderRadius: 14, background: C.ink, color: C.cream, border: "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}
          >
            <LayoutGrid size={20} fill={C.cream} strokeWidth={0} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "16px 18px 0" }}>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: C.mute, fontSize: 13 }}>loading clients...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: C.mute, fontSize: 13 }}>
              {search ? `no clients match "${search}"` : "no clients yet - tap + to add your first"}
            </div>
          ) : (
            filtered.map((client: any) => (
              <ClientRow
                key={client.id}
                client={client}
                nextInvoice={invoiceByClient(client.id)}
                onClick={() => setLocation(`/trades/clients/${client.id}`)}
              />
            ))
          )}
        </div>

        <div style={{ padding: "22px 18px 0" }}>
          <button
            onClick={() => setShowArchived((current) => !current)}
            style={{ background: "none", border: "none", color: C.mute, fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: 0, padding: 0 }}
          >
            {showArchived ? "hide archived" : "show archived"}
          </button>
          {showArchived && (
            archivedClients.length === 0 ? (
              <div style={{ padding: "14px 0", color: C.mute, fontSize: 13 }}>no archived clients</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                {archivedClients.map((client: any) => (
                  <div key={client.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 16, background: "#EDEDED" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: C.ink, textTransform: "capitalize", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{client.firstName} {client.lastName}</div>
                      <div style={{ fontSize: 11.5, color: C.mute, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{client.siteAddress}</div>
                    </div>
                    <button
                      onClick={() => restoreMutation.mutate(client.id)}
                      disabled={restoreMutation.isPending}
                      style={{ flexShrink: 0, background: C.ink, color: C.cream, border: "none", borderRadius: 10, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: restoreMutation.isPending ? "default" : "pointer", opacity: restoreMutation.isPending ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <RotateCcw size={13} />
                      restore
                    </button>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

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
