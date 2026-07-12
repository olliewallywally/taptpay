import { useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronLeft,
  DollarSign,
  Eye,
  FileText,
  Mail,
  MessageCircle,
  Pencil,
  Send,
  User,
  Wrench,
  X,
} from "lucide-react";
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

const LIVE_STATUSES = ["pending_dispatch", "dispatched", "viewed", "deposit_paid", "balance_due", "dispatch_failed"];

const HERO_STATUS: Record<string, { dot: string; bg: string; fg: string; label: string }> = {
  paid: { dot: C.green, bg: "rgba(27,191,133,0.20)", fg: C.green, label: "paid" },
  overdue: { dot: C.red, bg: "rgba(255,59,78,0.20)", fg: C.red, label: "overdue" },
  failed: { dot: C.amber, bg: "rgba(255,176,46,0.20)", fg: C.amber, label: "not delivered" },
  active: { dot: C.cream, bg: "rgba(244,244,244,0.16)", fg: C.cream, label: "active" },
  quoted: { dot: C.cream, bg: "rgba(244,244,244,0.16)", fg: C.cream, label: "quoted" },
  accepted: { dot: C.green, bg: "rgba(27,191,133,0.20)", fg: C.green, label: "accepted" },
  upcoming: { dot: C.cream, bg: "rgba(244,244,244,0.16)", fg: C.cream, label: "upcoming" },
};

const EVENT_TONES = {
  green: { color: C.green, bg: "rgba(27,191,133,0.14)", fg: "#0B7D63" },
  red: { color: C.red, bg: "rgba(255,59,78,0.12)", fg: "#C71A2A" },
  amber: { color: C.amber, bg: "rgba(255,176,46,0.18)", fg: "#9A6A00" },
  dark: { color: C.panel, bg: "rgba(88,171,255,0.12)", fg: C.panel },
  muted: { color: C.mute, bg: "rgba(0,0,0,0.06)", fg: C.mute },
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

type EventMeta = {
  color: string;
  bg: string;
  fg: string;
  icon: "cash" | "send" | "bell" | "x" | "check" | "page" | "calendar" | "user" | "eye" | "mail" | "message" | "wrench";
};

function fmtCents(c: number) {
  return "$" + (c / 100).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timeOf(value: unknown) {
  if (!value) return 0;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : 0;
}

function fmtDate(value: string) {
  const d = new Date(value);
  return d.toLocaleDateString("en-NZ", { day: "2-digit", month: "short" }) + " - " + d.toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit", hour12: true }).toLowerCase();
}

function eventLabel(type: string) {
  const map: Record<string, string> = {
    quote_sent: "quote sent",
    quote_dispatched: "quote delivered",
    quote_dispatch_failed: "quote not delivered",
    quote_viewed: "quote viewed",
    quote_accepted: "quote accepted",
    quote_declined: "quote declined",
    invoice_sent: "invoice created",
    invoice_dispatched: "invoice sent",
    invoice_email_sent: "invoice emailed",
    invoice_email_failed: "email failed",
    invoice_overdue: "invoice overdue",
    reminder_sent: "reminder sent",
    payment_declined: "payment failed",
    payment_received: "payment received",
    split_share_paid: "split payment received",
    paid_external: "marked paid externally",
    balance_sent: "balance sent",
    job_completed: "job completed",
    schedule_created: "recurring invoice started",
    schedule_paused: "recurring invoice paused",
    schedule_resumed: "recurring invoice resumed",
    schedule_updated: "recurring invoice updated",
    schedule_terminated: "recurring invoice stopped",
    recurring_invoice_generated: "recurring invoice generated",
    whatsapp_status: "whatsapp status",
  };
  return map[type] ?? type.replace(/_/g, " ").toLowerCase();
}

function eventMeta(type: string): EventMeta {
  const t = type.toLowerCase();
  if (t.includes("payment_received") || t.includes("paid_external") || t.includes("split_share_paid")) return { ...EVENT_TONES.green, icon: "cash" };
  if (t.includes("accepted") || t.includes("completed") || t.includes("created") || t.includes("generated")) return { ...EVENT_TONES.green, icon: t.includes("schedule") || t.includes("recurring") ? "calendar" : "check" };
  if (t.includes("failed") || t.includes("declined") || t.includes("overdue") || t.includes("payment_declined")) return { ...EVENT_TONES.red, icon: "x" };
  if (t.includes("reminder")) return { ...EVENT_TONES.amber, icon: "bell" };
  if (t.includes("viewed")) return { ...EVENT_TONES.dark, icon: "eye" };
  if (t.includes("whatsapp")) return { ...EVENT_TONES.dark, icon: "message" };
  if (t.includes("email")) return { ...EVENT_TONES.dark, icon: "mail" };
  if (t.includes("schedule") || t.includes("recurring")) return { ...EVENT_TONES.green, icon: "calendar" };
  if (t.includes("balance") || t.includes("invoice") || t.includes("quote")) return { ...EVENT_TONES.dark, icon: "send" };
  if (t.includes("client")) return { ...EVENT_TONES.dark, icon: "user" };
  return { ...EVENT_TONES.muted, icon: "page" };
}

function eventDetail(event: any) {
  const payload = event.payload ?? {};
  if (payload.channel) return `via ${payload.channel}`;
  if (payload.reason) return String(payload.reason);
  if (payload.frequency) return `${payload.frequency} - ${fmtCents(payload.amountCents ?? 0)}`;
  if (payload.status) return String(payload.status);
  if (payload.share && payload.of) return `share ${payload.share} of ${payload.of}`;
  if (payload.amountCents) return fmtCents(payload.amountCents);
  return "";
}

function EventIcon({ type }: { type: string }) {
  const meta = eventMeta(type);
  const props = { size: 14, color: meta.fg, strokeWidth: 2 };
  switch (meta.icon) {
    case "cash": return <DollarSign {...props} />;
    case "send": return <Send {...props} />;
    case "bell": return <Bell {...props} />;
    case "x": return <AlertTriangle {...props} />;
    case "check": return <Check {...props} />;
    case "calendar": return <CalendarClock {...props} />;
    case "user": return <User {...props} />;
    case "eye": return <Eye {...props} />;
    case "mail": return <Mail {...props} />;
    case "message": return <MessageCircle {...props} />;
    case "wrench": return <Wrench {...props} />;
    default: return <FileText {...props} />;
  }
}

function HeroStatus({ status }: { status: string }) {
  const s = HERO_STATUS[status] ?? HERO_STATUS.upcoming;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, background: s.bg, color: s.fg, fontWeight: 800, fontSize: 9.5, letterSpacing: 0, textTransform: "uppercase" }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: s.dot }} />
      {s.label}
    </div>
  );
}

function HeroField({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 12, padding: "10px 12px", gridColumn: wide ? "1 / -1" : "auto", minWidth: 0 }}>
      <div style={{ fontWeight: 700, fontSize: 8.5, color: C.cream, letterSpacing: 0, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 14, color: C.white, letterSpacing: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 5 }}>{value || "-"}</div>
    </div>
  );
}

function SheetInput({ label, value, onChange, type = "text" }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.panel, letterSpacing: 0, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ width: "100%", padding: "14px 16px", borderRadius: 14, background: C.gray, border: "none", outline: "none", color: C.ink, fontSize: 15, fontWeight: 500, boxSizing: "border-box", fontFamily: "inherit" }}
      />
    </div>
  );
}

function SheetTextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.panel, letterSpacing: 0, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ width: "100%", minHeight: 88, resize: "vertical", padding: "14px 16px", borderRadius: 14, background: C.gray, border: "none", outline: "none", color: C.ink, fontSize: 15, fontWeight: 500, boxSizing: "border-box", fontFamily: "inherit" }}
      />
    </div>
  );
}

function Rail({ color, first, last }: { color: string; first: boolean; last: boolean }) {
  return (
    <div style={{ position: "relative", width: 30, flexShrink: 0, display: "flex", justifyContent: "center" }}>
      <div style={{ position: "absolute", top: first ? 14 : 0, bottom: last ? "calc(100% - 14px)" : 0, width: 2, background: "rgba(4,13,109,0.14)" }} />
      <div style={{ position: "absolute", top: 8, width: 13, height: 13, borderRadius: 999, background: C.white, border: `3px solid ${color}`, boxShadow: "0 0 0 3px rgba(255,255,255,0.9)" }} />
    </div>
  );
}

function EditClientSheet({ initial, onClose, onSave, onArchive, saving, archiving, saveError }: {
  initial: ClientForm;
  onClose: () => void;
  onSave: (data: ClientForm) => void;
  onArchive: () => void;
  saving: boolean;
  archiving: boolean;
  saveError: string | null;
}) {
  const [form, setForm] = useState<ClientForm>(initial);
  const [closing, setClosing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const setText = (key: keyof Omit<ClientForm, "preferredChannel">) => (value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setConfirmArchive(false);
  };

  const contactOk = form.preferredChannel === "email" ? !!form.email.trim() : !!form.phone.trim();
  const valid = !!form.firstName.trim() && !!form.lastName.trim() && !!form.siteAddress.trim() && contactOk;

  const handleClose = () => {
    setClosing(true);
    setTimeout(onClose, 320);
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
        style={{ position: "absolute", inset: 0, background: "rgba(4,13,109,0.55)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", animation: closing ? fadeOut : fadeIn }}
      />

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 430, background: C.cream, borderRadius: "28px 28px 0 0", maxHeight: "92vh", overflowY: "auto", animation: closing ? animOut : animIn }}>
          <div style={{ display: "flex", justifyContent: "center", padding: "14px 0 2px" }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(0,0,0,0.1)" }} />
          </div>

          <div style={{ padding: "12px 24px 52px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
              <span style={{ fontWeight: 700, fontSize: 20, color: C.ink, letterSpacing: 0 }}>edit client</span>
              <button onClick={handleClose} aria-label="Close edit client sheet" style={{ width: 32, height: 32, borderRadius: 999, background: C.gray, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={15} color={C.ink} strokeWidth={2.4} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
              <SheetInput label="first name" value={form.firstName} onChange={setText("firstName")} />
              <SheetInput label="last name" value={form.lastName} onChange={setText("lastName")} />
            </div>
            <SheetInput label="site address" value={form.siteAddress} onChange={setText("siteAddress")} />
            <SheetInput label="email" value={form.email} onChange={setText("email")} type="email" />
            <SheetInput label="phone" value={form.phone} onChange={setText("phone")} type="tel" />

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.panel, letterSpacing: 0, textTransform: "uppercase", marginBottom: 8 }}>send invoice via</div>
              <div style={{ display: "flex", gap: 8 }}>
                {(["email", "whatsapp", "sms"] as const).map((channel) => (
                  <button
                    key={channel}
                    onClick={() => { setForm((current) => ({ ...current, preferredChannel: channel })); setConfirmArchive(false); }}
                    style={{ flex: 1, padding: "13px 0", borderRadius: 14, border: "none", background: form.preferredChannel === channel ? C.ink : C.gray, color: form.preferredChannel === channel ? C.cream : C.ink, fontWeight: 700, fontSize: 12.5, cursor: "pointer", textTransform: "uppercase", letterSpacing: 0, transition: "background 0.18s, color 0.18s" }}
                  >
                    {channel}
                  </button>
                ))}
              </div>
              {!contactOk && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#C71A2A", fontWeight: 600 }}>
                  add {form.preferredChannel === "email" ? "an email address" : "a phone number"} above to send via {form.preferredChannel}
                </div>
              )}
            </div>

            <SheetTextArea label="notes" value={form.notes} onChange={setText("notes")} />

            {saveError && (
              <div style={{ marginBottom: 12, padding: "12px 16px", borderRadius: 14, background: "rgba(255,59,78,0.07)", border: "1px solid rgba(255,59,78,0.18)" }}>
                <p style={{ color: "#C71A2A", fontSize: 13, fontWeight: 600, margin: 0 }}>{saveError}</p>
              </div>
            )}

            <button
              onClick={() => onSave(form)}
              disabled={!valid || saving}
              style={{ width: "100%", padding: "18px 0", borderRadius: 999, background: valid && !saving ? C.ink : C.gray, color: valid && !saving ? C.cream : C.mute, fontWeight: 700, fontSize: 16, border: "none", cursor: valid && !saving ? "pointer" : "default", marginTop: 4 }}
            >
              {saving ? "saving..." : "save changes"}
            </button>

            <button
              onClick={() => confirmArchive ? onArchive() : setConfirmArchive(true)}
              disabled={archiving}
              style={{ width: "100%", padding: "14px 0", borderRadius: 999, background: confirmArchive ? "rgba(255,59,78,0.10)" : "transparent", color: C.red, fontWeight: 700, fontSize: 14, border: "1.5px solid rgba(255,59,78,0.3)", cursor: archiving ? "default" : "pointer", marginTop: 10 }}
            >
              {archiving ? "archiving..." : confirmArchive ? "confirm archive" : "archive client"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const screenStyle: CSSProperties = { background: C.white, minHeight: "100svh", display: "flex", justifyContent: "center" };
const appStyle: CSSProperties = { width: "100%", maxWidth: 430, minHeight: "100svh", background: C.cream, paddingBottom: 130, fontFamily: "'Outfit', system-ui, sans-serif" };

export default function ClientProfile({ clientId: clientIdProp, embedded = false, onClose }: { clientId?: string; embedded?: boolean; onClose?: () => void } = {}) {
  const [, params] = useRoute("/trades/clients/:id");
  const [, setLocation] = useLocation();
  // When embedded in the trades terminal the id comes from a prop (no route), and "back"
  // returns to the terminal in-place rather than routing away from the terminal page.
  const clientId = clientIdProp ?? params?.id ?? "";
  const goBack = () => { if (embedded && onClose) { onClose(); return; } setLocation("/trades/clients"); };
  const queryClient = useQueryClient();
  // Embedded fills (and scrolls within) the terminal screen; standalone is a full page.
  const screenWrap: CSSProperties = embedded ? { ...screenStyle, minHeight: undefined, height: "100%", overflowY: "auto" } : screenStyle;
  const appWrap: CSSProperties = embedded ? { ...appStyle, minHeight: "auto" } : appStyle;

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<ClientForm | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const { data: client, isLoading } = useQuery<any>({
    queryKey: ["/api/trades/clients", clientId],
    queryFn: () => tradesFetch(`/api/trades/clients/${clientId}`).then((response) => response.ok ? response.json() : null),
    enabled: !!clientId,
    retry: false,
  });

  const { data: events = [] } = useQuery<any[]>({
    queryKey: ["/api/trades/clients", clientId, "events"],
    queryFn: () => tradesFetch(`/api/trades/clients/${clientId}/events`).then((response) => response.ok ? response.json() : []),
    enabled: !!clientId,
    staleTime: 30000,
    retry: false,
  });

  const { data: invoices = [] } = useQuery<any[]>({
    queryKey: ["/api/trades/invoices", { clientProfileId: clientId }],
    queryFn: () => tradesFetch(`/api/trades/invoices?clientProfileId=${clientId}`).then((response) => response.ok ? response.json() : []),
    enabled: !!clientId,
    staleTime: 30000,
    retry: false,
  });

  const { data: allQuotes = [] } = useQuery<any[]>({
    queryKey: ["/api/trades/quotes"],
    queryFn: () => tradesFetch("/api/trades/quotes").then((response) => response.ok ? response.json() : []),
    enabled: !!clientId,
    staleTime: 30000,
    retry: false,
  });

  const { data: allSchedules = [] } = useQuery<any[]>({
    queryKey: ["/api/trades/schedules"],
    queryFn: () => tradesFetch("/api/trades/schedules").then((response) => response.ok ? response.json() : []),
    enabled: !!clientId,
    staleTime: 30000,
    retry: false,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ClientForm) => {
      const response = await fetch(`/api/trades/clients/${clientId}`, {
        method: "PUT",
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
      queryClient.invalidateQueries({ queryKey: ["/api/trades/clients", clientId] });
      queryClient.invalidateQueries({ queryKey: ["/api/trades/clients"] });
      setEditError(null);
      setEditing(false);
      setEditForm(null);
    },
    onError: (error) => {
      setEditError(error instanceof Error ? error.message : "Failed to update client");
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/trades/clients/${clientId}/archive`, { method: "POST", headers: tradesHeaders() });
      if (!response.ok) throw new Error("Failed to archive");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trades/clients"] });
      setEditing(false);
      setEditForm(null);
      goBack();
    },
    onError: (error) => {
      setEditError(error instanceof Error ? error.message : "Failed to archive client");
    },
  });

  if (!isLoading && !client) {
    return (
      <div style={screenWrap}>
        <div style={{ ...appWrap, paddingTop: 100, textAlign: "center" }}>
          <p style={{ color: C.mute }}>client not found</p>
          <button onClick={goBack} style={{ marginTop: 16, color: C.ink, background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>back to clients</button>
        </div>
      </div>
    );
  }

  const quotes = allQuotes.filter((quote: any) => quote.clientProfileId === clientId);
  const schedules = allSchedules.filter((schedule: any) => schedule.clientProfileId === clientId);
  const liveInvoices = invoices.filter((invoice: any) => invoice.status !== "voided");
  const latestInvoice = [...liveInvoices].sort((a: any, b: any) => timeOf(b.createdAt ?? b.dueAt) - timeOf(a.createdAt ?? a.dueAt))[0];
  const latestQuote = [...quotes].sort((a: any, b: any) => timeOf(b.createdAt ?? b.sentAt) - timeOf(a.createdAt ?? a.sentAt))[0];
  const activeSchedule = schedules.find((schedule: any) => schedule.status === "active");

  const heroInitials = client ? `${client.firstName?.[0] ?? ""}${client.lastName?.[0] ?? ""}`.toUpperCase() : "";
  const heroName = client ? `${client.firstName} ${client.lastName}` : "";
  const heroAddress = client?.siteAddress ?? "";
  const heroChannel = client?.preferredChannel ?? "";
  const contact = [client?.email, client?.phone].filter(Boolean).join(" / ");

  const heroStatus = latestInvoice
    ? latestInvoice.status === "paid" || latestInvoice.status === "paid_external" ? "paid"
      : latestInvoice.status === "overdue" ? "overdue"
      : latestInvoice.status === "dispatch_failed" ? "failed"
      : LIVE_STATUSES.includes(latestInvoice.status) ? "active"
      : "upcoming"
    : latestQuote?.status === "accepted" ? "accepted"
    : latestQuote ? "quoted"
    : activeSchedule ? "active"
    : "upcoming";

  const activeWork = latestInvoice
    ? `${latestInvoice.kind ?? "invoice"} ${fmtCents(latestInvoice.amountCents ?? 0)}`
    : latestQuote
    ? `quote ${fmtCents(latestQuote.totalCents ?? 0)}`
    : activeSchedule
    ? `${activeSchedule.frequency} ${fmtCents(activeSchedule.amountCents ?? 0)}`
    : "none yet";

  const startEdit = () => {
    if (!client) return;
    setEditError(null);
    setEditForm({
      firstName: client.firstName ?? "",
      lastName: client.lastName ?? "",
      email: client.email ?? "",
      phone: client.phone ?? "",
      siteAddress: client.siteAddress ?? "",
      preferredChannel: (client.preferredChannel === "whatsapp" || client.preferredChannel === "sms") ? client.preferredChannel : "email",
      notes: client.notes ?? "",
    });
    setEditing(true);
  };

  return (
    <div style={screenWrap}>
      <div style={appWrap}>
        <div style={{ height: 56 }} />

        <div className="pt-slide-top" style={{ "--pt-d": "0ms" } as CSSProperties}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 18px 14px" }}>
            <button onClick={goBack} aria-label="Back to clients" style={{ width: 34, height: 34, borderRadius: 999, background: C.gray, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <ChevronLeft size={18} color={C.ink} strokeWidth={2.2} />
            </button>
            <div style={{ fontWeight: 700, fontSize: 11, color: C.ink, letterSpacing: 0, textTransform: "uppercase" }}>client profile</div>
            <button onClick={startEdit} disabled={!client} aria-label="Edit client" style={{ width: 34, height: 34, borderRadius: 999, background: C.gray, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: client ? "pointer" : "default", opacity: client ? 1 : 0.35 }}>
              <Pencil size={15} color={C.ink} strokeWidth={1.9} />
            </button>
          </div>
        </div>

        <div style={{ padding: "0 18px" }}>
          <div className="pt-hero" style={{ background: C.ink, borderRadius: 24, padding: "20px 20px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
              <div style={{ width: 50, height: 50, borderRadius: 999, background: C.panel, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 900, fontSize: 16, color: C.ink, letterSpacing: 0 }}>
                {heroInitials || (isLoading ? "..." : "--")}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 8.5, color: C.cream, letterSpacing: 0, textTransform: "uppercase" }}>primary client</div>
                <div style={{ fontWeight: 700, fontSize: 21, color: C.white, letterSpacing: 0, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{heroName || (isLoading ? "loading client" : "client")}</div>
              </div>
              <HeroStatus status={heroStatus} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 16 }}>
              <HeroField label="site" value={heroAddress} wide />
              <HeroField label="invoice via" value={heroChannel} />
              <HeroField label="active work" value={activeWork} />
              {contact && <HeroField label="contact" value={contact} wide />}
              {client?.notes && <HeroField label="notes" value={client.notes} wide />}
            </div>
          </div>
        </div>

        <div className="pt-bounce" style={{ "--pt-d": "170ms", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px 20px 4px" } as CSSProperties}>
          <div style={{ fontWeight: 700, fontSize: 12, color: C.ink, letterSpacing: 0, textTransform: "uppercase" }}>activity timeline</div>
          <div style={{ fontWeight: 700, fontSize: 11, color: C.mute }}>{events.length}</div>
        </div>

        {!client && isLoading ? (
          <div style={{ padding: "24px 18px", textAlign: "center", color: C.mute, fontSize: 13 }}>loading activity...</div>
        ) : events.length === 0 ? (
          <div className="pt-bounce" style={{ "--pt-d": "215ms", padding: "24px 18px", textAlign: "center", color: C.mute, fontSize: 13 } as CSSProperties}>no activity yet</div>
        ) : (
          <div style={{ padding: "8px 18px 0" }}>
            {events.slice(0, 10).map((event: any, index: number) => {
              const meta = eventMeta(event.eventType);
              const first = index === 0;
              const last = index === Math.min(events.length, 10) - 1;
              const isPaid = ["payment_received", "paid_external", "split_share_paid"].includes(event.eventType);
              const detail = eventDetail(event);
              const amountCents = event.payload?.amountCents ?? (isPaid && first ? latestInvoice?.amountCents : null);

              return (
                <div key={event.id ?? `${event.eventType}-${event.createdAt}-${index}`} className="pt-bounce" style={{ "--pt-d": `${215 + index * 45}ms`, display: "flex", gap: 10, minHeight: isPaid && first ? 0 : 64 } as CSSProperties}>
                  <Rail color={meta.color} first={first} last={last} />
                  <div style={{ flex: 1, paddingBottom: 14, paddingTop: 2 }}>
                    {isPaid && first && amountCents ? (
                      <div style={{ background: C.panel, borderRadius: 16, padding: "14px 15px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 16, color: C.ink }}>{eventLabel(event.eventType)}</div>
                            <div style={{ fontWeight: 600, fontSize: 12, color: "rgba(4,13,109,0.7)", marginTop: 3 }}>{fmtCents(amountCents)} received</div>
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 11, color: "rgba(4,13,109,0.7)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtDate(event.createdAt)}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
                          <div style={{ fontWeight: 900, fontSize: 24, color: C.ink, letterSpacing: 0, fontVariantNumeric: "tabular-nums" }}>{fmtCents(amountCents)}</div>
                          <div style={{ width: 30, height: 30, borderRadius: 999, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <CheckCircle2 size={17} color={C.panel} strokeWidth={2.4} />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                            <div style={{ width: 24, height: 24, borderRadius: 999, background: meta.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <EventIcon type={event.eventType} />
                            </div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{eventLabel(event.eventType)}</div>
                          </div>
                          <div style={{ fontWeight: 600, fontSize: 11, color: C.mute, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtDate(event.createdAt)}</div>
                        </div>
                        {detail && <div style={{ fontWeight: 500, fontSize: 11.5, color: C.mute, marginTop: 3 }}>{detail}</div>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {editing && editForm && (
          <EditClientSheet
            initial={editForm}
            onClose={() => { setEditing(false); setEditForm(null); setEditError(null); }}
            onSave={(data) => { setEditError(null); updateMutation.mutate(data); }}
            onArchive={() => archiveMutation.mutate()}
            saving={updateMutation.isPending}
            archiving={archiveMutation.isPending}
            saveError={editError}
          />
        )}
      </div>
    </div>
  );
}
