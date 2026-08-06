/* Desktop/tablet settings — design screens 2e/3e/4e, which differ only in the
   left column's branding and the vertical highlighted in the switcher, so all
   three verticals render this one component. Every row drives the same endpoint
   the mobile settings page does. */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentMerchantId } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  usePushNotifications,
  type PushNotificationPreferenceKey,
} from "@/hooks/use-push-notifications";
import { readDesktopPrefs, writeDesktopPrefs, type HistoryStart } from "./data/desktop-prefs";
import { saveDesktopMode, type DesktopVertical } from "./desktop-theme";
import {
  DesktopPageScaffold,
  type DesktopRoutePageProps,
} from "./DesktopPageScaffold";

/* ── palette ── */
const ACCENT = "#5E9EFF";
const NAV_DIM = "#4A86F0";
const ACTIVE = "#66A9FF";
const NAVY = "#000F3F";
const GREEN = "#35D07F";
const RED = "#F0656C";
const OPEN_INK = "#04103A";

type SectionKey = "business" | "prefs" | "billing" | "account" | "notifs";

const SECTIONS: { k: SectionKey; title: string }[] = [
  { k: "business", title: "Business Details" },
  { k: "prefs", title: "Dashboard Preferences" },
  { k: "billing", title: "Subscription & Billing" },
  { k: "account", title: "Account" },
  { k: "notifs", title: "Transaction Notifications" },
];

const NOTIFICATION_OPTIONS: Array<{
  key: PushNotificationPreferenceKey;
  label: string;
  description: string;
}> = [
  {
    key: "paymentReceived",
    label: "Payment received",
    description: "Alert when a customer payment succeeds",
  },
  {
    key: "dailyPayoutSummary",
    label: "Daily payout summary",
    description: "A morning summary of payments received yesterday",
  },
  {
    key: "failedPaymentAlerts",
    label: "Failed payment alerts",
    description: "Alert when a payment is declined or cancelled",
  },
];

const MODES: { k: DesktopVertical; label: string; sub: string; path: string; icon: JSX.Element }[] = [
  {
    k: "retail",
    label: "Retail",
    sub: "terminal · sales",
    path: "/dashboard",
    icon: (<><rect x="4" y="5" width="16" height="14" rx="2.5" /><path d="M8 10h5M8 14h8" /></>),
  },
  {
    k: "property",
    label: "Property",
    sub: "tenants · rent",
    path: "/property",
    icon: (<><path d="M4 11l8-7 8 7" /><path d="M6 9.5V20h12V9.5" /></>),
  },
  {
    k: "trades",
    label: "Trades",
    sub: "quotes · jobs",
    path: "/trades",
    icon: <path d="M14.5 6.5a4 4 0 0 0-5.6 4.9L4 16.3V20h3.7l4.9-4.9a4 4 0 0 0 4.9-5.6l-2.8 2.8-2.1-2.1z" />,
  },
];

const FREQUENCIES: { v: string; label: string }[] = [
  { v: "weekly", label: "weekly" },
  { v: "bi_weekly", label: "fortnightly" },
  { v: "monthly", label: "monthly" },
];

function initialsOf(name: string): string {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter((p) => /^[a-z0-9]/i.test(p));
  if (parts.length === 0) return "TP";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const fmtDate = (v: unknown) => {
  if (!v) return "—";
  const d = new Date(String(v));
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
};

export interface DesktopSettingsPageProps extends DesktopRoutePageProps {
  vertical: DesktopVertical;
}

export function DesktopSettingsPage({ vertical, ...props }: DesktopSettingsPageProps) {
  const merchantId = getCurrentMerchantId();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const push = usePushNotifications();

  const [openSec, setOpenSec] = useState<SectionKey | null>("business");
  const [details, setDetails] = useState({ businessName: "", gstNumber: "", email: "" });
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [dailyGoal, setDailyGoal] = useState("");
  const [historyStart, setHistoryStart] = useState<HistoryStart>("peek");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [showCardForm, setShowCardForm] = useState(false);
  const [cardBusy, setCardBusy] = useState<"save" | "remove" | null>(null);
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });

  const authFetch = async (path: string) => {
    const token = localStorage.getItem("authToken");
    const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(path);
    return res.json();
  };

  const merchantQuery = useQuery<any>({
    queryKey: ["/api/merchants", merchantId, "profile"],
    queryFn: () => authFetch(`/api/merchants/${merchantId}/profile`),
    enabled: !!merchantId,
  });

  const subscriptionQuery = useQuery<any>({
    queryKey: ["/api/subscription"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/subscription");
      if (!res.ok) throw new Error("subscription");
      return res.json();
    },
    enabled: !!merchantId,
  });

  const cardQuery = useQuery<{ ready: boolean; card: { last4: string; brand: string; expiry: string } | null }>({
    queryKey: ["/api/billing/card"],
    enabled: !!merchantId,
  });

  const merchant = merchantQuery.data;
  const subscription = subscriptionQuery.data?.subscription;

  /* Seed the editable fields once the merchant lands. */
  useEffect(() => {
    if (!merchant) return;
    setDetails({
      businessName: merchant.businessName ?? "",
      gstNumber: merchant.gstNumber ?? "",
      email: merchant.email ?? "",
    });
    setDetailsDirty(false);
    setDailyGoal(String(merchant.dailyGoal ?? "500.00"));
  }, [merchant]);

  useEffect(() => {
    setHistoryStart(readDesktopPrefs(merchantId).historyStart);
  }, [merchantId]);

  /* ── mutations ── */
  const saveDetails = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("authToken");
      const res = await fetch(`/api/merchants/${merchantId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          businessName: details.businessName,
          gstNumber: details.gstNumber,
          email: details.email,
        }),
      });
      if (!res.ok) throw new Error("Failed to update merchant");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "profile"] });
      setDetailsDirty(false);
      toast({ title: "Business details saved successfully" });
    },
    onError: () => toast({ title: "Failed to save business details", variant: "destructive" }),
  });

  const saveGoal = useMutation({
    mutationFn: async (goal: string) => {
      const token = localStorage.getItem("authToken");
      const res = await fetch(`/api/merchants/${merchantId}/daily-goal`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dailyGoal: goal }),
      });
      if (!res.ok) throw new Error("Failed to update daily goal");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "profile"] });
      toast({ title: "Daily goal saved" });
    },
    onError: () => toast({ title: "Failed to save daily goal", variant: "destructive" }),
  });

  const saveFrequency = useMutation({
    mutationFn: async (frequency: string) => {
      const res = await apiRequest("PUT", "/api/subscription/billing-frequency", { frequency });
      if (!res.ok) throw new Error("frequency");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      toast({ title: "Billing frequency updated successfully" });
    },
    onError: () => toast({ title: "Failed to update billing frequency", variant: "destructive" }),
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/merchants/${merchantId}/change-password`, pw);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message || "Failed to change password");
      }
      return res.json();
    },
    onSuccess: () => {
      setPw({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast({ title: "Password changed" });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to change password", variant: "destructive" }),
  });

  /* Card add/remove — same validation and endpoints as the mobile page. */
  const formatCardNumber = (v: string) =>
    v.replace(/\D/g, "").slice(0, 19).replace(/(.{4})/g, "$1 ").trim();
  const formatExpiry = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 4);
    return digits.length >= 3 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  };

  const saveCard = async () => {
    const raw = cardNumber.replace(/\s/g, "");
    if (raw.length < 13 || raw.length > 19) {
      toast({ title: "Please enter a valid card number", variant: "destructive" });
      return;
    }
    if (!/^\d{2}\/\d{2}$/.test(cardExpiry)) {
      toast({ title: "Please enter expiry in MM/YY format", variant: "destructive" });
      return;
    }
    if (cardCvc.length < 3) {
      toast({ title: "Please enter a valid CVC", variant: "destructive" });
      return;
    }
    setCardBusy("save");
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch("/api/billing/card", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cardNumber: raw, expiry: cardExpiry, cvc: cardCvc }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message || "Failed to save card");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/billing/card"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }),
      ]);
      setShowCardForm(false);
      setCardNumber("");
      setCardExpiry("");
      setCardCvc("");
      toast({ title: "Card saved successfully" });
    } catch (e: any) {
      toast({ title: e?.message || "Failed to save card", variant: "destructive" });
    } finally {
      setCardBusy(null);
    }
  };

  const removeCard = async () => {
    setCardBusy("remove");
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch("/api/billing/card", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("remove");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/billing/card"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }),
      ]);
      toast({ title: "Card removed" });
    } catch {
      toast({ title: "Failed to remove card", variant: "destructive" });
    } finally {
      setCardBusy(null);
    }
  };

  /* ── actions ── */
  const businessName = merchant?.businessName || "Your Business";
  const status = String(merchant?.status ?? "pending");
  const isActive = status === "active";

  const openPaymentPage = () => {
    const url = merchant?.paymentUrl || (merchantId ? `${window.location.origin}/pay/${merchantId}` : "");
    if (!url) return;
    window.open(url, "_blank", "noopener");
  };

  const switchMode = (mode: DesktopVertical, path: string) => {
    if (mode === vertical) return;
    saveDesktopMode(mode);
    setLocation(path);
  };

  const logout = () => {
    localStorage.removeItem("authToken");
    setLocation("/login");
  };

  const pickHistoryStart = (v: HistoryStart) => {
    setHistoryStart(v);
    writeDesktopPrefs(merchantId, { historyStart: v });
    toast({ title: `Payment history opens ${v === "peek" ? "as a peek" : "expanded"}` });
  };

  const modeCards = useMemo(
    () => MODES.map((m) => ({ ...m, on: m.k === vertical })),
    [vertical],
  );

  const chip = (on: boolean) => ({
    background: on ? OPEN_INK : "rgba(255,255,255,0.28)",
    color: on ? "#FFFFFF" : OPEN_INK,
    fontWeight: on ? 700 : 600,
  });

  return (
    <DesktopPageScaffold {...props} vertical={vertical} page="settings" showScope={false}>
      <style>{DS_CSS}</style>
      <div className="ds-body">
        {/* ── LEFT ── */}
        <div className="ds-left">
          <div className="ds-id-row">
            <span className="ds-avatar">{initialsOf(businessName)}</span>
            <span className="ds-status" style={{ color: isActive ? GREEN : "#F0A34E" }}>
              <span className="ds-status-dot" style={{ background: isActive ? GREEN : "#F0A34E" }} />
              <span>{status.toUpperCase()}</span>
            </span>
          </div>

          <span className="ds-name">{businessName}</span>
          <span className="ds-kicker">SETTINGS</span>

          <button type="button" className="ds-pay-page" onClick={openPaymentPage}>
            Customer Payment Page
          </button>

          <div className="ds-modes">
            {modeCards.map((m) => (
              <button
                key={m.k}
                type="button"
                className="ds-mode"
                aria-pressed={m.on}
                style={{ background: m.on ? ACTIVE : "#0F1747" }}
                onClick={() => switchMode(m.k, m.path)}
              >
                <span
                  className="ds-mode-ico"
                  style={{ background: m.on ? "rgba(10,17,40,0.14)" : "rgba(94,158,255,0.14)" }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={m.on ? NAVY : ACCENT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {m.icon}
                  </svg>
                </span>
                <span className="ds-mode-text">
                  <span className="ds-mode-label" style={{ color: m.on ? NAVY : "#FFFFFF" }}>{m.label}</span>
                  <span className="ds-mode-sub" style={{ color: m.on ? "rgba(10,17,40,0.66)" : "rgba(255,255,255,0.55)" }}>
                    {m.sub}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <button type="button" className="ds-logout" onClick={logout}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4H5v16h4" /><path d="M14 8l4 4-4 4M18 12H9" /></svg>
            <span>Log Out</span>
          </button>
        </div>

        {/* ── RIGHT ── */}
        <div className="ds-right">
          <button type="button" className="ds-board" onClick={() => setLocation("/board-builder")}>
            <span className="ds-board-ico">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#CFE0FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 8V3h10v5" /><rect x="4" y="8" width="16" height="9" rx="2" /><path d="M7 14h10v7H7z" /></svg>
            </span>
            <span className="ds-board-text">
              <span className="ds-board-title">Payment Board Builder</span>
              <span className="ds-board-sub">Design &amp; print your custom payment sign</span>
            </span>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={NAV_DIM} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>

          {SECTIONS.map((sec) => {
            const open = openSec === sec.k;
            return (
              <div
                key={sec.k}
                className="ds-sec"
                style={{
                  background: open ? ACTIVE : "rgba(255,255,255,0.06)",
                  border: `1px solid rgba(255,255,255,${open ? 0.14 : 0.1})`,
                }}
              >
                <span className="ds-sec-glow" style={{ opacity: open ? 1 : 0 }} aria-hidden="true" />
                <button
                  type="button"
                  className="ds-sec-head"
                  aria-expanded={open}
                  onClick={() => setOpenSec(open ? null : sec.k)}
                >
                  <span className="ds-sec-title" style={{ color: open ? OPEN_INK : "#EAF2FF" }}>{sec.title}</span>
                  <span
                    className="ds-sec-chev"
                    style={{
                      background: open ? "rgba(4,16,58,0.16)" : "rgba(255,255,255,0.12)",
                      transform: open ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={open ? OPEN_INK : "#CFE0FF"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                  </span>
                </button>

                {open && sec.k === "business" && (
                  <div className="ds-sec-body">
                    <div className="ds-grid">
                      <label className="ds-field">
                        <span className="ds-field-label">TRADING NAME</span>
                        <input
                          value={details.businessName}
                          onChange={(e) => {
                            setDetails((d) => ({ ...d, businessName: e.target.value }));
                            setDetailsDirty(true);
                          }}
                          aria-label="trading name"
                        />
                      </label>
                      <label className="ds-field">
                        <span className="ds-field-label">GST NUMBER</span>
                        <input
                          value={details.gstNumber}
                          onChange={(e) => {
                            setDetails((d) => ({ ...d, gstNumber: e.target.value }));
                            setDetailsDirty(true);
                          }}
                          placeholder="not set"
                          aria-label="gst number"
                        />
                      </label>
                      <label className="ds-field">
                        <span className="ds-field-label">RECEIPT EMAIL</span>
                        <input
                          value={details.email}
                          onChange={(e) => {
                            setDetails((d) => ({ ...d, email: e.target.value }));
                            setDetailsDirty(true);
                          }}
                          aria-label="receipt email"
                        />
                      </label>
                    </div>
                    <div className="ds-actions">
                      <button
                        type="button"
                        className="ds-primary"
                        disabled={!detailsDirty || saveDetails.isPending}
                        onClick={() => saveDetails.mutate()}
                      >
                        {saveDetails.isPending ? "Saving…" : "Save changes"}
                      </button>
                    </div>
                  </div>
                )}

                {open && sec.k === "prefs" && (
                  <div className="ds-sec-body">
                    <div className="ds-row">
                      <span className="ds-row-label">Daily revenue goal</span>
                      <span className="ds-row-controls">
                        <input
                          className="ds-inline-input"
                          value={dailyGoal}
                          onChange={(e) => setDailyGoal(e.target.value)}
                          inputMode="decimal"
                          aria-label="daily revenue goal"
                        />
                        <button
                          type="button"
                          className="ds-primary ds-primary-sm"
                          disabled={saveGoal.isPending}
                          onClick={() => saveGoal.mutate(dailyGoal)}
                        >
                          {saveGoal.isPending ? "Saving…" : "Save"}
                        </button>
                      </span>
                    </div>
                    <div className="ds-row">
                      <span className="ds-row-label">Payment history opens</span>
                      <span className="ds-row-controls">
                        {(["peek", "expanded"] as HistoryStart[]).map((v) => (
                          <button key={v} type="button" className="ds-chip" style={chip(historyStart === v)} onClick={() => pickHistoryStart(v)}>
                            {v}
                          </button>
                        ))}
                      </span>
                    </div>
                    <div className="ds-row ds-row-last">
                      <span className="ds-row-label">Currency</span>
                      <span className="ds-row-value">NZD $</span>
                    </div>
                  </div>
                )}

                {open && sec.k === "billing" && (
                  <div className="ds-sec-body">
                    <div className="ds-row">
                      <span className="ds-row-label">Plan</span>
                      <span className="ds-row-value">
                        {subscription ? `${subscription.tier === "paid" ? "Paid" : "Free"} · ${subscription.status}` : "—"}
                      </span>
                    </div>
                    <div className="ds-row">
                      <span className="ds-row-label">Unbilled</span>
                      <span className="ds-row-value">
                        {subscription
                          ? `${subscription.unbilledTransactionCount ?? 0} payments · $${subscription.unbilledAmount ?? "0.00"}`
                          : "—"}
                      </span>
                    </div>
                    <div className="ds-row">
                      <span className="ds-row-label">Billing frequency</span>
                      <span className="ds-row-controls">
                        {FREQUENCIES.map((f) => (
                          <button
                            key={f.v}
                            type="button"
                            className="ds-chip"
                            style={chip((subscription?.billingFrequency ?? "monthly") === f.v)}
                            disabled={saveFrequency.isPending}
                            onClick={() => saveFrequency.mutate(f.v)}
                          >
                            {f.label}
                          </button>
                        ))}
                      </span>
                    </div>
                    <div className="ds-row">
                      <span className="ds-row-label">Next invoice</span>
                      <span className="ds-row-value">{fmtDate(subscription?.nextBillingDate)}</span>
                    </div>

                    <div className="ds-row ds-row-last ds-row-tall">
                      <span className="ds-row-label">Payment method</span>
                      {cardQuery.data?.card && !showCardForm ? (
                        <span className="ds-row-controls">
                          <span className="ds-row-value">
                            {cardQuery.data.card.brand} ···· {cardQuery.data.card.last4} · expires {cardQuery.data.card.expiry}
                          </span>
                          <button type="button" className="ds-ghost" onClick={() => setShowCardForm(true)}>Replace</button>
                          <button type="button" className="ds-ghost ds-ghost-danger" disabled={cardBusy === "remove"} onClick={removeCard}>
                            {cardBusy === "remove" ? "Removing…" : "Remove"}
                          </button>
                        </span>
                      ) : (
                        <span className="ds-card-form">
                          <input
                            className="ds-inline-input ds-card-number"
                            value={cardNumber}
                            onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                            placeholder="card number"
                            inputMode="numeric"
                            aria-label="card number"
                          />
                          <input
                            className="ds-inline-input ds-card-small"
                            value={cardExpiry}
                            onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                            placeholder="MM/YY"
                            inputMode="numeric"
                            aria-label="card expiry"
                          />
                          <input
                            className="ds-inline-input ds-card-small"
                            value={cardCvc}
                            onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                            placeholder="CVC"
                            inputMode="numeric"
                            aria-label="card cvc"
                          />
                          <button type="button" className="ds-primary ds-primary-sm" disabled={cardBusy === "save"} onClick={saveCard}>
                            {cardBusy === "save" ? "Saving…" : "Save card"}
                          </button>
                          {cardQuery.data?.card && (
                            <button type="button" className="ds-ghost" onClick={() => setShowCardForm(false)}>Cancel</button>
                          )}
                        </span>
                      )}
                    </div>

                    {cardQuery.data && !cardQuery.data.ready && (
                      <div className="ds-warn">
                        A valid card is required before you can send payments.
                      </div>
                    )}
                  </div>
                )}

                {open && sec.k === "account" && (
                  <div className="ds-sec-body">
                    <div className="ds-row">
                      <span className="ds-row-label">Email</span>
                      <span className="ds-row-value">{merchant?.email || "—"}</span>
                    </div>
                    <div className="ds-row">
                      <span className="ds-row-label">Phone</span>
                      <span className="ds-row-value">{merchant?.phone || "—"}</span>
                    </div>
                    <div className="ds-row">
                      <span className="ds-row-label">Account status</span>
                      <span className="ds-row-value">
                        {isActive
                          ? "Active — connected to the payment network"
                          : status === "verified"
                            ? "Pending — being reviewed for Windcave onboarding"
                            : `${status} — contact support if you need help`}
                      </span>
                    </div>
                    <div className="ds-row ds-row-last ds-row-tall">
                      <span className="ds-row-label">Password</span>
                      <span className="ds-card-form">
                        <input
                          className="ds-inline-input"
                          type="password"
                          value={pw.currentPassword}
                          onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))}
                          placeholder="current"
                          aria-label="current password"
                        />
                        <input
                          className="ds-inline-input"
                          type="password"
                          value={pw.newPassword}
                          onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))}
                          placeholder="new"
                          aria-label="new password"
                        />
                        <input
                          className="ds-inline-input"
                          type="password"
                          value={pw.confirmPassword}
                          onChange={(e) => setPw((p) => ({ ...p, confirmPassword: e.target.value }))}
                          placeholder="confirm"
                          aria-label="confirm password"
                        />
                        <button
                          type="button"
                          className="ds-primary ds-primary-sm"
                          disabled={changePassword.isPending}
                          onClick={() => changePassword.mutate()}
                        >
                          {changePassword.isPending ? "Changing…" : "Change password"}
                        </button>
                      </span>
                    </div>
                  </div>
                )}

                {open && sec.k === "notifs" && (
                  <div className="ds-sec-body">
                    {!push.supported ? (
                      <div className="ds-note ds-note-block">Push notifications are not supported in this browser.</div>
                    ) : !push.available ? (
                      <div className="ds-note ds-note-block">
                        Push notifications are not yet configured. Please contact support to enable this feature.
                      </div>
                    ) : (
                      NOTIFICATION_OPTIONS.map((option, index) => {
                        const checked = push.enabled && push.preferences[option.key];
                        return (
                          <div
                            key={option.key}
                            className={`ds-row${index === NOTIFICATION_OPTIONS.length - 1 ? " ds-row-last" : ""}`}
                          >
                            <span className="ds-row-text">
                              <span className="ds-row-label">{option.label}</span>
                              <span className="ds-row-sub">{option.description}</span>
                            </span>
                            <button
                              type="button"
                              className="ds-switch"
                              role="switch"
                              aria-checked={checked}
                              aria-label={option.label.toLowerCase()}
                              disabled={push.loading || push.preferencesLoading}
                              style={{ background: checked ? OPEN_INK : "rgba(255,255,255,0.4)" }}
                              onClick={() => push.setPreference(option.key, !checked)}
                            >
                              <span className="ds-knob" style={{ transform: checked ? "translateX(19px)" : "translateX(0)" }} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </DesktopPageScaffold>
  );
}

export default DesktopSettingsPage;

const DS_CSS = `
.ds-body { display:flex; gap:60px; height:100%; box-sizing:border-box; padding:34px 52px; }

/* ── left column ── */
.ds-left { flex:0 0 372px; display:flex; flex-direction:column; }
.ds-id-row { display:flex; align-items:center; justify-content:space-between; }
.ds-avatar { width:88px; height:88px; border-radius:50%; background:${ACTIVE}; display:flex; align-items:center; justify-content:center; font-family:'Outfit',sans-serif; font-weight:800; font-size:26px; color:${NAVY}; }
.ds-status { display:inline-flex; align-items:center; gap:8px; padding:9px 16px; border-radius:9999px; background:#0F1747; font-weight:700; font-size:11px; letter-spacing:0.12em; }
.ds-status-dot { width:7px; height:7px; border-radius:50%; }
.ds-name { margin-top:24px; font-family:'Outfit',sans-serif; font-weight:700; font-size:46px; line-height:1.05; letter-spacing:-0.01em; color:#fff; }
.ds-kicker { margin-top:10px; font-weight:700; font-size:13px; letter-spacing:0.2em; color:${NAV_DIM}; }
.ds-pay-page { margin-top:36px; height:58px; border-radius:16px; border:1.5px solid rgba(94,158,255,0.55); background:transparent; font-weight:700; font-size:15px; color:${ACCENT}; cursor:pointer; transition:background .15s ease; }
.ds-pay-page:hover { background:rgba(94,158,255,0.08); }
.ds-modes { margin-top:14px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
.ds-mode { display:flex; flex-direction:column; align-items:flex-start; gap:12px; padding:14px; border-radius:16px; cursor:pointer; text-align:left; transition:background .18s ease, transform .15s ease; }
.ds-mode:hover { transform:translateY(-1px); }
.ds-mode-ico { width:32px; height:32px; border-radius:10px; display:flex; align-items:center; justify-content:center; }
.ds-mode-text { display:flex; flex-direction:column; gap:2px; }
.ds-mode-label { font-weight:800; font-size:13.5px; }
.ds-mode-sub { font-weight:600; font-size:10.5px; }
.ds-logout { margin-top:auto; display:inline-flex; align-items:center; justify-content:center; gap:10px; height:52px; border-radius:9999px; border:1.5px solid rgba(240,74,84,0.55); background:transparent; font-weight:700; font-size:14px; color:${RED}; cursor:pointer; transition:background .15s ease; }
.ds-logout:hover { background:rgba(240,74,84,0.08); }

/* ── right column ── */
.ds-right { flex:1; display:flex; flex-direction:column; gap:12px; min-width:0; overflow-y:auto; scrollbar-width:none; }
.ds-right::-webkit-scrollbar { display:none; }
.ds-board { display:flex; align-items:center; gap:18px; padding:20px 24px; border-radius:20px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); backdrop-filter:blur(16px); cursor:pointer; text-align:left; flex:0 0 auto; transition:background .15s ease; }
.ds-board:hover { background:rgba(255,255,255,0.1); }
.ds-board-ico { width:48px; height:48px; border-radius:13px; background:rgba(255,255,255,0.12); display:flex; align-items:center; justify-content:center; flex:0 0 auto; }
.ds-board-text { display:flex; flex-direction:column; gap:3px; flex:1; min-width:0; }
.ds-board-title { font-weight:700; font-size:16.5px; color:#EAF2FF; }
.ds-board-sub { font-weight:500; font-size:13px; color:rgba(191,209,255,0.7); }

.ds-sec { position:relative; border-radius:18px; backdrop-filter:blur(16px); overflow:hidden; flex:0 0 auto; transition:background .22s ease; }
.ds-sec-glow { position:absolute; left:-15%; top:-55%; width:130%; height:240%; border-radius:50%; background:radial-gradient(closest-side,rgba(255,255,255,0.22),transparent 70%); z-index:0; animation:glowDrift 9s ease-in-out infinite; pointer-events:none; transition:opacity .3s ease; }
.ds-sec-head { width:100%; display:flex; align-items:center; justify-content:space-between; padding:17px 24px; background:transparent; cursor:pointer; text-align:left; box-sizing:border-box; position:relative; z-index:1; transition:background .15s ease; }
.ds-sec-head:hover { background:rgba(255,255,255,0.05); }
.ds-sec-title { font-weight:700; font-size:15.5px; }
.ds-sec-chev { width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; transition:transform .22s ease; }
.ds-sec-body { position:relative; z-index:1; padding:2px 24px 20px; display:flex; flex-direction:column; animation:tileIn .28s cubic-bezier(.22,.9,.3,1) both; }

.ds-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.ds-field { padding:13px 16px; border-radius:12px; background:rgba(255,255,255,0.22); display:flex; flex-direction:column; gap:4px; }
.ds-field-label { font-weight:700; font-size:10px; letter-spacing:0.14em; color:rgba(4,16,58,0.6); }
.ds-field input { border:none; outline:none; background:transparent; padding:0; font-family:'Outfit',sans-serif; font-weight:600; font-size:13.5px; color:${OPEN_INK}; }
.ds-field input::placeholder { color:rgba(4,16,58,0.4); }

.ds-actions { margin-top:14px; display:flex; align-items:center; gap:14px; }
.ds-primary { height:42px; padding:0 22px; border-radius:9999px; background:${OPEN_INK}; color:#fff; font-weight:700; font-size:13px; cursor:pointer; transition:opacity .15s ease; }
.ds-primary:hover:not(:disabled) { opacity:0.9; }
.ds-primary:disabled { opacity:0.45; cursor:default; }
.ds-primary-sm { height:36px; padding:0 16px; font-size:12.5px; }
.ds-ghost { height:36px; padding:0 14px; border-radius:9999px; background:rgba(255,255,255,0.3); color:${OPEN_INK}; font-weight:700; font-size:12.5px; cursor:pointer; transition:background .15s ease; }
.ds-ghost:hover:not(:disabled) { background:rgba(255,255,255,0.45); }
.ds-ghost:disabled { opacity:0.5; cursor:default; }
.ds-ghost-danger { color:#8E1F26; }
.ds-note { font-weight:500; font-size:11.5px; color:rgba(4,16,58,0.6); }
.ds-note-block { padding:6px 0 4px; font-size:13px; }
.ds-warn { margin-top:12px; padding:10px 14px; border-radius:10px; background:rgba(142,31,38,0.12); font-weight:600; font-size:12.5px; color:#8E1F26; }

.ds-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:13px 0; border-bottom:1px solid rgba(4,16,58,0.14); }
.ds-row-last { border-bottom:none; }
.ds-row-tall { align-items:flex-start; }
.ds-row-label { font-weight:600; font-size:14px; color:${OPEN_INK}; }
.ds-row-sub { font-weight:500; font-size:12px; color:rgba(4,16,58,0.66); }
.ds-row-text { display:flex; flex-direction:column; gap:2px; min-width:0; }
.ds-row-value { font-weight:600; font-size:13.5px; color:rgba(4,16,58,0.72); text-align:right; }
.ds-row-controls { display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
.ds-inline-input { height:36px; width:118px; box-sizing:border-box; border-radius:9px; border:1px solid rgba(4,16,58,0.18); background:rgba(255,255,255,0.55); padding:0 12px; font-family:'Outfit',sans-serif; font-weight:600; font-size:13px; color:${OPEN_INK}; outline:none; }
.ds-inline-input:focus { border-color:${OPEN_INK}; }
.ds-inline-input::placeholder { color:rgba(4,16,58,0.45); }
.ds-card-form { display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
.ds-card-number { width:190px; }
.ds-card-small { width:88px; }
.ds-chip { height:32px; padding:0 14px; border-radius:9999px; font-size:12px; cursor:pointer; transition:background .15s ease, color .15s ease; }
.ds-chip:disabled { opacity:0.6; cursor:default; }
.ds-switch { position:relative; width:48px; height:29px; border-radius:9999px; cursor:pointer; transition:background .18s ease; flex:0 0 auto; }
.ds-switch:disabled { opacity:0.6; cursor:default; }
.ds-knob { position:absolute; top:4px; left:4px; width:21px; height:21px; border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(10,17,40,0.25); transition:transform .18s ease; }
`;
