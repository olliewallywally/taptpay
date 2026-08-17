import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePropertyInvoices, usePropertyTenants, PROPERTY_KEYS } from "@/lib/property-data";
import { propHeaders } from "@/lib/property-api";
import { notifyIfBillingCardRequired } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { fmtNZD } from "@/lib/report-utils";
import {
  DesktopPageScaffold,
  type DesktopRoutePageProps,
} from "../DesktopPageScaffold";
import {
  DESKTOP_KEYPAD_KEYS,
  DesktopKeypadButton,
  desktopKeypadCents,
  desktopKeypadReducer,
  formatDesktopKeypadMoney,
  type DesktopKeypadKey,
} from "../desktop-keypad";
import {
  PROPERTY_STACK_FILTERS,
  buildPropertyTerminalModel,
  type PropertyStackFilter,
} from "../data/property-terminal-model";

/* ── palette ── */
const ACCENT = "#5E9EFF";
const ACCENT_SOFT = "#7FB2FF";
const NAV_DIM = "#4A86F0";
const ACTIVE = "#66A9FF";
const TEXT_SOFT = "#F4F6FF";
const NAVY = "#000F3F";
const INK = "#12162E";
const KP_INK = "#C6CFE2";
const VIOLET = "#9DBCFF";
const GREEN = "#35D07F";
const RED = "#F0656C";
const AMBER = "#F0A34E";

type Mode = "tenant" | "request" | "keypad" | "bill" | "paid";

/* Charge types and frequency handling mirror property-terminal.tsx exactly. */
const CHARGE_TYPES = [
  { id: "utilities", label: "water / utilities", preset: "Water / utilities" },
  { id: "late_fee", label: "late fee", preset: "Late fee" },
  { id: "cleaning", label: "cleaning", preset: "Cleaning" },
  { id: "damages", label: "damages", preset: "Damages" },
  { id: "other", label: "other", preset: "" },
];

/* A chip may replace the description only while it still holds a preset — a
   description the merchant typed is theirs (the phone's rule, `View:580-584`). */
const CHARGE_PRESETS = CHARGE_TYPES.map((c) => c.preset).filter(Boolean);
const INITIAL_CHARGE_TYPE = "utilities";
const INITIAL_DESCRIPTION =
  CHARGE_TYPES.find((c) => c.id === INITIAL_CHARGE_TYPE)!.preset;

/* Matching the phone's DUE_OPTIONS (`View:70-74`). */
const DUE_OPTIONS = [
  { days: 0, label: "on receipt" },
  { days: 7, label: "in 7 days" },
  { days: 14, label: "in 14 days" },
];
const INITIAL_DUE_DAYS = 7;
const MAX_DOC_BYTES = 20 * 1024 * 1024;

const FREQUENCIES = ["once", "weekly", "fortnightly", "monthly"] as const;
type Frequency = (typeof FREQUENCIES)[number];
const FREQ_LABEL: Record<Frequency, string> = {
  once: "one-off",
  weekly: "per week",
  fortnightly: "per fortnight",
  monthly: "per month",
};

function addInterval(from: Date, frequency: string): Date {
  const d = new Date(from);
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else if (frequency === "fortnightly") d.setDate(d.getDate() + 14);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

const initialsOf = (t: any) =>
  `${t?.firstName?.[0] ?? ""}${t?.lastName?.[0] ?? ""}`.toUpperCase() || "?";
const fullNameOf = (t: any) => `${t?.firstName ?? ""} ${t?.lastName ?? ""}`.trim() || "tenant";
const whole = (cents: number) => "$" + Math.round(cents / 100).toLocaleString("en-NZ");

/* Breathing room between the row popover's foot and the canvas floor. */
const PT_ROW_MENU_GAP = 8;

/* Deep links, read once at mount the way property-clients (`?client=`) and
   trades-terminal (`?quick=1`) do. The phone's 800ms replaceState strip is not
   ported: that hack exists because its route transition can discard the first
   mount, and 2b/3b already accept that a refresh re-applies the link. */
function entryParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function entryMode(params: URLSearchParams): Mode {
  return params.get("mode") === "expense" ? "bill" : "request";
}

function entryFilter(params: URLSearchParams): PropertyStackFilter {
  if (params.get("mode") === "reminder") return "overdue";
  const stack = params.get("stack");
  return (PROPERTY_STACK_FILTERS as readonly string[]).includes(stack ?? "")
    ? (stack as PropertyStackFilter)
    : "all";
}

const STATUS_DOT: Record<string, string> = {
  overdue: AMBER,
  sent: ACCENT,
  paid: GREEN,
  failed: RED,
};

export default function DesktopPropertyTerminal(props: DesktopRoutePageProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>(() => entryMode(entryParams()));
  const [tenantId, setTenantId] = useState<string | null>(
    () => entryParams().get("client"),
  );
  const [remindMode] = useState(() => entryParams().get("mode") === "reminder");
  const [amountCents, setAmountCents] = useState(0);
  const [kpVal, setKpVal] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("once");
  const [chargeType, setChargeType] = useState(INITIAL_CHARGE_TYPE);
  const [description, setDescription] = useState(INITIAL_DESCRIPTION);
  const [dueDays, setDueDays] = useState(INITIAL_DUE_DAYS);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [docName, setDocName] = useState("");
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [search, setSearch] = useState("");
  const [tenantSearch, setTenantSearch] = useState("");
  const [filter, setFilter] = useState<PropertyStackFilter>(() =>
    entryFilter(entryParams()),
  );
  const [reqFlash, setReqFlash] = useState(false);
  const [billFlash, setBillFlash] = useState(false);
  /* The row action popover: which invoice, where it sits in `.pt-stack`, and
     whether the destructive branch has been asked for. */
  const [rowMenu, setRowMenu] = useState<{ id: string; top: number } | null>(null);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const rowsRef = useRef<HTMLDivElement | null>(null);
  const stackRef = useRef<HTMLDivElement | null>(null);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);

  const tenantsQuery = usePropertyTenants();
  const invoicesQuery = usePropertyInvoices();
  const tenants = (tenantsQuery.data ?? []).filter((t: any) => t.status !== "archived");
  const invoices = invoicesQuery.data ?? [];

  const tenant = tenants.find((t: any) => t.id === tenantId) ?? null;
  const channel = (tenant?.preferredChannel ?? "email") as string;
  const channelContact = channel === "email" ? tenant?.email : tenant?.phone;

  /* ── left column figures + request list ── */
  const model = useMemo(
    () => buildPropertyTerminalModel(invoices, tenants),
    [invoices, tenants],
  );

  const q = search.trim().toLowerCase();
  const stackRows = model.rows
    .filter((r) => filter === "all" || r.bucket === filter)
    .filter((r) => r.name.toLowerCase().includes(q));

  const tenantCards = tenants.filter((t: any) =>
    `${fullNameOf(t)} ${t.propertyAddress ?? ""}`
      .toLowerCase()
      .includes(tenantSearch.trim().toLowerCase()),
  );

  const nextUnpaidFor = (id: string) =>
    invoices
      .filter(
        (i: any) =>
          i.tenantProfileId === id &&
          i.status !== "voided" &&
          i.status !== "paid" &&
          i.status !== "paid_external",
      )
      .sort((a: any, b: any) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())[0];

  /* ── mutations: same endpoints and payloads as the mobile terminal ── */
  const sendRequest = useMutation({
    mutationFn: async () => {
      const now = new Date();
      const due = new Date(now);
      due.setDate(due.getDate() + 7);
      const res = await fetch("/api/property/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...propHeaders() },
        body: JSON.stringify({
          tenantProfileId: tenantId,
          amountCents,
          deliveryChannel: channel,
          dueAt: due.toISOString(),
          splitEnabled: false,
        }),
      });
      if (!res.ok) {
        notifyIfBillingCardRequired(res);
        const message = await res
          .json()
          .then((d: any) => d.message)
          .catch(() => "Failed to send");
        throw new Error(message);
      }
      const invoice = await res.json();
      /* Recurring: first request goes now, automation starts one interval on. */
      if (frequency !== "once") {
        const startDate = addInterval(now, frequency);
        const sr = await fetch(`/api/property/tenants/${tenantId}/schedules`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...propHeaders() },
          body: JSON.stringify({
            amountCents,
            frequency,
            deliveryChannel: channel,
            startDate: startDate.toISOString(),
          }),
        });
        if (!sr.ok) {
          notifyIfBillingCardRequired(sr);
          throw new Error("Sent, but failed to set up automation");
        }
      }
      return invoice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROPERTY_KEYS.invoices as any });
      if (frequency !== "once") {
        queryClient.invalidateQueries({ queryKey: PROPERTY_KEYS.schedules as any });
      }
      setReqFlash(true);
      setTimeout(() => setReqFlash(false), 1600);
      setFrequency("once");
      /* Zeroing the amount is what stops a second click issuing a second
         invoice. The tenant stays selected — that is the useful desktop state,
         and the 1.6s "sent ✓" flash covers the transition. */
      setAmountCents(0);
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to send", variant: "destructive" }),
  });

  const sendBill = useMutation({
    mutationFn: async () => {
      const due = new Date();
      due.setDate(due.getDate() + dueDays);
      const res = await fetch("/api/property/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...propHeaders() },
        body: JSON.stringify({
          tenantProfileId: tenantId,
          amountCents,
          deliveryChannel: channel,
          dueAt: due.toISOString(),
          splitEnabled: false,
          kind: "charge",
          chargeType,
          description,
          ...(docUrl ? { documentUrl: docUrl, documentName: docName } : null),
        }),
      });
      if (!res.ok) {
        notifyIfBillingCardRequired(res);
        const message = await res
          .json()
          .then((d: any) => d.message)
          .catch(() => "Failed to send bill");
        throw new Error(message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROPERTY_KEYS.invoices as any });
      setBillFlash(true);
      setTimeout(() => setBillFlash(false), 1600);
      setAmountCents(0);
      setChargeType(INITIAL_CHARGE_TYPE);
      setDescription(INITIAL_DESCRIPTION);
      setDueDays(INITIAL_DUE_DAYS);
      clearDoc();
    },
    onError: (e: any) =>
      toast({ title: e?.message || "Failed to send bill", variant: "destructive" }),
  });

  const markPaid = useMutation({
    mutationFn: async (invoiceId: string) => {
      const res = await fetch(`/api/property/invoices/${invoiceId}/mark-paid-external`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...propHeaders() },
        body: JSON.stringify({ externalPaymentReference: null }),
      });
      if (!res.ok) throw new Error("Failed to mark");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROPERTY_KEYS.invoices as any });
      toast({ title: "Marked as received" });
    },
    onError: () => toast({ title: "Failed to mark as paid", variant: "destructive" }),
  });

  /* Both row-action mutations call notifyIfBillingCardRequired: the endpoints sit
     behind requireBillingCard, and a silent 402 on a resend is invisible
     otherwise. The phone omits this; the desktop send paths already do it. */
  const resendOne = useMutation({
    mutationFn: async (invoiceId: string) => {
      const res = await fetch(`/api/property/invoices/${invoiceId}/resend`, {
        method: "POST",
        headers: propHeaders(),
      });
      if (!res.ok) {
        notifyIfBillingCardRequired(res);
        throw new Error("Failed to resend");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROPERTY_KEYS.invoices as any });
      toast({ title: "Link resent" });
    },
    onError: () => toast({ title: "Could not resend link", variant: "destructive" }),
  });

  const voidInvoice = useMutation({
    mutationFn: async (invoiceId: string) => {
      const res = await fetch(`/api/property/invoices/${invoiceId}/void`, {
        method: "POST",
        headers: propHeaders(),
      });
      if (!res.ok) {
        notifyIfBillingCardRequired(res);
        const message = await res
          .json()
          .then((d: any) => d.message)
          .catch(() => "Failed to cancel");
        throw new Error(message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROPERTY_KEYS.invoices as any });
      toast({ title: "Invoice cancelled" });
    },
    onError: (e: any) =>
      toast({ title: e?.message || "Could not cancel invoice", variant: "destructive" }),
  });

  /* ── row action popover ── */
  const closeRowMenu = () => {
    setRowMenu(null);
    setConfirmVoid(false);
  };

  /* `.pt-rows` scrolls, so the popover cannot live inside it. It renders as a
     child of `.pt-stack` — the row's offsetParent once that is relative — and
     `offsetTop` is pre-scale, so it needs no division by the canvas scale. */
  const toggleRowMenu = (id: string, el: HTMLElement) => {
    if (rowMenu?.id === id) return closeRowMenu();
    setConfirmVoid(false);
    setRowMenu({ id, top: el.offsetTop - (rowsRef.current?.scrollTop ?? 0) });
  };

  /* The two-step cancel makes the popover taller after it has opened, so its
     foot is re-clamped from the measured height rather than an estimate —
     nothing may cross the canvas floor. */
  useLayoutEffect(() => {
    const menu = rowMenuRef.current;
    const stack = stackRef.current;
    if (!menu || !stack || !rowMenu) return;
    const ceiling = Math.max(0, stack.clientHeight - menu.offsetHeight - PT_ROW_MENU_GAP);
    const clamped = Math.max(0, Math.min(rowMenu.top, ceiling));
    if (clamped !== rowMenu.top) {
      setRowMenu((m) => (m && m.id === rowMenu.id ? { ...m, top: clamped } : m));
    }
  }, [rowMenu, confirmVoid]);

  const menuInvoice = rowMenu
    ? (invoices.find((i: any) => i.id === rowMenu.id) ?? null)
    : null;
  const menuRow = rowMenu ? (model.rows.find((r) => r.id === rowMenu.id) ?? null) : null;
  const menuBusy = resendOne.isPending || voidInvoice.isPending || markPaid.isPending;

  /* The phone's exact rule for showing the inline remind affordance. */
  const showRemind = remindMode || filter === "overdue";
  const remindBusyId = resendOne.isPending ? (resendOne.variables as string) : null;

  /* "edit amount & resend" — the desktop equivalent of the phone's
     openEditResend: preload the request panel rather than resending blind. */
  const editAndResend = () => {
    if (!menuInvoice) return;
    setTenantId(menuInvoice.tenantProfileId);
    setAmountCents(menuInvoice.amountCents ?? 0);
    closeRowMenu();
    setMode("request");
  };

  /* ── attached invoice document ── */
  const clearDoc = () => {
    setDocUrl(null);
    setDocName("");
  };

  /* Uploads on pick, so the merchant sees the attachment land before sending.
     The 20MB guard is the phone's (`controller:380`). */
  const uploadDoc = async (file: File) => {
    if (file.size > MAX_DOC_BYTES) {
      toast({ title: "File must be under 20MB", variant: "destructive" });
      return;
    }
    setUploadingDoc(true);
    try {
      const body = new FormData();
      body.append("document", file);
      const res = await fetch("/api/property/invoices/document", {
        method: "POST",
        headers: propHeaders(),
        body,
      });
      if (!res.ok) {
        notifyIfBillingCardRequired(res);
        const message = await res
          .json()
          .then((d: any) => d.message)
          .catch(() => "Upload failed");
        throw new Error(message);
      }
      const { documentUrl, documentName } = await res.json();
      setDocUrl(documentUrl);
      setDocName(documentName || file.name);
    } catch (e: any) {
      toast({ title: e?.message || "Failed to upload document", variant: "destructive" });
    } finally {
      setUploadingDoc(false);
    }
  };

  /* ── actions ── */
  const requireTenant = () => {
    if (!tenant) {
      toast({ title: "Pick a tenant first", variant: "destructive" });
      setMode("tenant");
      return false;
    }
    return true;
  };

  const doSendRequest = () => {
    if (!requireTenant()) return;
    if (amountCents <= 0) {
      toast({ title: "Enter an amount first", variant: "destructive" });
      setMode("keypad");
      return;
    }
    if (!channelContact) {
      toast({
        title: `No ${channel} on file for ${fullNameOf(tenant)}`,
        description: "Add one on their profile before sending.",
        variant: "destructive",
      });
      return;
    }
    sendRequest.mutate();
  };

  const doSendBill = () => {
    if (!requireTenant()) return;
    if (amountCents <= 0) {
      toast({ title: "Enter an amount first", variant: "destructive" });
      setMode("keypad");
      return;
    }
    if (!description.trim()) {
      toast({ title: "Describe what the bill is for", variant: "destructive" });
      return;
    }
    sendBill.mutate();
  };

  const pressKey = (key: DesktopKeypadKey) =>
    setKpVal((value) => desktopKeypadReducer(value, key));

  const kpCents = desktopKeypadCents(kpVal);

  const openKeypad = () => {
    setKpVal("");
    setMode("keypad");
  };

  const railBtn = (m: Mode, big: boolean, path: JSX.Element, label: string) => {
    const on = mode === m;
    return (
      <button
        type="button"
        className={big ? "pt-rail-btn pt-rail-big" : "pt-rail-btn"}
        aria-label={label}
        aria-pressed={on}
        style={big ? undefined : { background: on ? ACTIVE : "transparent" }}
        onClick={() => (big ? openKeypad() : setMode(m))}
      >
        <svg
          width={big ? 24 : 19}
          height={big ? 24 : 19}
          viewBox="0 0 24 24"
          fill="none"
          stroke={big ? NAVY : on ? NAVY : ACCENT_SOFT}
          strokeWidth={big ? 2.4 : 1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {path}
        </svg>
      </button>
    );
  };

  const chip = (on: boolean, borderWidth = 1) => ({
    border: on
      ? `${borderWidth}px solid transparent`
      : `${borderWidth}px solid rgba(94,158,255,0.5)`,
    background: on ? ACTIVE : "transparent",
    color: on ? NAVY : ACCENT_SOFT,
    fontWeight: on ? 700 : 600,
  });

  const reqLabel = reqFlash
    ? "request sent ✓"
    : sendRequest.isPending
      ? "sending…"
      : "send rent request";
  const billLabel = billFlash ? "bill sent ✓" : sendBill.isPending ? "sending…" : "send bill";

  return (
    <DesktopPageScaffold {...props} vertical="property" page="terminal" showScope={false}>
      <style>{PT_CSS}</style>
      <div className="pt-body">
        {/* ── LEFT ── */}
        <div className="pt-left dt-cascade">
          <div>
            <button type="button" className="pt-scope" aria-label="all properties scope" aria-haspopup="listbox">
              <span>all properties</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>
          </div>

          <div className="pt-hero-row">
            <span className="pt-hero">
              {invoicesQuery.isLoading ? "—" : whole(model.outstandingRent)}
            </span>
          </div>
          <span className="pt-hero-sub">outstanding rent</span>
          <span className="pt-hero pt-hero-dim">
            {invoicesQuery.isLoading ? "—" : whole(model.outstandingExpenses)}
          </span>
          <span className="pt-hero-sub pt-hero-sub-dim">outstanding expenses</span>

          <div className="pt-stack" ref={stackRef}>
            <div className="pt-stack-head">
              <span className="pt-stack-title">
                <span>rent request</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 14 6-6 6 6" /></svg>
              </span>
              <div className="pt-stack-search">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.8-3.8" /></svg>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="search tenants"
                  aria-label="search requests"
                />
              </div>
            </div>

            <div className="pt-chips">
              {PROPERTY_STACK_FILTERS.map((f) => (
                <button key={f} type="button" className="pt-chip" style={chip(f === filter)} onClick={() => setFilter(f)}>
                  {f}
                </button>
              ))}
            </div>

            <div className="pt-rows" ref={rowsRef}>
              {invoicesQuery.isLoading ? (
                <div className="pt-empty">loading…</div>
              ) : stackRows.length === 0 ? (
                <div className="pt-empty">no requests here</div>
              ) : (
                stackRows.map((r) => (
                  <div key={r.id} className="pt-row-wrap">
                  <button
                    type="button"
                    className="pt-row"
                    aria-haspopup="menu"
                    aria-expanded={rowMenu?.id === r.id}
                    aria-label={`actions for ${r.name}, ${r.label}`}
                    onClick={(e) => toggleRowMenu(r.id, e.currentTarget)}
                  >
                    <span className="pt-avatar">{r.initials}</span>
                    <span className="pt-row-mid">
                      <span className="pt-row-name">{r.name}</span>
                      <span className="pt-row-status">
                        <span
                          className="pt-dot"
                          style={{
                            background: STATUS_DOT[r.bucket],
                            ...(r.awaiting ? { opacity: 0.5 } : null),
                          }}
                        />
                        {r.label}
                      </span>
                    </span>
                    <span className="pt-row-amt">{fmtNZD(r.amountCents)}</span>
                  </button>
                  {showRemind && r.bucket === "overdue" && (
                    <button
                      type="button"
                      className="pt-remind"
                      aria-label={`remind ${r.name}`}
                      disabled={remindBusyId === r.id}
                      onClick={() => resendOne.mutate(r.id)}
                    >
                      {remindBusyId === r.id ? "…" : "remind"}
                    </button>
                  )}
                  </div>
                ))
              )}
            </div>

            {rowMenu && menuRow && (
              <div
                ref={rowMenuRef}
                className="pt-row-menu"
                role="menu"
                aria-label={`actions for ${menuRow.name}`}
                style={{ top: rowMenu.top }}
                onKeyDown={(e) => e.key === "Escape" && closeRowMenu()}
              >
                <div className="pt-row-menu-head">
                  {menuRow.name} · {fmtNZD(menuRow.amountCents)}
                </div>
                {menuRow.bucket === "paid" ? (
                  <div className="pt-row-menu-note">
                    this {menuInvoice?.kind === "charge" ? "charge" : "invoice"} is already
                    settled
                  </div>
                ) : confirmVoid ? (
                  <>
                    <div className="pt-row-menu-warn">
                      {"cancel this invoice? the tenant can no longer pay it, and this can't be undone."}
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      className="pt-row-opt pt-row-opt-danger"
                      disabled={menuBusy}
                      onClick={() => {
                        voidInvoice.mutate(menuRow.id);
                        closeRowMenu();
                      }}
                    >
                      yes, cancel it
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="pt-row-opt"
                      onClick={() => setConfirmVoid(false)}
                    >
                      back
                    </button>
                  </>
                ) : (
                  <>
                    {menuInvoice?.kind === "charge" ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="pt-row-opt"
                        disabled={menuBusy}
                        onClick={() => {
                          resendOne.mutate(menuRow.id);
                          closeRowMenu();
                        }}
                      >
                        resend link
                      </button>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        className="pt-row-opt"
                        disabled={menuBusy}
                        onClick={editAndResend}
                      >
                        edit amount &amp; resend
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      className="pt-row-opt"
                      disabled={menuBusy}
                      onClick={() => {
                        markPaid.mutate(menuRow.id);
                        closeRowMenu();
                      }}
                    >
                      mark received
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="pt-row-opt pt-row-opt-danger"
                      disabled={menuBusy}
                      onClick={() => setConfirmVoid(true)}
                    >
                      cancel invoice
                    </button>
                  </>
                )}
                <button type="button" role="menuitem" className="pt-row-opt" onClick={closeRowMenu}>
                  close
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── CENTER RAIL ── */}
        <div className="pt-rail-slot">
          <div className="pt-rail dt-rise" data-tutorial-id="property-terminal-tools">
            {railBtn("tenant", false, (<><circle cx="12" cy="8" r="3.4" /><path d="M5.5 19.5c1-3.2 3.4-4.8 6.5-4.8s5.5 1.6 6.5 4.8" /></>), "select tenant")}
            {railBtn("request", false, (<><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></>), "rent request")}
            {railBtn("keypad", true, (<path d="M12 5v14M5 12h14" />), "keypad")}
            {railBtn("bill", false, (<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9.5 8h5M9.5 12h5" /></>), "send bill")}
            {railBtn("paid", false, (<><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m9 12 2.2 2.2L15.5 10" /></>), "mark as paid")}
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="pt-panel dt-rise">
          {mode === "request" && (
            <>
              <div className="pt-mode pt-req-top" data-tutorial-id="property-terminal-request">
                <div className="pt-amt-row">
                  <span className="pt-amt">{fmtNZD(amountCents)}</span>
                  <span className="pt-freq-label">{FREQ_LABEL[frequency]}</span>
                </div>
                <div className="pt-tenant-name">{tenant ? fullNameOf(tenant) : "no tenant selected"}</div>
                <div className="pt-tenant-sub">
                  {tenant ? tenant.propertyAddress : "pick a tenant from the rail"}
                </div>
              </div>

              <div className="pt-req-lower">
                <div className="pt-field-row">
                  <span className="pt-field-strong">{fmtNZD(amountCents)}</span>
                  <span className="pt-field-div">|</span>
                  <span className="pt-field-soft">{FREQ_LABEL[frequency]}</span>
                  <button type="button" className="pt-edit" onClick={openKeypad}>edit&gt;</button>
                </div>

                <div className="pt-field-row">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 4H4v12h4v4l5-4h7z" /></svg>
                  <span className="pt-send-via">
                    <span className="pt-send-cap">sending via {channel}</span>
                    <span className="pt-send-to">{channelContact || "no contact on file"}</span>
                  </span>
                </div>

                <div className="pt-freq-chips">
                  {FREQUENCIES.map((f) => (
                    <button key={f} type="button" className="pt-freq-chip" style={chip(f === frequency, 1.5)} onClick={() => setFrequency(f)}>
                      {f}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="pt-send-btn"
                  data-tutorial-id="property-terminal-send"
                  aria-label="send rent request"
                  disabled={sendRequest.isPending}
                  style={reqFlash ? { borderColor: GREEN, color: GREEN } : undefined}
                  onClick={doSendRequest}
                >
                  {reqLabel}
                </button>
              </div>
            </>
          )}

          {mode === "tenant" && (
            <div className="pt-mode pt-tenants">
              <div className="pt-mode-head">Select Tenant</div>
              <div className="pt-tenant-search">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.8-3.8" /></svg>
                <input
                  value={tenantSearch}
                  onChange={(e) => setTenantSearch(e.target.value)}
                  placeholder="search tenants"
                  aria-label="search tenants"
                />
              </div>
              <div className="pt-tenant-cards">
                {tenantsQuery.isLoading ? (
                  <div className="pt-empty">loading tenants…</div>
                ) : tenantCards.length === 0 ? (
                  <div className="pt-empty">no tenants match</div>
                ) : (
                  tenantCards.map((t: any) => {
                    const next = nextUnpaidFor(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className="pt-tenant-card"
                        aria-pressed={t.id === tenantId}
                        style={
                          t.id === tenantId
                            ? { borderColor: ACTIVE, background: "rgba(102,169,255,0.16)" }
                            : undefined
                        }
                        onClick={() => {
                          setTenantId(t.id);
                          if (next?.amountCents) setAmountCents(next.amountCents);
                          setMode("request");
                        }}
                      >
                        <span className="pt-tc-avatar">{initialsOf(t)}</span>
                        <span className="pt-tc-mid">
                          <span className="pt-tc-name">{fullNameOf(t)}</span>
                          <span className="pt-tc-sub">{t.propertyAddress}</span>
                        </span>
                        <span className="pt-tc-right">
                          <span className="pt-tc-amt">{next ? fmtNZD(next.amountCents ?? 0) : "—"}</span>
                          <span className="pt-tc-cap">{next ? "due" : "nothing due"}</span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {mode === "keypad" && (
            <div className="pt-mode pt-keypad">
              <div className="pt-kp-head">
                <button
                  type="button"
                  className="pt-kp-circle"
                  aria-label="cancel keypad"
                  onClick={() => {
                    setKpVal("");
                    setMode("request");
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
                <button
                  type="button"
                  className="pt-kp-circle"
                  aria-label="confirm amount"
                  aria-disabled={kpCents <= 0}
                  style={kpCents <= 0 ? { opacity: 0.45, cursor: "default" } : undefined}
                  onClick={() => {
                    /* Confirming an empty keypad used to set the amount to $0
                       and drop the merchant back into the request panel. */
                    if (kpCents <= 0) return;
                    setAmountCents(kpCents);
                    setKpVal("");
                    setMode("request");
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L19 8" /></svg>
                </button>
              </div>
              <div className="pt-kp-amt">{formatDesktopKeypadMoney(kpVal)}</div>
              <div className="pt-kp-who">
                {tenant ? `${fullNameOf(tenant)} — ${tenant.propertyAddress}` : "no tenant selected"}
              </div>
              <div className="pt-kp-grid">
                {DESKTOP_KEYPAD_KEYS.map((k) => {
                  const fill = k !== "." && k !== "<";
                  return (
                    <DesktopKeypadButton
                      key={k}
                      keyValue={k}
                      className="pt-kp-key"
                      style={{
                        background: fill ? ACTIVE : "transparent",
                        border: fill ? "none" : `1.5px solid ${ACCENT}`,
                        color: fill ? "#FFFFFF" : VIOLET,
                        boxShadow: fill ? "0 14px 22px rgba(0,6,25,0.45)" : "none",
                      }}
                      onPress={pressKey}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {mode === "bill" && (
            <div className="pt-mode pt-bill">
              <div className="pt-amt-row">
                <span className="pt-bill-amt">{fmtNZD(amountCents)}</span>
                <button type="button" className="pt-edit pt-edit-inline" onClick={openKeypad}>edit&gt;</button>
              </div>
              <div className="pt-bill-name">{tenant ? fullNameOf(tenant) : "no tenant selected"}</div>
              <div className="pt-bill-sub">
                {tenant ? tenant.propertyAddress : "pick a tenant from the rail"}
              </div>

              <div className="pt-bill-label">WHAT FOR</div>
              <div className="pt-bill-chips">
                {CHARGE_TYPES.map((c) => {
                  const on = c.id === chargeType;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className="pt-bill-chip"
                      style={{
                        background: on ? ACTIVE : "rgba(94,158,255,0.12)",
                        color: on ? NAVY : ACCENT_SOFT,
                        fontWeight: on ? 700 : 600,
                      }}
                      onClick={() => {
                        setChargeType(c.id);
                        setDescription((d) =>
                          !d.trim() || CHARGE_PRESETS.includes(d) ? c.preset : d,
                        );
                      }}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>

              <div className="pt-bill-label">DESCRIPTION</div>
              <input
                className="pt-bill-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="what is this bill for?"
                aria-label="bill description"
              />

              <div className="pt-bill-label">DUE</div>
              <div className="pt-bill-due">
                {DUE_OPTIONS.map((d) => (
                  <button
                    key={d.days}
                    type="button"
                    className="pt-freq-chip"
                    style={chip(d.days === dueDays, 1.5)}
                    onClick={() => setDueDays(d.days)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              <div className="pt-bill-label">SUPPORTING INVOICE</div>
              {docUrl ? (
                <div className="pt-bill-attach pt-bill-attached">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
                  <span className="pt-bill-doc-name">{docName}</span>
                  <button type="button" className="pt-bill-doc-remove" onClick={clearDoc}>
                    remove
                  </button>
                </div>
              ) : (
                <label
                  className="pt-bill-attach"
                  style={uploadingDoc ? { opacity: 0.6 } : undefined}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17V5" /><path d="m6.5 10.5 5.5-5.5 5.5 5.5" /><path d="M5 19h14" /></svg>
                  <span>{uploadingDoc ? "uploading…" : "attach invoice (PDF/image)"}</span>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    aria-label="attach invoice"
                    disabled={uploadingDoc}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      /* Clear the input so re-picking the same file re-fires. */
                      e.target.value = "";
                      if (file) void uploadDoc(file);
                    }}
                  />
                </label>
              )}

              <button
                type="button"
                className="pt-send-btn pt-bill-send"
                aria-label="send bill"
                disabled={sendBill.isPending}
                style={billFlash ? { borderColor: GREEN, color: GREEN } : undefined}
                onClick={doSendBill}
              >
                {billLabel}
              </button>
            </div>
          )}

          {mode === "paid" && (
            <div className="pt-mode pt-paid">
              <div className="pt-mode-head">Mark as paid</div>
              <div className="pt-mode-sub">
                record a payment that arrived outside TaptPay — the tenant stops being chased
              </div>
              <div className="pt-paid-rows">
                {model.rows.filter((r) => r.bucket !== "paid").length === 0 ? (
                  <div className="pt-empty">nothing outstanding</div>
                ) : (
                  model.rows
                    .filter((r) => r.bucket !== "paid")
                    .map((r) => (
                      <div key={r.id} className="pt-paid-row">
                        <span className="pt-paid-mid">
                          <span className="pt-row-name">{r.name}</span>
                          <span className="pt-row-status">{r.label}</span>
                        </span>
                        <span className="pt-row-amt">{fmtNZD(r.amountCents)}</span>
                        <button
                          type="button"
                          className="pt-paid-btn"
                          aria-label={`mark ${r.name} paid`}
                          disabled={markPaid.isPending}
                          onClick={() => markPaid.mutate(r.id)}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L19 8" /></svg>
                        </button>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </DesktopPageScaffold>
  );
}

const PT_CSS = `
.pt-body { position:relative; display:flex; height:100%; box-sizing:border-box; padding:26px 46px 0 52px; }

/* ── left ── */
/* Page-entry cascade: the left column's six blocks run steps 0–5, then the
   rail (6) and the right panel (7) complete the sweep left-to-right. */
.pt-left { flex:0 0 420px; display:flex; flex-direction:column; }
.pt-scope { display:inline-flex; align-items:center; gap:9px; padding:10px 20px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); background:transparent; font-weight:400; font-size:13.5px; color:${ACCENT_SOFT}; cursor:pointer; transition:background .18s ease; }
.pt-scope:hover { background:rgba(94,158,255,0.08); }
.pt-hero-row { margin-top:22px; display:flex; align-items:flex-start; gap:14px; }
.pt-hero { font-family:'Outfit',sans-serif; font-weight:700; font-size:84px; line-height:0.92; letter-spacing:-0.015em; color:${ACCENT}; font-variant-numeric:tabular-nums; }
.pt-hero-sub { margin-top:24px; font-weight:300; font-size:17px; color:${NAV_DIM}; }
.pt-hero-dim { margin-top:36px; font-size:56px; opacity:0.61; }
.pt-hero-sub-dim { margin-top:12px; opacity:0.61; }

/* relative: the row popover anchors to this box, and rows measure against it. */
.pt-stack { position:relative; margin-top:auto; padding-bottom:24px; }
.pt-stack-head { display:flex; align-items:center; justify-content:space-between; }
.pt-stack-title { display:inline-flex; align-items:center; gap:6px; font-weight:300; font-size:12px; color:${ACCENT_SOFT}; }
.pt-stack-search { display:flex; align-items:center; gap:8px; width:180px; height:32px; padding:0 14px; box-sizing:border-box; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); }
.pt-stack-search input { flex:1; min-width:0; border:none; background:transparent; outline:none; color:#fff; font-family:'Outfit',sans-serif; font-weight:500; font-size:11px; }
.pt-chips { margin-top:12px; display:flex; gap:8px; }
.pt-chip { padding:6px 13px; border-radius:9999px; font-size:11px; cursor:pointer; transition:background .15s ease, color .15s ease; white-space:nowrap; }
.pt-rows { margin-top:8px; display:flex; flex-direction:column; max-height:232px; overflow-y:auto; scrollbar-width:none; }
.pt-rows::-webkit-scrollbar { display:none; }
.pt-row-wrap { display:flex; align-items:center; gap:10px; }
.pt-row { flex:1; min-width:0; display:flex; align-items:center; gap:13px; padding:9px 0; text-align:left; cursor:pointer; border-radius:10px; transition:background .15s ease; }
.pt-row:hover { background:rgba(94,158,255,0.08); }
.pt-remind { flex:0 0 auto; height:28px; padding:0 14px; border-radius:9999px; background:${ACTIVE}; color:${NAVY}; font-weight:700; font-size:11px; cursor:pointer; transition:opacity .2s ease; }
.pt-remind:disabled { opacity:0.5; cursor:default; }

/* Row actions. Reuses property home's .ph-scope-menu panel verbatim so the two
   screens' popovers are the same object; no position:fixed inside the scaled
   canvas, and no window.confirm over the simulated frame. */
.pt-row-menu { position:absolute; left:0; z-index:6; width:246px; padding:6px; box-sizing:border-box; border-radius:14px; background:#0B1436; border:1px solid rgba(94,158,255,0.3); box-shadow:0 18px 40px rgba(0,4,24,0.5); display:flex; flex-direction:column; gap:2px; }
.pt-row-menu-head { padding:9px 12px 7px; font-weight:700; font-size:11.5px; color:${TEXT_SOFT}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pt-row-menu-note { padding:2px 12px 10px; font-weight:500; font-size:12px; color:rgba(244,246,255,0.5); }
.pt-row-menu-warn { padding:2px 12px 10px; font-weight:600; font-size:12px; line-height:1.45; color:${RED}; }
.pt-row-opt { min-height:40px; padding:10px 12px; border-radius:9px; background:transparent; font-weight:500; font-size:12.5px; color:${TEXT_SOFT}; text-align:left; cursor:pointer; transition:background .15s ease; }
.pt-row-opt:hover:not(:disabled) { background:rgba(94,158,255,0.14); }
.pt-row-opt:disabled { opacity:0.55; cursor:default; }
.pt-row-opt-danger { color:${RED}; }
.pt-row-opt-danger:hover:not(:disabled) { background:rgba(240,101,108,0.14); }
.pt-avatar { width:40px; height:40px; border-radius:50%; border:1.5px solid rgba(94,158,255,0.8); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:11px; color:#fff; flex:0 0 auto; box-sizing:border-box; }
.pt-row-mid { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
.pt-row-name { font-weight:700; font-size:13px; color:${TEXT_SOFT}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pt-row-status { display:flex; align-items:center; gap:5px; font-weight:500; font-size:10.5px; color:rgba(244,246,255,0.5); }
.pt-dot { width:5px; height:5px; border-radius:50%; opacity:0.85; flex:0 0 auto; }
.pt-row-amt { font-weight:800; font-size:14.5px; color:#fff; font-variant-numeric:tabular-nums; }
.pt-empty { padding:20px 0; font-weight:300; font-size:12.5px; color:rgba(191,209,255,0.5); }

/* ── rail (design pins it at x=550) ── */
.pt-rail-slot { flex:0 0 76px; margin:175px 40px 0 44px; }
.pt-rail { position:absolute; left:550px; width:80px; box-sizing:border-box; border:1.5px solid rgba(94,158,255,0.7); border-radius:32px; padding:30px 0; display:flex; flex-direction:column; align-items:center; gap:40px; --dt-i:6; }
.pt-rail-btn { width:46px; height:46px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background .18s ease; }
.pt-rail-btn:hover { background:rgba(94,158,255,0.14); }
.pt-rail-big { width:54px; height:54px; background:${ACTIVE}; box-shadow:0 8px 20px rgba(102,169,255,0.35); }
.pt-rail-big:hover { background:${ACTIVE}; opacity:0.9; }

/* ── right panel ── */
.pt-panel { flex:1; min-width:0; padding-left:36px; box-sizing:border-box; position:relative; --dt-i:7; }
.pt-mode { animation:tileIn var(--m-dur-ui) var(--m-ease-out) both; }
.pt-mode-head { font-weight:300; font-size:15px; color:${KP_INK}; }
.pt-mode-sub { margin-top:4px; font-weight:500; font-size:12px; color:rgba(244,246,255,0.45); max-width:430px; }

/* request */
.pt-req-top { position:absolute; top:62px; width:445px; }
.pt-req-lower { position:absolute; top:420px; width:445px; display:flex; flex-direction:column; gap:14px; max-width:430px; }
.pt-amt-row { display:flex; align-items:baseline; gap:12px; }
.pt-amt { font-family:'Outfit',sans-serif; font-weight:700; font-size:66px; line-height:0.95; color:${KP_INK}; font-variant-numeric:tabular-nums; }
.pt-freq-label { font-weight:300; font-size:15px; color:rgba(198,207,226,0.8); }
.pt-tenant-name { margin-top:16px; font-weight:300; font-size:16px; color:${TEXT_SOFT}; }
.pt-tenant-sub { margin-top:4px; font-weight:500; font-size:13px; color:rgba(244,246,255,0.5); }
.pt-field-row { display:flex; align-items:center; gap:14px; height:54px; padding:0 20px; box-sizing:border-box; border-radius:12px; border:1.5px solid rgba(94,158,255,0.55); }
.pt-field-strong { font-weight:600; font-size:14px; color:${TEXT_SOFT}; }
.pt-field-div { color:rgba(94,158,255,0.5); }
.pt-field-soft { font-weight:300; font-size:14px; color:${TEXT_SOFT}; }
.pt-edit { margin-left:auto; font-weight:300; font-size:12px; color:${ACCENT_SOFT}; background:transparent; cursor:pointer; }
.pt-edit-inline { margin-left:0; }
.pt-send-via { display:flex; flex-direction:column; gap:1px; min-width:0; }
.pt-send-cap { font-weight:600; font-size:8.5px; letter-spacing:0.08em; color:rgba(244,246,255,0.45); }
.pt-send-to { font-weight:600; font-size:13px; color:${TEXT_SOFT}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pt-freq-chips { display:flex; gap:10px; margin-top:6px; }
.pt-freq-chip { flex:1; height:44px; border-radius:9999px; font-size:12.5px; cursor:pointer; transition:background .15s ease, color .15s ease; }
.pt-send-btn { margin:44px auto 0; width:200px; height:46px; border-radius:9999px; border:1.5px solid rgba(94,158,255,0.7); background:transparent; font-weight:300; font-size:13.5px; color:${TEXT_SOFT}; cursor:pointer; transition:background .15s ease, border-color .2s ease, color .2s ease; }
.pt-send-btn:hover:not(:disabled) { background:rgba(94,158,255,0.08); }
.pt-send-btn:disabled { opacity:0.55; cursor:default; }

/* tenant picker */
.pt-tenants { padding-top:60px; }
.pt-tenant-search { margin-top:26px; display:flex; align-items:center; gap:10px; width:300px; height:38px; padding:0 16px; box-sizing:border-box; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); }
.pt-tenant-search input { flex:1; min-width:0; border:none; background:transparent; outline:none; color:#fff; font-family:'Outfit',sans-serif; font-weight:500; font-size:12px; }
.pt-tenant-cards { margin-top:26px; display:flex; flex-direction:column; gap:14px; width:440px; max-height:420px; overflow-y:auto; scrollbar-width:none; }
.pt-tenant-cards::-webkit-scrollbar { display:none; }
.pt-tenant-card { display:flex; align-items:center; gap:12px; height:52px; padding:0 12px; box-sizing:border-box; border-radius:10px; border:1.5px solid rgba(94,158,255,0.55); background:rgba(94,158,255,0.07); cursor:pointer; text-align:left; flex:0 0 auto; transition:background .15s ease, border-color .15s ease; }
.pt-tenant-card:hover { background:rgba(94,158,255,0.14); }
.pt-tc-avatar { width:34px; height:34px; border-radius:50%; background:${ACTIVE}; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:10.5px; color:${NAVY}; flex:0 0 auto; }
.pt-tc-mid { display:flex; flex-direction:column; gap:1px; flex:1; min-width:0; }
.pt-tc-name { font-weight:700; font-size:12.5px; color:${TEXT_SOFT}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pt-tc-sub { font-weight:500; font-size:9.5px; color:rgba(244,246,255,0.5); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pt-tc-right { display:flex; flex-direction:column; align-items:flex-end; gap:1px; flex:0 0 auto; }
.pt-tc-amt { font-weight:700; font-size:13px; color:${TEXT_SOFT}; }
.pt-tc-cap { font-weight:500; font-size:9.5px; color:rgba(244,246,255,0.5); }

/* keypad */
.pt-kp-head { display:flex; align-items:center; justify-content:space-between; }
.pt-kp-circle { width:40px; height:40px; border-radius:50%; border:1.5px solid rgba(94,158,255,0.7); display:flex; align-items:center; justify-content:center; background:transparent; cursor:pointer; transition:background .15s ease; }
.pt-kp-circle:hover { background:rgba(94,158,255,0.08); }
.pt-kp-amt { margin-top:10px; text-align:center; font-family:'Outfit',sans-serif; font-weight:700; font-size:68px; line-height:1; color:${KP_INK}; font-variant-numeric:tabular-nums; }
.pt-kp-who { margin-top:84px; text-align:center; font-weight:500; font-size:13px; color:rgba(198,207,226,0.75); }
.pt-kp-grid { margin:30px auto 0; display:grid; grid-template-columns:repeat(3,80px); gap:24px 56px; justify-content:center; }
.pt-kp-key { width:80px; height:80px; border-radius:50%; font-size:34px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; font-family:'Outfit',sans-serif; box-sizing:border-box; transition:opacity .12s ease; }
.pt-kp-key:hover { opacity:0.88; }

/* bill — margins tightened from 56/30 to buy back the 40px the due chips and
   the attach row need inside the 787px panel. */
.pt-bill { margin-top:40px; }
.pt-bill-amt { font-family:'Outfit',sans-serif; font-weight:700; font-size:54px; line-height:0.95; color:${KP_INK}; font-variant-numeric:tabular-nums; }
.pt-bill-name { margin-top:12px; font-weight:300; font-size:15px; color:${TEXT_SOFT}; }
.pt-bill-sub { margin-top:3px; font-weight:500; font-size:12.5px; color:rgba(244,246,255,0.5); }
.pt-bill-label { margin-top:24px; font-weight:700; font-size:10px; letter-spacing:0.18em; color:rgba(244,246,255,0.45); }
.pt-bill-chips { margin-top:12px; display:flex; flex-wrap:wrap; gap:10px; max-width:430px; }
.pt-bill-chip { padding:11px 20px; border-radius:9999px; font-size:12.5px; cursor:pointer; transition:background .15s ease, color .15s ease; }
.pt-bill-input { margin-top:12px; width:430px; height:50px; box-sizing:border-box; border-radius:9999px; border:none; outline:none; background:#fff; padding:0 22px; color:${INK}; font-family:'Outfit',sans-serif; font-weight:600; font-size:14px; }
/* Same object as .pt-freq-chips on the request screen, so the two chip rows read
   identically across the two panels. */
.pt-bill-due { display:flex; gap:10px; margin-top:12px; width:430px; }
.pt-bill-attach { margin-top:12px; display:flex; align-items:center; gap:12px; width:430px; height:50px; padding:0 18px; box-sizing:border-box; border-radius:12px; border:1.5px dashed rgba(94,158,255,0.4); color:${ACCENT_SOFT}; font-weight:600; font-size:12.5px; cursor:pointer; transition:background .15s ease, border-color .15s ease; }
.pt-bill-attach:hover { background:rgba(94,158,255,0.07); }
.pt-bill-attach input { display:none; }
.pt-bill-attached { border-style:solid; border-color:rgba(94,158,255,0.55); cursor:default; }
.pt-bill-attached:hover { background:transparent; }
.pt-bill-doc-name { flex:1; min-width:0; color:${TEXT_SOFT}; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pt-bill-doc-remove { flex:0 0 auto; font-weight:300; font-size:12px; color:${ACCENT_SOFT}; background:transparent; cursor:pointer; }
.pt-bill-send { display:block; margin:28px auto 0; }

/* mark paid */
.pt-paid { margin-top:100px; }
.pt-paid-rows { margin-top:22px; display:flex; flex-direction:column; width:440px; max-height:380px; overflow-y:auto; scrollbar-width:none; }
.pt-paid-rows::-webkit-scrollbar { display:none; }
.pt-paid-row { display:flex; align-items:center; gap:14px; padding:11px 0; border-bottom:1px solid rgba(94,158,255,0.14); }
.pt-paid-mid { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
.pt-paid-btn { width:34px; height:34px; border-radius:50%; border:1.5px solid rgba(53,208,127,0.5); display:flex; align-items:center; justify-content:center; background:transparent; cursor:pointer; flex:0 0 auto; transition:background .15s ease; }
.pt-paid-btn:hover:not(:disabled) { background:rgba(53,208,127,0.12); }
.pt-paid-btn:disabled { opacity:0.5; cursor:default; }
`;
