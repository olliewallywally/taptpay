import { useMemo, useState } from "react";
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

const FREQUENCIES = ["once", "weekly", "fortnightly", "monthly"] as const;
type Frequency = (typeof FREQUENCIES)[number];
const FREQ_LABEL: Record<Frequency, string> = {
  once: "one-off",
  weekly: "per week",
  fortnightly: "per fortnight",
  monthly: "per month",
};

const STACK_FILTERS = ["all", "overdue", "sent", "paid", "failed"] as const;
type StackFilter = (typeof STACK_FILTERS)[number];

const KP_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "<"] as const;

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

function kpMoney(v: string): string {
  if (!v) return "$0.00";
  const [rawD, rawC] = v.split(".");
  const d = (rawD || "0").replace(/^0+(?=\d)/, "");
  const dn = Number(d).toLocaleString("en-NZ");
  if (v.includes(".")) return "$" + dn + "." + ((rawC || "") + "00").slice(0, 2);
  return "$" + dn + ".00";
}

/* The design's list buckets, mapped onto real invoice statuses. */
function bucketOf(status: string): Exclude<StackFilter, "all"> {
  if (status === "paid" || status === "paid_external") return "paid";
  if (status === "overdue") return "overdue";
  if (status === "dispatch_failed" || status === "failed") return "failed";
  return "sent";
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

  const [mode, setMode] = useState<Mode>("request");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [amountCents, setAmountCents] = useState(0);
  const [kpVal, setKpVal] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("once");
  const [chargeType, setChargeType] = useState("utilities");
  const [description, setDescription] = useState("Water / utilities");
  const [search, setSearch] = useState("");
  const [tenantSearch, setTenantSearch] = useState("");
  const [filter, setFilter] = useState<StackFilter>("all");
  const [reqFlash, setReqFlash] = useState(false);
  const [billFlash, setBillFlash] = useState(false);

  const tenantsQuery = usePropertyTenants();
  const invoicesQuery = usePropertyInvoices();
  const tenants = (tenantsQuery.data ?? []).filter((t: any) => t.status !== "archived");
  const invoices = invoicesQuery.data ?? [];

  const tenant = tenants.find((t: any) => t.id === tenantId) ?? null;
  const channel = (tenant?.preferredChannel ?? "email") as string;
  const channelContact = channel === "email" ? tenant?.email : tenant?.phone;

  /* ── left column figures + request list ── */
  const model = useMemo(() => {
    const live = invoices.filter((i: any) => i.status !== "voided");
    const unpaid = live.filter((i: any) => i.status !== "paid" && i.status !== "paid_external");
    const outstandingRent = unpaid
      .filter((i: any) => (i.kind ?? "rent") === "rent")
      .reduce((s: number, i: any) => s + (i.amountCents ?? 0), 0);
    const outstandingExpenses = unpaid
      .filter((i: any) => i.kind === "charge")
      .reduce((s: number, i: any) => s + (i.amountCents ?? 0), 0);

    const byId = new Map(tenants.map((t: any) => [t.id, t]));
    const rows = [...live]
      .sort(
        (a: any, b: any) =>
          new Date(b.createdAt ?? b.dueAt).getTime() - new Date(a.createdAt ?? a.dueAt).getTime(),
      )
      .map((i: any) => {
        const t = byId.get(i.tenantProfileId);
        const bucket = bucketOf(i.status);
        return {
          id: i.id as string,
          name: t ? fullNameOf(t) : "tenant",
          initials: t ? initialsOf(t) : "?",
          bucket,
          status:
            bucket === "paid"
              ? i.status === "paid_external"
                ? "paid · marked"
                : "paid"
              : bucket === "overdue"
                ? "overdue"
                : bucket === "failed"
                  ? "delivery failed"
                  : (i.kind ?? "rent") === "charge"
                    ? `sent · ${i.chargeType ?? "charge"}`
                    : "sent",
          amt: fmtNZD(i.amountCents ?? 0),
        };
      });

    return { outstandingRent, outstandingExpenses, rows };
  }, [invoices, tenants]);

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
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to send", variant: "destructive" }),
  });

  const sendBill = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/property/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...propHeaders() },
        body: JSON.stringify({
          tenantProfileId: tenantId,
          amountCents,
          deliveryChannel: channel,
          dueAt: new Date().toISOString(),
          splitEnabled: false,
          kind: "charge",
          chargeType,
          description,
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

  const pressKey = (k: string) => {
    setKpVal((v) => {
      if (k === "<") return v.slice(0, -1);
      if (k === ".") return v.includes(".") ? v : v ? v + "." : "0.";
      if (v.replace(".", "").length >= 7) return v;
      return v + k;
    });
  };

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
        <div className="pt-left">
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

          <div className="pt-stack">
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
              {STACK_FILTERS.map((f) => (
                <button key={f} type="button" className="pt-chip" style={chip(f === filter)} onClick={() => setFilter(f)}>
                  {f}
                </button>
              ))}
            </div>

            <div className="pt-rows">
              {invoicesQuery.isLoading ? (
                <div className="pt-empty">loading…</div>
              ) : stackRows.length === 0 ? (
                <div className="pt-empty">no requests here</div>
              ) : (
                stackRows.map((r) => (
                  <div key={r.id} className="pt-row">
                    <span className="pt-avatar">{r.initials}</span>
                    <span className="pt-row-mid">
                      <span className="pt-row-name">{r.name}</span>
                      <span className="pt-row-status">
                        <span className="pt-dot" style={{ background: STATUS_DOT[r.bucket] }} />
                        {r.status}
                      </span>
                    </span>
                    <span className="pt-row-amt">{r.amt}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── CENTER RAIL ── */}
        <div className="pt-rail-slot">
          <div className="pt-rail">
            {railBtn("tenant", false, (<><circle cx="12" cy="8" r="3.4" /><path d="M5.5 19.5c1-3.2 3.4-4.8 6.5-4.8s5.5 1.6 6.5 4.8" /></>), "select tenant")}
            {railBtn("request", false, (<><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></>), "rent request")}
            {railBtn("keypad", true, (<path d="M12 5v14M5 12h14" />), "keypad")}
            {railBtn("bill", false, (<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9.5 8h5M9.5 12h5" /></>), "send bill")}
            {railBtn("paid", false, (<><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m9 12 2.2 2.2L15.5 10" /></>), "mark as paid")}
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="pt-panel">
          {mode === "request" && (
            <>
              <div className="pt-mode pt-req-top">
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
                  onClick={() => {
                    setAmountCents(Math.round((parseFloat(kpVal) || 0) * 100));
                    setKpVal("");
                    setMode("request");
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L19 8" /></svg>
                </button>
              </div>
              <div className="pt-kp-amt">{kpMoney(kpVal)}</div>
              <div className="pt-kp-who">
                {tenant ? `${fullNameOf(tenant)} — ${tenant.propertyAddress}` : "no tenant selected"}
              </div>
              <div className="pt-kp-grid">
                {KP_KEYS.map((k) => {
                  const fill = k !== "." && k !== "<";
                  return (
                    <button
                      key={k}
                      type="button"
                      className="pt-kp-key"
                      aria-label={k === "<" ? "backspace" : k === "." ? "decimal point" : k}
                      style={{
                        background: fill ? ACTIVE : "transparent",
                        border: fill ? "none" : `1.5px solid ${ACCENT}`,
                        color: fill ? "#FFFFFF" : VIOLET,
                        boxShadow: fill ? "0 14px 22px rgba(0,6,25,0.45)" : "none",
                      }}
                      onClick={() => pressKey(k)}
                    >
                      {k}
                    </button>
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
                        setDescription(c.preset);
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
                          <span className="pt-row-status">{r.status}</span>
                        </span>
                        <span className="pt-row-amt">{r.amt}</span>
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
.pt-left { flex:0 0 420px; display:flex; flex-direction:column; animation:popIn .55s cubic-bezier(.34,1.42,.5,1) 40ms both; }
.pt-scope { display:inline-flex; align-items:center; gap:9px; padding:10px 20px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); background:transparent; font-weight:400; font-size:13.5px; color:${ACCENT_SOFT}; cursor:pointer; transition:background .18s ease; }
.pt-scope:hover { background:rgba(94,158,255,0.08); }
.pt-hero-row { margin-top:22px; display:flex; align-items:flex-start; gap:14px; }
.pt-hero { font-family:'Outfit',sans-serif; font-weight:700; font-size:84px; line-height:0.92; letter-spacing:-0.015em; color:${ACCENT}; font-variant-numeric:tabular-nums; }
.pt-hero-sub { margin-top:24px; font-weight:300; font-size:17px; color:${NAV_DIM}; }
.pt-hero-dim { margin-top:36px; font-size:56px; opacity:0.61; }
.pt-hero-sub-dim { margin-top:12px; opacity:0.61; }

.pt-stack { margin-top:auto; padding-bottom:24px; }
.pt-stack-head { display:flex; align-items:center; justify-content:space-between; }
.pt-stack-title { display:inline-flex; align-items:center; gap:6px; font-weight:300; font-size:12px; color:${ACCENT_SOFT}; }
.pt-stack-search { display:flex; align-items:center; gap:8px; width:180px; height:32px; padding:0 14px; box-sizing:border-box; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); }
.pt-stack-search input { flex:1; min-width:0; border:none; background:transparent; outline:none; color:#fff; font-family:'Outfit',sans-serif; font-weight:500; font-size:11px; }
.pt-chips { margin-top:12px; display:flex; gap:8px; }
.pt-chip { padding:6px 13px; border-radius:9999px; font-size:11px; cursor:pointer; transition:background .15s ease, color .15s ease; white-space:nowrap; }
.pt-rows { margin-top:8px; display:flex; flex-direction:column; max-height:232px; overflow-y:auto; scrollbar-width:none; }
.pt-rows::-webkit-scrollbar { display:none; }
.pt-row { display:flex; align-items:center; gap:13px; padding:9px 0; }
.pt-avatar { width:40px; height:40px; border-radius:50%; border:1.5px solid rgba(94,158,255,0.8); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:11px; color:#fff; flex:0 0 auto; box-sizing:border-box; }
.pt-row-mid { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
.pt-row-name { font-weight:700; font-size:13px; color:${TEXT_SOFT}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pt-row-status { display:flex; align-items:center; gap:5px; font-weight:500; font-size:10.5px; color:rgba(244,246,255,0.5); }
.pt-dot { width:5px; height:5px; border-radius:50%; opacity:0.85; flex:0 0 auto; }
.pt-row-amt { font-weight:800; font-size:14.5px; color:#fff; font-variant-numeric:tabular-nums; }
.pt-empty { padding:20px 0; font-weight:300; font-size:12.5px; color:rgba(191,209,255,0.5); }

/* ── rail (design pins it at x=550) ── */
.pt-rail-slot { flex:0 0 76px; margin:175px 40px 0 44px; }
.pt-rail { position:absolute; left:550px; width:80px; box-sizing:border-box; border:1.5px solid rgba(94,158,255,0.7); border-radius:32px; padding:30px 0; display:flex; flex-direction:column; align-items:center; gap:40px; }
.pt-rail-btn { width:46px; height:46px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background .18s ease; }
.pt-rail-btn:hover { background:rgba(94,158,255,0.14); }
.pt-rail-big { width:54px; height:54px; background:${ACTIVE}; box-shadow:0 8px 20px rgba(102,169,255,0.35); }
.pt-rail-big:hover { background:${ACTIVE}; opacity:0.9; }

/* ── right panel ── */
.pt-panel { flex:1; min-width:0; padding-left:36px; box-sizing:border-box; position:relative; }
.pt-mode { animation:tileIn .35s cubic-bezier(.22,.9,.3,1) both; }
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

/* bill */
.pt-bill { margin-top:56px; }
.pt-bill-amt { font-family:'Outfit',sans-serif; font-weight:700; font-size:54px; line-height:0.95; color:${KP_INK}; font-variant-numeric:tabular-nums; }
.pt-bill-name { margin-top:12px; font-weight:300; font-size:15px; color:${TEXT_SOFT}; }
.pt-bill-sub { margin-top:3px; font-weight:500; font-size:12.5px; color:rgba(244,246,255,0.5); }
.pt-bill-label { margin-top:30px; font-weight:700; font-size:10px; letter-spacing:0.18em; color:rgba(244,246,255,0.45); }
.pt-bill-chips { margin-top:12px; display:flex; flex-wrap:wrap; gap:10px; max-width:430px; }
.pt-bill-chip { padding:11px 20px; border-radius:9999px; font-size:12.5px; cursor:pointer; transition:background .15s ease, color .15s ease; }
.pt-bill-input { margin-top:12px; width:430px; height:50px; box-sizing:border-box; border-radius:9999px; border:none; outline:none; background:#fff; padding:0 22px; color:${INK}; font-family:'Outfit',sans-serif; font-weight:600; font-size:14px; }
.pt-bill-send { display:block; margin:34px auto 0; }

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
