import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCurrentMerchantId } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
const DEEP_BLUE = "#1D48C8";
const KP_INK = "#C6CFE2";
const GREEN = "#35D07F";
const RED = "#F0656C";
const AMBER = "#F0A34E";
const VIOLET = "#9DBCFF";

type Mode = "send" | "keypad" | "stock" | "split" | "share";

interface Tx {
  id: number;
  status: string;
  itemName?: string;
  price?: string;
  taptStoneId?: number | null;
  isSplit?: boolean | null;
  totalSplits?: number | null;
  completedSplits?: number | null;
  splitAmount?: string | null;
  createdAt: string;
}
interface StockItem {
  id: number;
  name: string;
  cost: string | number;
  emoji?: string | null;
}
interface Stone {
  id: number;
  name: string;
  stoneNumber: number;
  paymentUrl?: string | null;
  qrCodeUrl?: string | null;
}

const num = (p: unknown) => parseFloat(String(p ?? "0") || "0") || 0;
const money2 = (n: number) =>
  "$" + n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyWhole = (n: number) => "$" + Math.round(n).toLocaleString("en-NZ");

/* Keypad entry is a raw string ("15.5") formatted exactly as the prototype does. */
function kpMoney(v: string): string {
  if (!v) return "$0.00";
  const [rawD, rawC] = v.split(".");
  const d = (rawD || "0").replace(/^0+(?=\d)/, "");
  const dn = Number(d).toLocaleString("en-NZ");
  if (v.includes(".")) return "$" + dn + "." + ((rawC || "") + "00").slice(0, 2);
  return "$" + dn + ".00";
}

function initials(name: string): string {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter((p) => /^[a-z0-9]/i.test(p));
  if (parts.length === 0) return "–";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

type Bucket = "awaiting" | "paid" | "failed" | "refunded";

/* Raw transaction status → the design's stack buckets. */
function statusMeta(status: string): { bucket: Bucket; label: string; dot: string } {
  switch (status) {
    case "completed":
      return { bucket: "paid", label: "paid", dot: GREEN };
    case "failed":
    case "cancelled":
      return { bucket: "failed", label: status === "cancelled" ? "cancelled" : "failed", dot: RED };
    case "refunded":
      return { bucket: "refunded", label: "refunded", dot: VIOLET };
    case "partially_refunded":
      return { bucket: "refunded", label: "partly refunded", dot: VIOLET };
    default:
      return { bucket: "awaiting", label: "awaiting payment", dot: AMBER };
  }
}

const STACK_FILTERS = ["all", "awaiting payment", "paid", "failed"] as const;
type StackFilter = (typeof STACK_FILTERS)[number];
const FILTER_BUCKET: Record<StackFilter, Bucket | null> = {
  all: null,
  "awaiting payment": "awaiting",
  paid: "paid",
  failed: "failed",
};

const KP_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "<"] as const;
const QUICK_AMTS = ["5", "10", "15", "20"] as const;
const SPLIT_WAYS = [2, 3, 4, 6] as const;

export default function DesktopRetailTerminal(props: DesktopRoutePageProps) {
  const merchantId = getCurrentMerchantId();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>("send");
  const [amount, setAmount] = useState(0);
  const [kpVal, setKpVal] = useState("");
  const [itemName, setItemName] = useState("");
  const [via, setVia] = useState<"paywave" | "boards">("paywave");
  const [stoneId, setStoneId] = useState<number | null>(null);
  const [splitOn, setSplitOn] = useState(false);
  const [splitN, setSplitN] = useState<number>(2);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StackFilter>("all");
  const [sendFlash, setSendFlash] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const authFetch = async (path: string) => {
    const token = localStorage.getItem("authToken");
    const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(path);
    return res.json();
  };

  const merchantQuery = useQuery<any>({
    queryKey: ["/api/merchants", merchantId],
    queryFn: () => authFetch(`/api/merchants/${merchantId}`),
    enabled: !!merchantId,
  });

  const txQuery = useQuery<Tx[]>({
    queryKey: ["/api/merchants", merchantId, "transactions"],
    queryFn: () => authFetch(`/api/merchants/${merchantId}/transactions`),
    refetchInterval: 5000,
    enabled: !!merchantId,
  });

  const stockQuery = useQuery<StockItem[]>({
    queryKey: ["/api/merchants", merchantId, "stock-items"],
    queryFn: () => authFetch(`/api/merchants/${merchantId}/stock-items`),
    enabled: !!merchantId,
  });

  const stonesQuery = useQuery<Stone[]>({
    queryKey: ["/api/merchants", merchantId, "tapt-stones"],
    queryFn: () => authFetch(`/api/merchants/${merchantId}/tapt-stones`),
    enabled: !!merchantId,
  });

  const transactions = txQuery.data ?? [];
  const stockItems = stockQuery.data ?? [];
  const stones = stonesQuery.data ?? [];
  const merchant = merchantQuery.data;

  /* Payment links come from the server (merchant + per-board), same as mobile. */
  const merchantLink: string =
    merchant?.paymentUrl ||
    (typeof window !== "undefined" && merchantId ? `${window.location.origin}/pay/${merchantId}` : "");

  const createMutation = useMutation({
    mutationFn: async (body: {
      itemName: string;
      price: string;
      splitEnabled: boolean;
      selectedStoneId?: number;
    }) => {
      const res = await apiRequest("POST", "/api/transactions", {
        merchantId,
        itemName: body.itemName,
        price: body.price,
        status: "pending",
        splitEnabled: body.splitEnabled,
        ...(body.selectedStoneId ? { selectedStoneId: body.selectedStoneId } : {}),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "active-transaction"] });
      setSendFlash(true);
      setTimeout(() => setSendFlash(false), 1600);
      setItemName("");
      setAmount(0);
      setSplitOn(false);
      setMode("send");
    },
    onError: () => {
      /* 402 BILLING_CARD_REQUIRED surfaces its own persistent warning via apiRequest. */
      toast({ title: "Couldn't start the sale", description: "Please try again", variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (transactionId: number) => {
      const res = await apiRequest("POST", `/api/transactions/${transactionId}/cancel`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "active-transaction"] });
      toast({ title: "Transaction cancelled" });
      setExpandedId(null);
    },
    onError: () => toast({ title: "Failed to cancel", variant: "destructive" }),
  });

  /* ── derived ── */
  const { revenueToday, txnsToday, pctVsYesterday } = useMemo(() => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const prevStart = new Date(dayStart.getTime() - 86_400_000);

    let today = 0;
    let yesterday = 0;
    let count = 0;
    for (const t of transactions) {
      const at = new Date(t.createdAt);
      if (at >= dayStart) {
        count += 1;
        if (t.status === "completed") today += num(t.price);
      } else if (at >= prevStart) {
        if (t.status === "completed") yesterday += num(t.price);
      }
    }
    return {
      revenueToday: today,
      txnsToday: count,
      pctVsYesterday: yesterday > 0 ? Math.round(((today - yesterday) / yesterday) * 100) : null,
    };
  }, [transactions]);

  const stackRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const want = FILTER_BUCKET[filter];
    return [...transactions]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((t) => ({ ...t, meta: statusMeta(t.status) }))
      .filter((t) => (want === null ? true : t.meta.bucket === want))
      .filter((t) => (t.itemName ?? "").toLowerCase().includes(q));
  }, [transactions, search, filter]);

  const splitEach = splitN > 0 ? amount / splitN : amount;
  const boardsReady = via === "boards" && stones.length > 0;
  const activeStone = boardsReady ? (stones.find((s) => s.id === stoneId) ?? stones[0]) : undefined;

  /* ── actions ── */
  const send = (withSplit: boolean) => {
    if (amount <= 0) {
      toast({ title: "Enter an amount first", variant: "destructive" });
      return;
    }
    if (!itemName.trim()) {
      toast({ title: "Item name is required", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      itemName: itemName.trim(),
      price: amount.toFixed(2),
      splitEnabled: withSplit,
      selectedStoneId: activeStone?.id,
    });
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
  const commitKeypad = () => {
    setAmount(num(kpVal));
    setKpVal("");
    setMode("send");
  };
  const cancelKeypad = () => {
    setKpVal("");
    setMode("send");
  };

  const pickStock = (item: StockItem) => {
    setItemName(item.name);
    setAmount(num(item.cost));
    setMode("send");
  };

  const pickVia = (v: "paywave" | "boards") => {
    setVia(v);
    if (v === "boards" && stoneId === null && stones.length > 0) setStoneId(stones[0].id);
  };

  const copyLink = async (url: string, key: string) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1500);
      toast({ title: "Link copied", description: "Payment link copied to clipboard" });
    } catch {
      toast({ title: "Copy failed", description: "Unable to copy payment link", variant: "destructive" });
    }
  };

  const shareVia = (method: "email" | "sms", url: string) => {
    if (!url) return;
    if (method === "email") {
      const subject = encodeURIComponent(`Payment Request - ${merchant?.businessName || "Payment"}`);
      const body = encodeURIComponent(`Please complete your payment using this link: ${url}`);
      window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
    } else {
      window.open(`sms:?body=${encodeURIComponent(`Payment link: ${url}`)}`, "_blank");
    }
  };

  const openQr = () => {
    const qr = activeStone?.qrCodeUrl || merchant?.qrCodeUrl;
    if (!qr) {
      toast({ title: "No QR code yet", description: "Your payment QR is generated with your first board" });
      return;
    }
    window.open(qr, "_blank");
  };

  /* rail button helper */
  const railBtn = (m: Mode, big: boolean, path: JSX.Element, label: string) => {
    const on = mode === m;
    return (
      <button
        type="button"
        className={big ? "rt-rail-btn rt-rail-big" : "rt-rail-btn"}
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

  const chipStyle = (on: boolean, borderWidth = 1) => ({
    border: on ? `${borderWidth}px solid transparent` : `${borderWidth}px solid rgba(94,158,255,0.5)`,
    background: on ? ACTIVE : "transparent",
    color: on ? NAVY : ACCENT_SOFT,
    fontWeight: on ? 700 : 600,
  });

  const sendLabel = sendFlash
    ? "payment sent ✓"
    : createMutation.isPending
      ? "sending…"
      : "send payment";

  return (
    <DesktopPageScaffold {...props} vertical="retail" page="terminal" showScope={false}>
      <style>{RT_CSS}</style>
      <div className="rt-body">
        {/* ── LEFT ── */}
        <div className="rt-left">
          <div>
            <button type="button" className="rt-scope" aria-label="my store scope" aria-haspopup="listbox">
              <span>my store</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>
          </div>

          <div className="rt-hero-row">
            <span className="rt-hero">{txQuery.isLoading ? "—" : moneyWhole(revenueToday)}</span>
            {pctVsYesterday !== null && (
              <span className="rt-hero-pill">
                {pctVsYesterday >= 0 ? "+" : ""}
                {pctVsYesterday}%
              </span>
            )}
          </div>
          <span className="rt-hero-sub">sales revenue today</span>
          <span className="rt-hero rt-hero-dim">{txQuery.isLoading ? "—" : txnsToday}</span>
          <span className="rt-hero-sub rt-hero-sub-dim">transactions today</span>

          <div className="rt-stack">
            <div className="rt-stack-head">
              <span className="rt-stack-title">
                <span>active stack</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 14 6-6 6 6" /></svg>
              </span>
              <div className="rt-stack-search">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.8-3.8" /></svg>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="search sales"
                  aria-label="search active stack"
                />
              </div>
            </div>

            <div className="rt-chips">
              {STACK_FILTERS.map((f) => (
                <button key={f} type="button" className="rt-chip" style={chipStyle(f === filter)} onClick={() => setFilter(f)}>
                  {f}
                </button>
              ))}
            </div>

            <div className="rt-rows">
              {txQuery.isLoading ? (
                <div className="rt-empty">loading…</div>
              ) : stackRows.length === 0 ? (
                <div className="rt-empty">no sales yet</div>
              ) : (
                stackRows.map((r) => {
                  const live = r.meta.bucket === "awaiting";
                  const open = expandedId === r.id;
                  const stone = stones.find((s) => s.id === r.taptStoneId);
                  const rowLink = stone?.paymentUrl || merchantLink;
                  return (
                    <div key={r.id} className="rt-row-wrap">
                      <div
                        className={live ? "rt-row rt-row-live" : "rt-row"}
                        role={live ? "button" : undefined}
                        tabIndex={live ? 0 : undefined}
                        aria-expanded={live ? open : undefined}
                        onClick={live ? () => setExpandedId(open ? null : r.id) : undefined}
                        onKeyDown={
                          live
                            ? (e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setExpandedId(open ? null : r.id);
                                }
                              }
                            : undefined
                        }
                      >
                        <span className="rt-avatar">{initials(r.itemName || "sale")}</span>
                        <span className="rt-row-mid">
                          <span className="rt-row-name">{r.itemName || "sale"}</span>
                          <span className="rt-row-status">
                            <span className="rt-dot" style={{ background: r.meta.dot }} />
                            {r.meta.label}
                            {r.isSplit ? ` · ${r.completedSplits ?? 0}/${r.totalSplits ?? 1} split` : ""}
                          </span>
                        </span>
                        <span className="rt-row-amt">{money2(num(r.price))}</span>
                      </div>
                      {live && open && (
                        <div className="rt-row-actions">
                          <button type="button" className="rt-row-act" onClick={() => copyLink(rowLink, `tx-${r.id}`)}>
                            {copiedKey === `tx-${r.id}` ? "copied ✓" : "copy link"}
                          </button>
                          <button
                            type="button"
                            className="rt-row-act rt-row-act-danger"
                            disabled={cancelMutation.isPending}
                            onClick={() => cancelMutation.mutate(r.id)}
                          >
                            {cancelMutation.isPending ? "cancelling…" : "cancel"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ── CENTER RAIL ── */}
        <div className="rt-rail-slot">
          <div className="rt-rail">
            {railBtn("stock", false, (<><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>), "stock tiles")}
            {railBtn("split", false, (<><path d="M12 3v7" /><path d="M12 10l-6 8" /><path d="M12 10l6 8" /></>), "split bill")}
            {railBtn("keypad", true, (<path d="M12 5v14M5 12h14" />), "keypad")}
            {railBtn("share", false, (<><circle cx="18" cy="5" r="2.6" /><circle cx="6" cy="12" r="2.6" /><circle cx="18" cy="19" r="2.6" /><path d="m8.3 10.7 7.4-4.4M8.3 13.3l7.4 4.4" /></>), "share payment link")}
            {railBtn("send", false, (<><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></>), "compose sale")}
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="rt-panel">
          {mode === "send" && (
            <>
              <div className="rt-mode rt-send-top">
                <div className="rt-amt-row">
                  <span className="rt-amt">{money2(amount)}</span>
                  <button type="button" className="rt-edit" onClick={openKeypad}>edit&gt;</button>
                </div>
                <div className="rt-via">
                  {(["paywave", "boards"] as const).map((v) => (
                    <button key={v} type="button" className="rt-via-chip" style={chipStyle(v === via, 1.5)} onClick={() => pickVia(v)}>
                      {v}
                    </button>
                  ))}
                </div>
                {via === "boards" && (
                  stones.length === 0 ? (
                    <div className="rt-board-hint">no boards yet — add one from the terminal on your phone</div>
                  ) : (
                    <div className="rt-boards">
                      {stones.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="rt-board-chip"
                          style={chipStyle(s.id === activeStone?.id, 1)}
                          onClick={() => setStoneId(s.id)}
                        >
                          {s.name || `board ${s.stoneNumber}`}
                        </button>
                      ))}
                    </div>
                  )
                )}
                <div className="rt-item-name">{itemName || "new sale"}</div>
                <div className="rt-item-hint">tap send to share payment</div>
              </div>

              <div className="rt-send-lower">
                <div className="rt-field">
                  <span className="rt-field-label">ITEM NAME</span>
                  <input
                    className="rt-name-input"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="enter item name or tap a stock tile"
                    aria-label="item name"
                  />
                </div>
                <div className="rt-split-toggle">
                  <span className="rt-split-text">
                    <span className="rt-split-cap">split bill</span>
                    <span className="rt-split-desc">customer chooses how many ways</span>
                  </span>
                  <button
                    type="button"
                    className="rt-switch"
                    role="switch"
                    aria-checked={splitOn}
                    aria-label="split bill"
                    style={{ background: splitOn ? ACTIVE : "rgba(94,158,255,0.3)" }}
                    onClick={() => setSplitOn((s) => !s)}
                  >
                    <span className="rt-knob" style={{ transform: splitOn ? "translateX(19px)" : "translateX(0)" }} />
                  </button>
                </div>
                <span className="rt-fee">TaptPay fee: 10¢ per transaction</span>
                <button
                  type="button"
                  className="rt-send-btn"
                  aria-label="send payment"
                  disabled={createMutation.isPending}
                  style={sendFlash ? { borderColor: GREEN, color: GREEN } : undefined}
                  onClick={() => send(splitOn)}
                >
                  {sendLabel}
                </button>
              </div>
            </>
          )}

          {mode === "keypad" && (
            <div className="rt-mode rt-keypad">
              <div className="rt-kp-head">
                <button type="button" className="rt-kp-circle" aria-label="cancel keypad" onClick={cancelKeypad}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
                <button type="button" className="rt-kp-circle" aria-label="confirm amount" onClick={commitKeypad}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L19 8" /></svg>
                </button>
              </div>
              <div className="rt-kp-amt">{kpMoney(kpVal)}</div>
              <div className="rt-kp-quick">
                {QUICK_AMTS.map((q) => (
                  <button key={q} type="button" className="rt-kp-quick-btn" onClick={() => setKpVal(q)}>${q}</button>
                ))}
              </div>
              <div className="rt-kp-hint">quick amounts or type it — ✓ starts the sale</div>
              <div className="rt-kp-grid">
                {KP_KEYS.map((k) => {
                  const fill = k !== "." && k !== "<";
                  return (
                    <button
                      key={k}
                      type="button"
                      className="rt-kp-key"
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

          {mode === "stock" && (
            <div className="rt-mode rt-stock">
              <div className="rt-stock-head">Stock — tap a tile to start a sale</div>
              <div className="rt-stock-grid">
                {stockQuery.isLoading ? (
                  <div className="rt-empty rt-stock-empty">loading…</div>
                ) : stockItems.length === 0 ? (
                  <div className="rt-empty rt-stock-empty">no products yet — add them on the Stock page</div>
                ) : (
                  stockItems.map((p) => (
                    <button key={p.id} type="button" className="rt-tile" onClick={() => pickStock(p)}>
                      <span className="rt-tile-ico">{p.emoji || "🏷️"}</span>
                      <span className="rt-tile-name">{p.name}</span>
                      <span className="rt-tile-price">{money2(num(p.cost))}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {mode === "split" && (
            <div className="rt-mode rt-split">
              <div className="rt-amt-row">
                <span className="rt-amt">{money2(amount)}</span>
                <span className="rt-split-lead">split the bill</span>
              </div>
              <div className="rt-item-name">{itemName || "new sale"}</div>
              <div className="rt-item-hint">customer chooses how many ways to split</div>
              <div className="rt-split-body">
                <div className="rt-split-chips">
                  {SPLIT_WAYS.map((n) => (
                    <button key={n} type="button" className="rt-split-chip" style={chipStyle(n === splitN, 1.5)} onClick={() => setSplitN(n)}>
                      {n} ways
                    </button>
                  ))}
                </div>
                <div className="rt-split-each">
                  <span>each pays</span>
                  <span className="rt-split-each-amt">{money2(splitEach)}</span>
                </div>
                <span className="rt-fee">equal split · customer can enter a different amount on their phone</span>
                <button
                  type="button"
                  className="rt-send-btn rt-send-btn-split"
                  aria-label="send split payment"
                  disabled={createMutation.isPending}
                  style={sendFlash ? { borderColor: GREEN, color: GREEN } : undefined}
                  onClick={() => send(true)}
                >
                  {sendLabel}
                </button>
              </div>
            </div>
          )}

          {mode === "share" && (
            <div className="rt-mode rt-share">
              <div className="rt-share-head">Share payment link</div>
              <div className="rt-share-sub">
                {(itemName || "current sale") + " · " + money2(amount) + " — anyone with the link can pay"}
              </div>
              <div className="rt-share-body">
                <div className="rt-share-link">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
                  <span className="rt-share-url">{merchantLink.replace(/^https?:\/\//, "") || "—"}</span>
                  <button type="button" className="rt-share-copy" onClick={() => copyLink(merchantLink, "merchant")}>
                    {copiedKey === "merchant" ? "copied ✓" : "copy link"}
                  </button>
                </div>
                <div className="rt-share-actions">
                  <button type="button" className="rt-share-act" onClick={() => shareVia("email", merchantLink)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7l10 7 10-7" /><rect x="2" y="5" width="20" height="14" rx="2" /></svg>
                    <span>email</span>
                  </button>
                  <button type="button" className="rt-share-act" onClick={() => shareVia("sms", merchantLink)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 4H4v12h4v4l5-4h7z" /></svg>
                    <span>sms</span>
                  </button>
                  <button type="button" className="rt-share-act" onClick={openQr}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="6" height="6" /><rect x="14" y="4" width="6" height="6" /><rect x="4" y="14" width="6" height="6" /><path d="M14 14h3v3h-3zM20 14v6h-6" /></svg>
                    <span>QR code</span>
                  </button>
                </div>
                <div className="rt-share-label">BOARD-SPECIFIC LINKS</div>
                {stones.length === 0 ? (
                  <div className="rt-empty rt-share-empty">no boards yet</div>
                ) : (
                  stones.map((s) => (
                    <div key={s.id} className="rt-board-row">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6" /></svg>
                      <span className="rt-board-name">{s.name || `board ${s.stoneNumber}`}</span>
                      <span className="rt-board-sub">QR + NFC · board {s.stoneNumber}</span>
                      <button
                        type="button"
                        className="rt-share-copy"
                        onClick={() => copyLink(s.paymentUrl || merchantLink, `stone-${s.id}`)}
                      >
                        {copiedKey === `stone-${s.id}` ? "copied ✓" : "copy"}
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

const RT_CSS = `
.rt-body { position:relative; display:flex; height:100%; box-sizing:border-box; padding:26px 46px 0 52px; }

/* ── left column ── */
.rt-left { flex:0 0 420px; display:flex; flex-direction:column; }
.rt-scope { display:inline-flex; align-items:center; gap:9px; padding:10px 20px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); font-weight:400; font-size:13.5px; color:${ACCENT_SOFT}; cursor:pointer; transition:background .18s ease; }
.rt-scope:hover { background:rgba(94,158,255,0.08); }
.rt-hero-row { margin-top:22px; display:flex; align-items:flex-start; gap:14px; }
.rt-hero { font-family:'Outfit',sans-serif; font-weight:700; font-size:84px; line-height:0.92; letter-spacing:-0.015em; color:${ACCENT}; font-variant-numeric:tabular-nums; }
.rt-hero-pill { margin-top:6px; padding:6px 13px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); font-weight:700; font-size:13px; color:${ACCENT_SOFT}; white-space:nowrap; }
.rt-hero-sub { margin-top:24px; font-weight:300; font-size:17px; color:${NAV_DIM}; }
.rt-hero-dim { margin-top:36px; font-size:56px; opacity:0.61; }
.rt-hero-sub-dim { margin-top:12px; opacity:0.61; }

.rt-stack { margin-top:auto; padding-bottom:24px; }
.rt-stack-head { display:flex; align-items:center; justify-content:space-between; }
.rt-stack-title { display:inline-flex; align-items:center; gap:6px; font-weight:300; font-size:12px; color:${ACCENT_SOFT}; }
.rt-stack-search { display:flex; align-items:center; gap:8px; width:180px; height:32px; padding:0 14px; box-sizing:border-box; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); }
.rt-stack-search input { flex:1; min-width:0; border:none; background:transparent; outline:none; color:#fff; font-family:'Outfit',sans-serif; font-weight:500; font-size:11px; }
.rt-chips { margin-top:12px; display:flex; gap:8px; }
.rt-chip { padding:6px 13px; border-radius:9999px; font-size:11px; cursor:pointer; transition:background .15s ease, color .15s ease; white-space:nowrap; }
.rt-rows { margin-top:8px; display:flex; flex-direction:column; max-height:290px; overflow-y:auto; scrollbar-width:none; }
.rt-rows::-webkit-scrollbar { display:none; }
.rt-row { display:flex; align-items:center; gap:13px; padding:9px 0; }
.rt-row-live { cursor:pointer; }
.rt-row-live:hover .rt-row-name { color:#fff; }
.rt-avatar { width:40px; height:40px; border-radius:50%; border:1.5px solid rgba(94,158,255,0.8); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:11px; color:#fff; flex:0 0 auto; text-transform:uppercase; box-sizing:border-box; }
.rt-row-mid { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
.rt-row-name { font-weight:700; font-size:13px; color:${TEXT_SOFT}; text-transform:lowercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; transition:color .15s ease; }
.rt-row-status { display:flex; align-items:center; gap:5px; font-weight:500; font-size:10.5px; color:rgba(244,246,255,0.5); }
.rt-dot { width:5px; height:5px; border-radius:50%; flex:0 0 auto; }
.rt-row-amt { font-weight:800; font-size:14.5px; color:#fff; font-variant-numeric:tabular-nums; }
.rt-row-actions { display:flex; gap:8px; padding:0 0 10px 53px; animation:tileIn .22s ease both; }
.rt-row-act { padding:6px 14px; border-radius:9999px; border:1px solid rgba(94,158,255,0.5); background:transparent; font-weight:600; font-size:11px; color:${ACCENT_SOFT}; cursor:pointer; transition:background .15s ease; }
.rt-row-act:hover:not(:disabled) { background:rgba(94,158,255,0.1); }
.rt-row-act:disabled { opacity:0.5; cursor:default; }
.rt-row-act-danger { border-color:rgba(240,101,108,0.5); color:${RED}; }
.rt-row-act-danger:hover:not(:disabled) { background:rgba(240,101,108,0.1); }
.rt-empty { padding:20px 0; font-weight:300; font-size:12.5px; color:rgba(191,209,255,0.5); }

/* ── centre rail (design places it absolutely at x=550) ── */
.rt-rail-slot { flex:0 0 76px; margin:175px 40px 0 44px; }
.rt-rail { position:absolute; left:550px; width:80px; box-sizing:border-box; border:1.5px solid rgba(94,158,255,0.7); border-radius:32px; padding:30px 0; display:flex; flex-direction:column; align-items:center; gap:40px; }
.rt-rail-btn { width:46px; height:46px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background .18s ease; }
.rt-rail-btn:hover { background:rgba(94,158,255,0.14); }
.rt-rail-big { width:54px; height:54px; background:${ACTIVE}; box-shadow:0 8px 20px rgba(102,169,255,0.35); }
.rt-rail-big:hover { background:${ACTIVE}; opacity:0.9; }

/* ── right panel ── */
.rt-panel { flex:1; min-width:0; padding-left:36px; box-sizing:border-box; position:relative; }
.rt-mode { animation:tileIn .35s cubic-bezier(.22,.9,.3,1) both; }

/* send: design pins the two blocks at screen y=154 / y=512 (panel origin = y 92) */
.rt-send-top { position:absolute; top:62px; width:445px; }
.rt-send-lower { position:absolute; top:420px; width:445px; display:flex; flex-direction:column; gap:14px; max-width:430px; }
.rt-amt-row { display:flex; align-items:baseline; gap:12px; }
.rt-amt { font-family:'Outfit',sans-serif; font-weight:700; font-size:66px; line-height:0.95; color:${KP_INK}; font-variant-numeric:tabular-nums; }
.rt-edit { font-weight:300; font-size:12px; color:${ACCENT_SOFT}; cursor:pointer; background:transparent; }
.rt-via { margin-top:18px; display:flex; gap:10px; }
.rt-via-chip { padding:9px 22px; border-radius:9999px; font-size:12.5px; cursor:pointer; transition:background .15s ease, color .15s ease; text-transform:lowercase; }
.rt-boards { margin-top:10px; display:flex; flex-wrap:wrap; gap:8px; }
.rt-board-chip { padding:6px 14px; border-radius:9999px; font-size:11px; cursor:pointer; transition:background .15s ease, color .15s ease; text-transform:lowercase; }
.rt-board-hint { margin-top:10px; font-weight:500; font-size:11px; color:rgba(244,246,255,0.4); }
.rt-item-name { margin-top:16px; font-weight:300; font-size:16px; color:${TEXT_SOFT}; text-transform:lowercase; }
.rt-item-hint { margin-top:4px; font-weight:500; font-size:13px; color:rgba(244,246,255,0.5); }
.rt-field { display:flex; flex-direction:column; gap:8px; }
.rt-field-label { font-weight:700; font-size:10px; letter-spacing:0.18em; color:rgba(244,246,255,0.45); }
.rt-name-input { height:50px; border-radius:9999px; border:none; outline:none; background:#fff; padding:0 22px; box-sizing:border-box; color:${INK}; font-family:'Outfit',sans-serif; font-weight:600; font-size:13.5px; }
.rt-split-toggle { display:flex; align-items:center; justify-content:space-between; height:54px; padding:0 20px; box-sizing:border-box; border-radius:12px; border:1.5px solid rgba(94,158,255,0.55); }
.rt-split-text { display:flex; flex-direction:column; gap:1px; }
.rt-split-cap { font-weight:600; font-size:8.5px; letter-spacing:0.08em; color:rgba(244,246,255,0.45); }
.rt-split-desc { font-weight:600; font-size:13px; color:${TEXT_SOFT}; }
.rt-switch { position:relative; width:48px; height:29px; border-radius:9999px; cursor:pointer; transition:background .18s ease; flex:0 0 auto; }
.rt-knob { position:absolute; top:4px; left:4px; width:21px; height:21px; border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(10,17,40,0.25); transition:transform .18s ease; }
.rt-fee { font-weight:500; font-size:11px; color:rgba(244,246,255,0.4); }
.rt-send-btn { margin:44px auto 0; width:200px; height:46px; border-radius:9999px; border:1.5px solid rgba(94,158,255,0.7); background:transparent; font-weight:300; font-size:13.5px; color:${TEXT_SOFT}; cursor:pointer; transition:background .15s ease, border-color .2s ease, color .2s ease; }
.rt-send-btn:hover:not(:disabled) { background:rgba(94,158,255,0.08); }
.rt-send-btn:disabled { opacity:0.55; cursor:default; }
.rt-send-btn-split { margin:20px auto 0; font-weight:700; }

/* keypad */
.rt-kp-head { display:flex; align-items:center; justify-content:space-between; }
.rt-kp-circle { width:40px; height:40px; border-radius:50%; border:1.5px solid rgba(94,158,255,0.7); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background .15s ease; }
.rt-kp-circle:hover { background:rgba(94,158,255,0.08); }
.rt-kp-amt { margin-top:10px; text-align:center; font-family:'Outfit',sans-serif; font-weight:700; font-size:68px; line-height:1; color:${KP_INK}; font-variant-numeric:tabular-nums; }
.rt-kp-quick { margin-top:24px; display:flex; justify-content:center; gap:10px; }
.rt-kp-quick-btn { padding:9px 20px; border-radius:9999px; border:1.5px solid rgba(94,158,255,0.55); background:transparent; font-weight:700; font-size:12.5px; color:${ACCENT_SOFT}; cursor:pointer; transition:background .15s ease; }
.rt-kp-quick-btn:hover { background:rgba(94,158,255,0.08); }
.rt-kp-hint { margin-top:58px; text-align:center; font-weight:500; font-size:13px; color:rgba(198,207,226,0.75); }
.rt-kp-grid { margin:36px auto 0; display:grid; grid-template-columns:repeat(3,80px); gap:36px 56px; justify-content:center; }
.rt-kp-key { width:80px; height:80px; border-radius:50%; font-size:34px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; font-family:'Outfit',sans-serif; box-sizing:border-box; transition:opacity .12s ease; }
.rt-kp-key:hover { opacity:0.88; }

/* stock tiles */
.rt-stock { margin-top:40px; }
.rt-stock-head { font-weight:300; font-size:15px; color:${KP_INK}; }
.rt-stock-grid { margin-top:22px; display:grid; grid-template-columns:repeat(3,1fr); gap:12px; max-width:560px; max-height:600px; overflow-y:auto; padding-bottom:10px; }
.rt-stock-empty { grid-column:1 / -1; }
.rt-tile { position:relative; display:flex; flex-direction:column; height:124px; border-radius:14px; background:#fff; box-sizing:border-box; padding:14px; cursor:pointer; text-align:left; transition:transform .15s ease, box-shadow .15s ease; }
.rt-tile:hover { transform:translateY(-2px); box-shadow:0 10px 24px rgba(0,4,28,0.28); }
.rt-tile-ico { width:32px; height:32px; border-radius:10px; background:#EEF1F8; display:flex; align-items:center; justify-content:center; font-size:17px; line-height:1; }
.rt-tile-name { margin-top:auto; font-weight:700; font-size:13px; color:${INK}; text-transform:lowercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rt-tile-price { position:absolute; top:14px; right:14px; font-family:'Outfit',sans-serif; font-weight:800; font-size:13.5px; color:${DEEP_BLUE}; }

/* split */
.rt-split { margin-top:170px; }
.rt-split-lead { font-weight:600; font-size:15px; color:rgba(198,207,226,0.8); }
.rt-split-body { margin-top:48px; margin-left:52px; display:flex; flex-direction:column; gap:18px; max-width:340px; }
.rt-split-chips { display:flex; gap:10px; }
.rt-split-chip { flex:1; height:44px; border-radius:9999px; font-size:12.5px; cursor:pointer; transition:background .15s ease, color .15s ease; }
.rt-split-each { display:flex; align-items:center; justify-content:space-between; height:54px; padding:0 20px; box-sizing:border-box; border-radius:12px; border:1.5px solid rgba(94,158,255,0.55); font-weight:600; font-size:13px; color:rgba(244,246,255,0.6); }
.rt-split-each-amt { font-family:'Outfit',sans-serif; font-weight:800; font-size:20px; color:${TEXT_SOFT}; }

/* share */
.rt-share { margin-top:100px; }
.rt-share-head { font-weight:300; font-size:15px; color:${KP_INK}; }
.rt-share-sub { margin-top:4px; font-weight:500; font-size:12px; color:rgba(244,246,255,0.45); }
.rt-share-body { margin-top:28px; display:flex; flex-direction:column; gap:14px; max-width:440px; }
.rt-share-link { display:flex; align-items:center; gap:12px; height:54px; padding:0 20px; box-sizing:border-box; border-radius:12px; border:1.5px solid rgba(94,158,255,0.55); }
.rt-share-url { flex:1; min-width:0; font-weight:600; font-size:13px; color:${TEXT_SOFT}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rt-share-copy { font-weight:700; font-size:12px; color:${ACCENT_SOFT}; cursor:pointer; flex:0 0 auto; background:transparent; }
.rt-share-actions { display:flex; gap:10px; }
.rt-share-act { flex:1; display:inline-flex; align-items:center; justify-content:center; gap:8px; height:44px; border-radius:9999px; border:1.5px solid rgba(94,158,255,0.55); background:transparent; font-weight:600; font-size:12.5px; color:${ACCENT_SOFT}; cursor:pointer; transition:background .15s ease; }
.rt-share-act:hover { background:rgba(94,158,255,0.08); }
.rt-share-label { margin-top:14px; font-weight:700; font-size:10px; letter-spacing:0.18em; color:rgba(244,246,255,0.45); }
.rt-board-row { display:flex; align-items:center; gap:12px; height:50px; padding:0 20px; box-sizing:border-box; border-radius:12px; background:rgba(94,158,255,0.08); }
.rt-board-name { flex:1; min-width:0; font-weight:600; font-size:12.5px; color:${TEXT_SOFT}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rt-board-sub { font-weight:500; font-size:11px; color:rgba(244,246,255,0.45); white-space:nowrap; }
.rt-share-empty { padding:6px 0; }
`;
