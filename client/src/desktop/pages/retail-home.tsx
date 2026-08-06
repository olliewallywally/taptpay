import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getCurrentMerchantId } from "@/lib/auth";
import { useNotifications } from "@/components/notification-system";
import {
  type Timeframe,
  buildBuckets,
  periodWindow,
  collectedCents,
  growthPct,
} from "@/lib/property-dashboard-data";
import {
  DesktopPageScaffold,
  type DesktopRoutePageProps,
} from "../DesktopPageScaffold";

/* ── Retail palette (from the desktop design tokens) ── */
const ACCENT = "#5E9EFF";
const ACCENT_SOFT = "#7FB2FF";
const NAV_DIM = "#4A86F0";
const ACTIVE = "#66A9FF";
const TEXT_SOFT = "#F4F6FF";
const NAVY = "#000F3F";
const CHIP = "#0F1747";
const BAR_DIM = "rgba(94,158,255,0.32)";
const GREEN = "#35D07F";
const RED = "#F0656C";
const AMBER = "#F0A34E";

const RANGES: Timeframe[] = ["day", "week", "month", "year"];
const RANGE_UNIT: Record<Timeframe, string> = {
  day: "hour",
  week: "day",
  month: "week",
  year: "month",
};

/* ── formatting helpers ── */
const centsOf = (price: unknown) =>
  Math.round(parseFloat(String(price ?? "0")) * 100) || 0;
const fmtDollars = (cents: number) =>
  "$" + Math.round(cents / 100).toLocaleString("en-NZ");
const money2 = (cents: number) =>
  "$" +
  (cents / 100).toLocaleString("en-NZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function initials(name: string): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "–";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const prettyMethod = (m: unknown) =>
  String(m ?? "card").replace(/_/g, " ").toLowerCase();

function statusLabel(status: string): string {
  switch (status) {
    case "completed":
      return "payment received";
    case "pending":
    case "processing":
      return "awaiting payment";
    case "failed":
      return "payment failed";
    case "refunded":
      return "refunded";
    case "partially_refunded":
      return "partly refunded";
    default:
      return status;
  }
}

function hour12(h: number): number {
  const hr = h % 12;
  return hr === 0 ? 12 : hr;
}
const meridiem = (h: number) => (h < 12 ? "am" : "pm");

/* ── data-derived view model ── */
interface Tx {
  id: number | string;
  status: string;
  itemName?: string;
  paymentMethod?: string;
  price?: string;
  createdAt: string;
}

function useRetailHomeModel(tf: Timeframe, selBar: number) {
  const merchantId = getCurrentMerchantId();

  const merchantQuery = useQuery<any>({
    queryKey: ["/api/merchants", merchantId, "profile"],
    queryFn: async () => {
      const token = localStorage.getItem("authToken");
      const res = await fetch(`/api/merchants/${merchantId}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch merchant");
      return res.json();
    },
    enabled: !!merchantId,
  });

  const txQuery = useQuery<Tx[]>({
    queryKey: ["/api/merchants", merchantId, "transactions"],
    queryFn: async () => {
      const token = localStorage.getItem("authToken");
      const res = await fetch(`/api/merchants/${merchantId}/transactions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    staleTime: 30000,
    retry: false,
    enabled: !!merchantId,
  });

  const transactions = txQuery.data ?? [];

  const model = useMemo(() => {
    /* Adapt to the shared invoice-shaped helpers: a completed transaction is a
       "paid invoice" collected at createdAt. */
    const sales = transactions.map((tx) => ({
      status: tx.status === "completed" ? "paid" : tx.status,
      createdAt: tx.createdAt,
      paidAt: tx.createdAt,
      amountCents: centsOf(tx.price),
    }));

    const win = periodWindow(tf);
    const collected = collectedCents(sales, win.start, win.end);
    const growth = growthPct(
      collected,
      collectedCents(sales, win.prevStart, win.prevEnd),
    );

    const buckets = buildBuckets(sales, tf);
    const total = buckets.reduce((a, b) => a + b.valueCents, 0);
    const maxVal = Math.max(...buckets.map((b) => b.valueCents), 1);
    let peak = 0;
    buckets.forEach((b, i) => {
      if (b.valueCents > buckets[peak].valueCents) peak = i;
    });
    const selectedIdx =
      selBar >= 0 && selBar < buckets.length ? selBar : peak;
    const selected = buckets[selectedIdx];

    /* Store-health: today's transactions. Awaiting = live mid-scan (any time). */
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const today = transactions.filter(
      (t) => new Date(t.createdAt) >= dayStart,
    );
    const awaiting = transactions.filter(
      (t) => t.status === "pending" || t.status === "processing",
    );
    const doneToday = today.filter((t) => t.status === "completed");
    const failedToday = today.filter((t) => t.status === "failed");

    const awaitingCents = awaiting.reduce((s, t) => s + centsOf(t.price), 0);
    const doneCents = doneToday.reduce((s, t) => s + centsOf(t.price), 0);
    const avgCents = doneToday.length
      ? Math.round(doneCents / doneToday.length)
      : 0;
    const failedCents = failedToday.reduce((s, t) => s + centsOf(t.price), 0);

    /* Busiest hour from today's completed sales. */
    const byHour = new Map<number, { count: number; cents: number }>();
    doneToday.forEach((t) => {
      const h = new Date(t.createdAt).getHours();
      const b = byHour.get(h) ?? { count: 0, cents: 0 };
      b.count += 1;
      b.cents += centsOf(t.price);
      byHour.set(h, b);
    });
    const hourList = Array.from(byHour.entries()).map(([h, v]) => ({
      h,
      count: v.count,
      cents: v.cents,
    }));
    const busiest = hourList.length
      ? hourList.reduce((best, cur) => (cur.count > best.count ? cur : best))
      : null;

    const health = [
      {
        k: "awaiting",
        v: money2(awaitingCents),
        n: String(awaiting.length),
        label: "awaiting payment",
        col: TEXT_SOFT,
      },
      {
        k: "avg",
        v: money2(avgCents),
        n: String(doneToday.length),
        label: "avg sale · transactions",
        col: TEXT_SOFT,
      },
      {
        k: "failed",
        v: money2(failedCents),
        n: String(failedToday.length),
        label: "failed",
        col: ACCENT,
      },
    ];

    const detail: Record<
      string,
      { title: string; rows: { name: string; sub: string; amt: string; col: string }[] }
    > = {
      awaiting: {
        title: "AWAITING PAYMENT — CUSTOMER MID-SCAN",
        rows: awaiting.slice(0, 6).map((t) => ({
          name: t.itemName || "sale",
          sub: `created ${timeAgo(t.createdAt)}`,
          amt: money2(centsOf(t.price)),
          col: TEXT_SOFT,
        })),
      },
      avg: {
        title: "TODAY BY THE NUMBERS",
        rows: [
          {
            name: "transactions",
            sub: "today so far",
            amt: String(doneToday.length),
            col: TEXT_SOFT,
          },
          {
            name: "average sale",
            sub: "per transaction",
            amt: money2(avgCents),
            col: TEXT_SOFT,
          },
          ...(busiest
            ? [
                {
                  name: "busiest hour",
                  sub: `${hour12(busiest.h)}–${hour12(busiest.h + 1)}${meridiem(busiest.h)} · ${busiest.count} sale${busiest.count === 1 ? "" : "s"}`,
                  amt: money2(busiest.cents),
                  col: TEXT_SOFT,
                },
              ]
            : []),
        ],
      },
      failed: {
        title: "FAILED — RETRY OR RE-SEND",
        rows: failedToday.slice(0, 6).map((t) => ({
          name: t.itemName || "sale",
          sub: `card declined · ${timeAgo(t.createdAt)}`,
          amt: money2(centsOf(t.price)),
          col: ACCENT,
        })),
      },
    };

    /* Recent sales feed — real transactions, newest first. */
    const recent = [...transactions]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .map((t) => ({
        id: t.id,
        initials: initials(t.itemName || "sale"),
        name: t.itemName || "sale",
        sub: `${prettyMethod(t.paymentMethod)} · ${timeAgo(t.createdAt)}`,
        amt: money2(centsOf(t.price)),
        status: statusLabel(t.status),
      }));

    return {
      collected,
      growth,
      buckets,
      total,
      maxVal,
      peak,
      selectedIdx,
      selected,
      health,
      detail,
      recent,
    };
  }, [transactions, tf, selBar]);

  return {
    merchant: merchantQuery.data,
    isLoading: txQuery.isLoading,
    isError: txQuery.isError,
    refetch: txQuery.refetch,
    ...model,
  };
}

/* ── page ── */
export default function DesktopRetailHome(props: DesktopRoutePageProps) {
  const [, setLocation] = useLocation();
  const [tf, setTf] = useState<Timeframe>("week");
  const [selBar, setSelBar] = useState(-1);
  const [healthBox, setHealthBox] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [search, setSearch] = useState("");

  const m = useRetailHomeModel(tf, selBar);
  const { notifications } = useNotifications();

  const breakdownAmt = m.selected ? fmtDollars(m.selected.valueCents) : "$0";
  const avgCents = m.buckets.length
    ? Math.round(m.total / m.buckets.length)
    : 0;
  const sharePct =
    m.total > 0 && m.selected
      ? Math.round((m.selected.valueCents / m.total) * 100)
      : 0;
  const bestLabel =
    m.selected && m.selectedIdx === m.peak ? ` · best ${RANGE_UNIT[tf]}` : "";

  const filteredRecent = m.recent.filter((r) =>
    (r.name + " " + r.sub).toLowerCase().includes(search.toLowerCase()),
  );

  const notifDot = (type: string) =>
    type === "success"
      ? GREEN
      : type === "error"
        ? RED
        : type === "warning"
          ? AMBER
          : ACCENT;

  const go = (path: string) => () => setLocation(path);

  return (
    <DesktopPageScaffold
      {...props}
      vertical="retail"
      page="home"
      showScope={false}
    >
      <style>{RH_CSS}</style>

      {/* ── LEFT COLUMN ── */}
      <div className="rh-left">
        <button type="button" className="rh-scope" aria-label="my store scope">
          <span>my store</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </button>

        {/* hero */}
        <div className="rh-hero">
          {m.isError ? (
            <div className="rh-error">
              <span>couldn't load your sales</span>
              <button type="button" onClick={() => m.refetch()}>retry</button>
            </div>
          ) : m.isLoading ? (
            <div className="rh-skel" style={{ width: 280, height: 78, borderRadius: 14 }} />
          ) : (
            <div className="rh-hero-row">
              <span className="rh-amount">{fmtDollars(m.collected)}</span>
              {m.growth !== null && (
                <span className="rh-pct">{m.growth > 0 ? `+${m.growth}%` : `${m.growth}%`}</span>
              )}
            </div>
          )}
          <span className="rh-hero-sub">sales revenue</span>
        </div>

        {/* bar chart */}
        <div className="rh-chart-wrap">
          <div className="rh-bars">
            {m.buckets.map((b, i) => {
              const bright = selBar === -1 || i === m.selectedIdx;
              const hPx =
                b.valueCents <= 0
                  ? 6
                  : Math.round((b.valueCents / m.maxVal) * 262);
              return (
                <button
                  key={`${tf}-${i}`}
                  type="button"
                  className="rh-bar-btn"
                  onClick={() => setSelBar(selBar === i ? -1 : i)}
                >
                  <span
                    className="rh-bar"
                    style={{ height: hPx, background: bright ? ACCENT : BAR_DIM }}
                  />
                  <span className="rh-bar-label">{b.label}</span>
                </button>
              );
            })}
          </div>

          {/* range chips */}
          <div className="rh-segs-row">
            <div className="rh-segs">
              {RANGES.map((k) => {
                const active = k === tf;
                return (
                  <button
                    key={k}
                    type="button"
                    className="rh-seg"
                    style={{
                      background: active ? ACTIVE : "transparent",
                      color: active ? NAVY : "#6B7BB8",
                      fontWeight: active ? 700 : 600,
                    }}
                    onClick={() => {
                      setTf(k);
                      setSelBar(-1);
                    }}
                  >
                    {k[0].toUpperCase() + k.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* week breakdown */}
        <div className="rh-breakdown">
          <div className="rh-bd-head">
            <span className="rh-bd-title">{tf.toUpperCase()} BREAKDOWN</span>
            <span className="rh-bd-hint">tap a bar</span>
          </div>
          <div className="rh-bd-body">
            <span className="rh-bd-col">
              <span className="rh-bd-amt">{breakdownAmt}</span>
              <span className="rh-bd-label">
                {(m.selected?.label ?? "").toString().toLowerCase()}
                {bestLabel}
              </span>
            </span>
            <span className="rh-bd-col">
              <span className="rh-bd-avg">{fmtDollars(avgCents)}</span>
              <span className="rh-bd-muted">average</span>
            </span>
            <span className="rh-bd-share">
              <span className="rh-bd-share-top">
                <span className="rh-bd-pct">{sharePct}%</span>
                <span className="rh-bd-muted">of the {tf}</span>
              </span>
              <span className="rh-bd-track">
                <span className="rh-bd-fill" style={{ width: `${sharePct}%` }} />
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* ── RIGHT COLUMN ── */}
      <div className="rh-right">
        {/* store health */}
        <div className="rh-health" data-tutorial-id="retail-home-health">
          {healthBox && m.detail[healthBox] ? (
            <div className="rh-hdet">
              <div className="rh-hdet-head">
                <span className="rh-bd-title">{m.detail[healthBox].title}</span>
                <button type="button" className="rh-hdet-back" aria-label="close" onClick={() => setHealthBox(null)}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </div>
              <div className="rh-hdet-rows">
                {m.detail[healthBox].rows.length === 0 ? (
                  <div className="rh-empty">nothing here right now</div>
                ) : (
                  m.detail[healthBox].rows.map((r, i) => (
                    <div key={i} className="rh-hdet-row">
                      <span className="rh-hdet-name">{r.name}</span>
                      <span className="rh-hdet-sub">{r.sub}</span>
                      <span className="rh-hdet-amt" style={{ color: r.col }}>{r.amt}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="rh-health-head">
                <span className="rh-bd-title">STORE HEALTH</span>
                <span className="rh-bd-hint">tap a number</span>
              </div>
              <div className="rh-health-body">
                {m.health.map((st, i) => (
                  <button
                    key={st.k}
                    type="button"
                    className="rh-stat"
                    style={{
                      borderLeft: i ? "1px solid rgba(94,158,255,0.2)" : "none",
                      paddingLeft: i ? 22 : 0,
                    }}
                    onClick={() => setHealthBox(st.k)}
                  >
                    <span className="rh-stat-top">
                      <span className="rh-stat-v" style={{ color: st.col }}>{m.isLoading ? "—" : st.v}</span>
                      <span className="rh-stat-n">{m.isLoading ? "" : st.n}</span>
                    </span>
                    <span className="rh-stat-label">{st.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* notifications */}
        <div className="rh-notif" data-tutorial-id="retail-home-notifications" style={{ height: notifOpen ? 194 : 108 }}>
          <span className="rh-notif-glow" />
          {/* collapsed preview */}
          <button
            type="button"
            className="rh-notif-prev"
            style={{ opacity: notifOpen ? 0 : 1, pointerEvents: notifOpen ? "none" : "auto" }}
            onClick={() => setNotifOpen(true)}
          >
            <span className="rh-slot">
              <span className="rh-slot-a" />
              <span className="rh-slot-b" />
              <span className="rh-slot-c">
                <span className="rh-slot-dot" />
                <span className="rh-slot-line" />
                <span className="rh-slot-tag" />
              </span>
            </span>
            <span className="rh-notif-foot">
              <span className="rh-notif-count">
                <span className="rh-notif-badge">{notifications.length}</span>
                <span>notifications</span>
              </span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(191,209,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </span>
          </button>
          {/* expanded list */}
          <div
            className="rh-notif-list"
            style={{ opacity: notifOpen ? 1 : 0, pointerEvents: notifOpen ? "auto" : "none" }}
          >
            <button type="button" className="rh-notif-listhead" onClick={() => setNotifOpen(false)}>
              <span className="rh-notif-count">
                <span className="rh-notif-badge">{notifications.length}</span>
                <span>notifications</span>
              </span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(191,209,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
            </button>
            <div className="rh-notif-rows">
              {notifications.length === 0 ? (
                <div className="rh-empty">you're all caught up</div>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className="rh-notif-item">
                    <span className="rh-notif-dot" style={{ background: notifDot(n.type) }} />
                    <span className="rh-notif-text">{n.title}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* search + view sales */}
        <div className="rh-search-row">
          <div className="rh-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.8-3.8" /></svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search sales"
              aria-label="search sales"
            />
          </div>
          <button type="button" className="rh-viewsales" aria-label="view sales" onClick={go("/transactions")}>
            view sales
          </button>
        </div>

        {/* recent sales */}
        <div className="rh-sales">
          {m.isLoading ? (
            <div className="rh-empty">loading…</div>
          ) : filteredRecent.length === 0 ? (
            <div className="rh-empty">{search ? "no matching sales" : "no sales yet"}</div>
          ) : (
            filteredRecent.slice(0, 3).map((t) => (
              <div key={t.id} className="rh-sale">
                <span className="rh-sale-avatar">{t.initials}</span>
                <span className="rh-sale-mid">
                  <span className="rh-sale-name">{t.name}</span>
                  <span className="rh-sale-sub">{t.sub}</span>
                </span>
                <span className="rh-sale-right">
                  <span className="rh-sale-amt">{t.amt}</span>
                  <span className="rh-sale-status">{t.status}</span>
                </span>
              </div>
            ))
          )}
        </div>

        {/* quick actions */}
        <div className="rh-actions">
          <button type="button" className="rh-action rh-action-primary" data-tutorial-id="retail-home-new-sale" aria-label="new sale" onClick={go("/terminal")}>
            <span className="rh-action-glow" />
            <svg className="rh-action-ico" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            <span className="rh-action-label" style={{ color: NAVY }}>new<br />sale</span>
          </button>
          <button type="button" className="rh-action" data-tutorial-id="retail-home-stock" aria-label="manage stock" onClick={go("/stock")}>
            <span className="rh-action-glow" />
            <svg className="rh-action-ico" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#CFE0FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v8" /></svg>
            <span className="rh-action-label">manage<br />stock</span>
          </button>
          <button type="button" className="rh-action" data-tutorial-id="retail-home-sales" aria-label="view sales" onClick={go("/transactions")}>
            <span className="rh-action-glow" />
            <svg className="rh-action-ico" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#CFE0FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16" /><path d="M7 16v-5" /><path d="M12 16V8" /><path d="M17 16v-3" /></svg>
            <span className="rh-action-label">view<br />sales</span>
          </button>
        </div>
      </div>
    </DesktopPageScaffold>
  );
}

/* ── page-scoped CSS — ports the design's inline styles + hovers/animations ── */
const RH_CSS = `
.rh-left { position:absolute; left:52px; top:26px; width:440px; display:flex; flex-direction:column; }
.rh-right { position:absolute; left:588px; top:53px; width:481px; height:688px; display:flex; flex-direction:column; }

.rh-scope { align-self:flex-start; display:inline-flex; align-items:center; gap:9px; padding:10px 20px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); font-size:13.5px; color:${ACCENT_SOFT}; cursor:pointer; transition:background .18s ease; }
.rh-scope:hover { background:rgba(94,158,255,0.08); }

.rh-hero { margin-top:22px; }
.rh-hero-row { display:flex; align-items:flex-start; gap:16px; }
.rh-amount { font-family:'Outfit',sans-serif; font-weight:700; font-size:84px; line-height:0.92; letter-spacing:-0.015em; color:${ACCENT}; font-variant-numeric:tabular-nums; }
.rh-pct { margin-top:8px; padding:7px 14px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); font-weight:700; font-size:13.5px; color:${ACCENT_SOFT}; white-space:nowrap; }
.rh-hero-sub { display:block; margin-top:8px; font-weight:300; font-size:16px; color:${NAV_DIM}; }
.rh-error { display:flex; align-items:center; justify-content:space-between; gap:12px; height:78px; padding:0 18px; border-radius:14px; background:rgba(240,101,108,0.14); border:1px solid rgba(240,101,108,0.32); }
.rh-error span { color:#FFB3B8; font-size:13.5px; }
.rh-error button { background:${ACCENT}; color:${NAVY}; border-radius:10px; padding:8px 14px; font-size:12px; font-weight:700; cursor:pointer; }

.rh-chart-wrap { margin-top:36px; }
.rh-bars { display:flex; align-items:flex-end; gap:16px; height:298px; }
.rh-bar-btn { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:12px; height:100%; cursor:pointer; }
.rh-bar { width:100%; max-width:36px; border-radius:10px; transition:height .3s ease, background .2s ease; }
.rh-bar-label { font-weight:400; font-size:21px; color:${ACCENT}; }
.rh-segs-row { margin-top:16px; display:flex; justify-content:center; }
.rh-segs { display:flex; align-items:center; padding:4px; border-radius:9999px; background:${CHIP}; }
.rh-seg { padding:9px 0; width:76px; border-radius:9999px; font-size:12px; cursor:pointer; transition:background .18s ease, color .18s ease; }

.rh-breakdown { margin-top:24px; height:138px; border-radius:12px; border:1.5px solid rgba(94,158,255,0.5); padding:18px 22px; display:flex; flex-direction:column; justify-content:space-between; }
.rh-bd-head { display:flex; align-items:center; justify-content:space-between; }
.rh-bd-title { font-weight:300; font-size:11px; letter-spacing:0.22em; color:${ACCENT_SOFT}; }
.rh-bd-hint { font-weight:300; font-size:11px; color:rgba(244,246,255,0.4); }
.rh-bd-body { display:flex; align-items:flex-end; gap:26px; }
.rh-bd-col { display:flex; flex-direction:column; gap:3px; }
.rh-bd-amt { font-family:'Outfit',sans-serif; font-weight:800; font-size:30px; line-height:1; color:${TEXT_SOFT}; }
.rh-bd-label { font-weight:300; font-size:12px; color:${ACCENT_SOFT}; text-transform:capitalize; }
.rh-bd-avg { font-family:'Outfit',sans-serif; font-weight:800; font-size:20px; line-height:1; color:rgba(244,246,255,0.75); }
.rh-bd-muted { font-weight:300; font-size:11px; color:rgba(244,246,255,0.45); }
.rh-bd-share { flex:1; display:flex; flex-direction:column; gap:7px; }
.rh-bd-share-top { display:flex; align-items:baseline; justify-content:space-between; }
.rh-bd-pct { font-weight:800; font-size:13px; color:${ACCENT}; }
.rh-bd-track { display:block; height:5px; border-radius:3px; background:rgba(94,158,255,0.18); overflow:hidden; }
.rh-bd-fill { display:block; height:100%; border-radius:3px; background:${ACCENT}; transition:width .3s ease; }

.rh-health { height:182px; border-radius:16px; border:1.5px solid rgba(94,158,255,0.5); padding:18px 24px; display:flex; flex-direction:column; overflow:hidden; }
.rh-health-head { display:flex; align-items:center; justify-content:space-between; }
.rh-health-body { flex:1; display:flex; align-items:center; }
.rh-stat { flex:1; display:flex; flex-direction:column; align-items:flex-start; gap:4px; cursor:pointer; }
.rh-stat-top { display:flex; align-items:baseline; gap:7px; }
.rh-stat-v { font-family:'Outfit',sans-serif; font-weight:800; font-size:34px; line-height:1; }
.rh-stat-n { font-weight:400; font-size:13px; color:rgba(244,246,255,0.55); }
.rh-stat-label { font-weight:300; font-size:12.5px; color:${ACCENT_SOFT}; }
.rh-hdet { animation:tileIn .3s cubic-bezier(.22,.9,.3,1) both; display:flex; flex-direction:column; flex:1; min-height:0; }
.rh-hdet-head { display:flex; align-items:center; justify-content:space-between; }
.rh-hdet-back { width:26px; height:26px; border-radius:50%; border:1px solid rgba(94,158,255,0.5); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background .18s ease; }
.rh-hdet-back:hover { background:rgba(94,158,255,0.1); }
.rh-hdet-rows { margin-top:8px; display:flex; flex-direction:column; flex:1; min-height:0; overflow-y:auto; }
.rh-hdet-row { display:flex; align-items:center; gap:12px; padding:7px 0; border-bottom:1px solid rgba(94,158,255,0.12); }
.rh-hdet-name { font-weight:600; font-size:12.5px; color:${TEXT_SOFT}; flex:1; min-width:0; text-transform:capitalize; }
.rh-hdet-sub { font-weight:300; font-size:11.5px; color:rgba(244,246,255,0.5); }
.rh-hdet-amt { font-family:'Outfit',sans-serif; font-weight:700; font-size:13.5px; }

.rh-notif { position:relative; flex:0 0 auto; margin-top:26px; border-radius:16px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); overflow:hidden; transition:height .42s cubic-bezier(.22,.9,.3,1); }
.rh-notif-glow { position:absolute; left:-20%; top:-70%; width:140%; height:240%; border-radius:50%; background:radial-gradient(closest-side,rgba(102,169,255,0.18),transparent 70%); animation:glowDrift 10s ease-in-out -5s infinite; pointer-events:none; }
.rh-notif-prev { position:absolute; inset:0; padding:14px 18px; display:flex; flex-direction:column; justify-content:space-between; cursor:pointer; transition:opacity .26s ease; text-align:left; }
.rh-slot { position:relative; height:46px; display:block; }
.rh-slot-a { position:absolute; left:26px; right:26px; top:0; height:22px; border-radius:8px; background:rgba(255,255,255,0.10); }
.rh-slot-b { position:absolute; left:14px; right:14px; top:6px; height:26px; border-radius:9px; background:rgba(255,255,255,0.18); box-shadow:0 4px 10px rgba(0,4,20,0.28); }
.rh-slot-c { position:absolute; left:4px; right:4px; top:12px; height:32px; border-radius:10px; background:rgba(238,243,255,0.92); box-shadow:0 8px 16px rgba(0,4,20,0.34); display:flex; align-items:center; gap:8px; padding:0 12px; }
.rh-slot-dot { width:6px; height:6px; border-radius:50%; background:${GREEN}; flex:0 0 auto; }
.rh-slot-line { flex:1; height:6px; border-radius:3px; background:rgba(20,30,60,0.16); }
.rh-slot-tag { width:26px; height:6px; border-radius:3px; background:rgba(20,30,60,0.10); flex:0 0 auto; }
.rh-notif-foot { display:flex; align-items:center; justify-content:space-between; }
.rh-notif-count { display:flex; align-items:center; gap:7px; font-weight:300; font-size:11.5px; color:rgba(191,209,255,0.85); }
.rh-notif-badge { width:16px; height:16px; border-radius:50%; background:rgba(255,255,255,0.16); color:#fff; font-weight:700; font-size:9px; display:flex; align-items:center; justify-content:center; }
.rh-notif-list { position:absolute; inset:0; padding:14px 16px 10px; display:flex; flex-direction:column; transition:opacity .3s ease .05s; }
.rh-notif-listhead { display:flex; align-items:center; justify-content:space-between; flex:0 0 auto; padding:0 2px 8px; cursor:pointer; }
.rh-notif-rows { flex:1; min-height:0; overflow-y:auto; display:flex; flex-direction:column; gap:6px; padding-right:4px; }
.rh-notif-item { flex:0 0 auto; display:flex; align-items:center; gap:9px; padding:11px 12px; border-radius:9px; background:rgba(255,255,255,0.07); box-shadow:inset 0 1px 0 rgba(255,255,255,0.08); }
.rh-notif-dot { width:6px; height:6px; border-radius:50%; flex:0 0 auto; }
.rh-notif-text { flex:1; font-weight:300; font-size:11.5px; color:#E8F0FF; min-width:0; }

.rh-search-row { margin-top:24px; display:flex; align-items:center; gap:14px; }
.rh-search { flex:1; display:flex; align-items:center; gap:10px; height:44px; padding:0 18px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); }
.rh-search input { flex:1; border:none; background:transparent; outline:none; color:#fff; font-family:'Outfit',sans-serif; font-weight:500; font-size:13px; }
.rh-viewsales { display:inline-flex; align-items:center; height:44px; padding:0 22px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); font-weight:600; font-size:13px; color:${TEXT_SOFT}; cursor:pointer; transition:background .18s ease; }
.rh-viewsales:hover { background:rgba(94,158,255,0.08); }

.rh-sales { margin-top:20px; display:flex; flex-direction:column; gap:18px; flex:0 1 auto; min-height:0; overflow:hidden; }
.rh-sale { display:flex; align-items:center; gap:14px; }
.rh-sale-avatar { width:44px; height:44px; border-radius:50%; border:1.5px solid rgba(94,158,255,0.8); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px; color:#fff; flex:0 0 auto; text-transform:uppercase; }
.rh-sale-mid { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
.rh-sale-name { font-weight:300; font-size:14.5px; color:${TEXT_SOFT}; text-transform:capitalize; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rh-sale-sub { font-weight:500; font-size:12px; color:rgba(244,246,255,0.5); }
.rh-sale-right { display:flex; flex-direction:column; align-items:flex-end; gap:1px; }
.rh-sale-amt { font-weight:800; font-size:15.5px; color:#fff; }
.rh-sale-status { font-weight:600; font-size:9px; color:rgba(244,246,255,0.5); }

.rh-actions { margin-top:26px; display:flex; gap:14px; }
.rh-action { position:relative; flex:1; height:88px; border-radius:14px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); overflow:hidden; cursor:pointer; text-align:left; transition:background .18s ease; }
.rh-action:hover { background:rgba(255,255,255,0.1); }
.rh-action-primary { background:${ACTIVE}; border:none; box-shadow:inset 0 1px 0 rgba(255,255,255,0.3); }
.rh-action-primary:hover { background:#79B4FF; }
.rh-action-glow { position:absolute; left:-22%; top:-58%; width:144%; height:216%; border-radius:50%; background:radial-gradient(closest-side,rgba(102,169,255,0.18),transparent 70%); animation:glowDrift 11s ease-in-out infinite; pointer-events:none; }
.rh-action-primary .rh-action-glow { background:radial-gradient(closest-side,rgba(255,255,255,0.22),transparent 70%); }
.rh-action-ico { position:absolute; top:12px; right:12px; }
.rh-action-label { position:absolute; left:14px; bottom:12px; font-weight:500; font-size:13.5px; line-height:1.25; color:#E8F0FF; }

.rh-empty { display:flex; align-items:center; justify-content:center; flex:1; min-height:64px; font-weight:300; font-size:12.5px; color:rgba(191,209,255,0.5); }
.rh-skel { background:rgba(94,158,255,0.2); animation:rhSkel 1.1s ease-in-out infinite; }
@keyframes rhSkel { 0%,100% { opacity:0.45; } 50% { opacity:1; } }
`;
