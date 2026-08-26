import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCurrentMerchantId } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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

type SaleDestination =
  | { kind: "no-board" }
  | { kind: "board"; boardId: number };

interface CreateSaleInput {
  item: string;
  price: string;
  splitEnabled: boolean;
  destination: SaleDestination;
}

interface CreatedSaleResponse {
  id?: number;
  paymentUrl?: string | null;
  qrCodeUrl?: string | null;
}

interface CurrentSale {
  item: string;
  amount: number;
  paymentUrl: string;
  qrCodeUrl: string;
  destination: SaleDestination;
}

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

const BOARD_LIMIT_MESSAGE = "Maximum 10 tapt stones allowed per merchant";

function apiErrorDetails(error: unknown): { status: number | null; message: string } {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const statusMatch = raw.match(/^(\d{3}):\s*/);
  const status = statusMatch ? Number(statusMatch[1]) : null;
  const withoutStatus = statusMatch ? raw.slice(statusMatch[0].length) : raw;
  const jsonStart = withoutStatus.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(withoutStatus.slice(jsonStart));
      if (typeof parsed?.message === "string" && parsed.message.trim()) {
        return { status, message: parsed.message.trim() };
      }
    } catch {
      /* Fall through to the server text below. */
    }
  }
  return { status, message: withoutStatus.trim() };
}

const num = (p: unknown) => parseFloat(String(p ?? "0") || "0") || 0;
const money2 = (n: number) =>
  "$" + n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyWhole = (n: number) => "$" + Math.round(n).toLocaleString("en-NZ");

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
  const [destination, setDestination] = useState<SaleDestination>({ kind: "no-board" });
  const [currentSale, setCurrentSale] = useState<CurrentSale | null>(null);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [splitOn, setSplitOn] = useState(false);
  const [splitN, setSplitN] = useState<number>(2);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StackFilter>("all");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  /* Active stack expansion (§6.3). Escape collapses and returns focus to the
     control that opened it, so keyboard users are never stranded in the list. */
  const [stackExpanded, setStackExpanded] = useState(false);
  const stackToggleRef = useRef<HTMLButtonElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  /* Scroll offset per filter, so switching chips and coming back does not
     dump the merchant at the top of a list they had scrolled through. */
  const filterScroll = useRef<Record<string, number>>({});
  /* Board picker: `boardsOn` is the disclosure — off means the sale gets a
     private per-payment link (the old "no board" choice), on reveals the
     picker. `draftName` is shared by the rename and create rows, which are
     mutually exclusive. */
  const [boardsOn, setBoardsOn] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [draftName, setDraftName] = useState("");

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

  const createMutation = useMutation<CreatedSaleResponse, Error, CreateSaleInput>({
    mutationFn: async (sale) => {
      const res = await apiRequest("POST", "/api/transactions", {
        merchantId,
        itemName: sale.item,
        price: sale.price,
        status: "pending",
        splitEnabled: sale.splitEnabled,
        ...(sale.destination.kind === "no-board"
          ? { linkMode: "per_payment" }
          : { selectedStoneId: sale.destination.boardId, linkMode: "legacy" }),
      });
      return res.json();
    },
    onMutate: () => {
      /* The raw credential is intentionally returned once. Never leave the
         previous one visible while another request is pending or fails. */
      setCurrentSale(null);
      setSaleError(null);
      setCopiedKey(null);
    },
    onSuccess: (created, sale) => {
      void queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "active-transaction"] });

      const paymentUrl = typeof created?.paymentUrl === "string" ? created.paymentUrl.trim() : "";
      const qrCodeUrl = typeof created?.qrCodeUrl === "string" ? created.qrCodeUrl.trim() : "";
      if (!paymentUrl || !qrCodeUrl) {
        const message = "The sale was created, but its private share link was not returned. Start a new sale to try again.";
        setSaleError(message);
        setMode("share");
        toast({ title: "Payment link unavailable", description: message, variant: "destructive" });
      } else {
        setCurrentSale({
          item: sale.item,
          amount: num(sale.price),
          paymentUrl,
          qrCodeUrl,
          destination: sale.destination,
        });
        setMode("share");
      }
      setItemName("");
      setAmount(0);
      setSplitOn(false);
    },
    onError: (error) => {
      /* 402 BILLING_CARD_REQUIRED surfaces its own persistent warning via apiRequest. */
      const detail = apiErrorDetails(error);
      const message = detail.message || "Please try again";
      setSaleError(message);
      toast({ title: "Couldn't start the sale", description: message, variant: "destructive" });
    },
  });

  const createBoardMutation = useMutation<Stone, Error, string | undefined>({
    mutationFn: async (name) => {
      const trimmed = name?.trim();
      const res = await apiRequest(
        "POST",
        `/api/merchants/${merchantId}/tapt-stones`,
        trimmed ? { name: trimmed } : {},
      );
      return res.json();
    },
    onMutate: () => setBoardError(null),
    onSuccess: (created) => {
      if (typeof created?.id !== "number") {
        const message = "New board created, but its details could not be loaded";
        setBoardError(message);
        void stonesQuery.refetch();
        return;
      }
      setCreatingBoard(false);
      setDraftName("");
      setBoardsOn(true);
      setPickerOpen(false);
      queryClient.setQueryData<Stone[]>(
        ["/api/merchants", merchantId, "tapt-stones"],
        (current = []) =>
          [...current.filter((stone) => stone.id !== created.id), created].sort(
            (a, b) => a.stoneNumber - b.stoneNumber,
          ),
      );
      setDestination({ kind: "board", boardId: created.id });
      setBoardError(null);
      void queryClient.invalidateQueries({
        queryKey: ["/api/merchants", merchantId, "tapt-stones"],
      });
      toast({ title: "New board created", description: `${created.name} selected` });
    },
    onError: (error) => {
      const detail = apiErrorDetails(error);
      const message = detail.message || "Failed to create a new board";
      setBoardError(message);
      if (detail.status === 409) void stonesQuery.refetch();
      toast({
        title: message === BOARD_LIMIT_MESSAGE ? "Board limit reached" : "Couldn't create board",
        description: message,
        variant: "destructive",
      });
    },
  });

  const renameBoardMutation = useMutation<Stone, Error, { id: number; name: string }>({
    mutationFn: async ({ id, name }) => {
      const res = await apiRequest(
        "PUT",
        `/api/merchants/${merchantId}/tapt-stones/${id}`,
        { name: name.trim() },
      );
      return res.json();
    },
    onMutate: () => setBoardError(null),
    onSuccess: (updated, { id, name }) => {
      /* The server echoes the row back, but fall back to the local name so the
         list still updates if the response shape ever changes. */
      queryClient.setQueryData<Stone[]>(
        ["/api/merchants", merchantId, "tapt-stones"],
        (current = []) =>
          current.map((stone) =>
            stone.id === id ? { ...stone, ...updated, name: updated?.name ?? name.trim() } : stone,
          ),
      );
      setEditingId(null);
      setDraftName("");
      void queryClient.invalidateQueries({
        queryKey: ["/api/merchants", merchantId, "tapt-stones"],
      });
    },
    onError: (error) => {
      const message = apiErrorDetails(error).message || "Couldn't rename that board";
      setBoardError(message);
      toast({ title: "Couldn't rename board", description: message, variant: "destructive" });
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
  const selectedBoard =
    destination.kind === "board"
      ? stones.find((stone) => stone.id === destination.boardId)
      : undefined;
  const currentSaleBoardId =
    currentSale?.destination.kind === "board" ? currentSale.destination.boardId : null;
  const currentSaleBoard =
    currentSaleBoardId == null
      ? undefined
      : stones.find((stone) => stone.id === currentSaleBoardId);
  const atBoardLimit = stones.length >= 10;
  const boardLabel = (stone: Stone) => stone.name || `board ${stone.stoneNumber}`;

  /* ── board picker ── */
  /* Enter commits by blurring the field rather than submitting directly, so the
     keyboard and click-away paths share one commit and can't fire it twice.
     Escape sets this flag so the blur it triggers discards instead. */
  useEffect(() => {
    if (!stackExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setStackExpanded(false);
      stackToggleRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [stackExpanded]);

  useEffect(() => {
    const el = rowsRef.current;
    if (!el) return;
    el.scrollTop = filterScroll.current[filter] ?? 0;
  }, [filter]);

  const abandonEditRef = useRef(false);
  const closePickerEdits = () => {
    setEditingId(null);
    setCreatingBoard(false);
    setDraftName("");
  };
  const editKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      abandonEditRef.current = true;
      e.currentTarget.blur();
    }
  };
  const editBlur = (commit: () => void) => {
    if (abandonEditRef.current) {
      abandonEditRef.current = false;
      closePickerEdits();
      return;
    }
    commit();
  };

  /* Turning the disclosure off returns the sale to a private per-payment link,
     so the destination has to reset with it — otherwise a hidden board would
     keep being charged. */
  const toggleBoards = () => {
    setBoardsOn((on) => {
      if (on) {
        setPickerOpen(false);
        closePickerEdits();
        setDestination({ kind: "no-board" });
        setBoardError(null);
        return false;
      }
      /* Engaging boards only reveals the picker button — opening the list is a
         separate, deliberate click. */
      return true;
    });
  };

  const selectBoard = (id: number) => {
    setDestination({ kind: "board", boardId: id });
    setPickerOpen(false);
    closePickerEdits();
  };

  const beginRename = (stone: Stone) => {
    setCreatingBoard(false);
    setEditingId(stone.id);
    setDraftName(boardLabel(stone));
  };

  const commitRename = (id: number) => {
    const name = draftName.trim();
    if (!name) {
      closePickerEdits();
      return;
    }
    const existing = stones.find((stone) => stone.id === id);
    if (existing && boardLabel(existing) === name) {
      closePickerEdits();
      return;
    }
    renameBoardMutation.mutate({ id, name });
  };

  const commitCreate = () => {
    if (createBoardMutation.isPending) return;
    createBoardMutation.mutate(draftName.trim() || undefined);
  };

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
    if (destination.kind === "board" && !selectedBoard) {
      const message = "That board is no longer available. Choose another destination.";
      setSaleError(message);
      toast({ title: "Choose a destination", description: message, variant: "destructive" });
      return;
    }
    createMutation.mutate({
      item: itemName.trim(),
      price: amount.toFixed(2),
      splitEnabled: withSplit,
      destination,
    });
  };

  const clearCurrentSale = () => {
    setCurrentSale(null);
    setSaleError(null);
    setCopiedKey(null);
  };

  const pressKey = (key: DesktopKeypadKey) =>
    setKpVal((value) => desktopKeypadReducer(value, key));

  const openKeypad = () => {
    clearCurrentSale();
    setKpVal("");
    setMode("keypad");
  };
  const commitKeypad = () => {
    setAmount(desktopKeypadCents(kpVal) / 100);
    setKpVal("");
    setMode("send");
  };
  const cancelKeypad = () => {
    setKpVal("");
    setMode("send");
  };

  const pickStock = (item: StockItem) => {
    clearCurrentSale();
    setItemName(item.name);
    setAmount(num(item.cost));
    setMode("send");
  };

  const openComposeMode = (nextMode: Exclude<Mode, "share">) => {
    clearCurrentSale();
    if (nextMode === "keypad") openKeypad();
    else setMode(nextMode);
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

  const openQr = (qrCodeUrl: string) => window.open(qrCodeUrl, "_blank");

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
        onClick={() => (m === "share" ? setMode("share") : openComposeMode(m))}
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

  const sendLabel = createMutation.isPending ? "creating private link…" : "send payment";

  return (
    <DesktopPageScaffold {...props} vertical="retail" page="terminal" showScope={false}>
      <style>{RT_CSS}</style>
      <div className="rt-body">
        {/* ── LEFT ── */}
        {/* entry cascade: scope → revenue → label → count → label → stack */}
        <div className="rt-left dt-cascade">
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

          {/* The shell is pinned: header/search/chips hold the same canvas y in
              every filter, data and error state, and only the row viewport
              changes size. Expanding moves the whole shell up to y93. */}
          <div
            className="rt-stack"
            data-tutorial-id="retail-terminal-live-payments"
            data-expanded={stackExpanded ? "true" : "false"}
          >
            <div className="rt-stack-head">
              <button
                type="button"
                ref={stackToggleRef}
                className="rt-stack-toggle"
                aria-expanded={stackExpanded}
                aria-label={stackExpanded ? "collapse active stack" : "expand active stack"}
                onClick={() => setStackExpanded((open) => !open)}
              >
                <span className="rt-stack-title">active stack</span>
                <svg
                  className="rt-stack-caret"
                  width="10" height="10" viewBox="0 0 24 24" fill="none"
                  stroke={ACCENT_SOFT} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 14 6-6 6 6" />
                </svg>
              </button>
            </div>

            <div className="rt-stack-search">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.8-3.8" /></svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="search sales"
                aria-label="search active stack"
              />
            </div>

            <div className="rt-chips">
              {STACK_FILTERS.map((f) => (
                <button key={f} type="button" className="rt-chip" style={chipStyle(f === filter)} onClick={() => setFilter(f)}>
                  {f}
                </button>
              ))}
            </div>

            <div
              className="rt-rows"
              ref={rowsRef}
              onScroll={(e) => {
                filterScroll.current[filter] = e.currentTarget.scrollTop;
              }}
            >
              {txQuery.isLoading ? (
                <div className="rt-empty">loading…</div>
              ) : stackRows.length === 0 ? (
                <div className="rt-empty">no sales yet</div>
              ) : (
                stackRows.map((r) => {
                  const live = r.meta.bucket === "awaiting";
                  const open = expandedId === r.id;
                  const stone = stones.find((s) => s.id === r.taptStoneId);
                  /* Per-payment no-board credentials are intentionally not
                     recoverable from transaction history. Only board rows have
                     a durable link that can safely be shown again. */
                  const rowLink = stone?.paymentUrl?.trim() || "";
                  const rowInner = (
                    <>
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
                    </>
                  );
                  return (
                    <div key={r.id} className="rt-row-wrap">
                      {/* The row-open control is a native button, never a
                          div[role=button]; its action buttons are siblings, so
                          an action can never also trigger the row. */}
                      {live ? (
                        <button
                          type="button"
                          className="rt-row rt-row-live"
                          aria-expanded={open}
                          onClick={() => setExpandedId(open ? null : r.id)}
                        >
                          {rowInner}
                        </button>
                      ) : (
                        <div className="rt-row">{rowInner}</div>
                      )}
                      {live && open && (
                        <div className="rt-row-actions">
                          {rowLink ? (
                            <button type="button" className="rt-row-act" onClick={() => copyLink(rowLink, `tx-${r.id}`)}>
                              {copiedKey === `tx-${r.id}` ? "copied ✓" : "copy board link"}
                            </button>
                          ) : (
                            <span className="rt-row-link-note">private link available only when the sale starts</span>
                          )}
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
          {/* the rail is the animated element, not `.rt-rail-slot` — the slot is
              not a containing block, so transforming it would re-anchor the
              absolutely-positioned rail mid-animation */}
          <div
            className="rt-rail terminal-rail dt-rise"
            data-tutorial-id="retail-terminal-tools"
            style={{ "--dt-i": 6 } as CSSProperties}
          >
            {railBtn("stock", false, (<><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>), "stock tiles")}
            {railBtn("split", false, (<><path d="M12 3v7" /><path d="M12 10l-6 8" /><path d="M12 10l6 8" /></>), "split bill")}
            {railBtn("keypad", true, (<path d="M12 5v14M5 12h14" />), "keypad")}
            {railBtn("share", false, (<><circle cx="18" cy="5" r="2.6" /><circle cx="6" cy="12" r="2.6" /><circle cx="18" cy="19" r="2.6" /><path d="m8.3 10.7 7.4-4.4M8.3 13.3l7.4 4.4" /></>), "share payment link")}
            {railBtn("send", false, (<><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></>), "compose sale")}
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        {/* last entry step; `.rt-mode` keeps its own tileIn for mode switching */}
        <div className="rt-panel terminal-panel dt-rise" style={{ "--dt-i": 7 } as CSSProperties}>
          {mode === "send" && (
            <>
              {/* Zone A — the amount figure, on the spine at canvas x713/y155. */}
              <div className="rt-mode terminal-zone-a">
                <div className="rt-amt-row" data-tutorial-id="retail-terminal-amount">
                  <span className="rt-amt">{money2(amount)}</span>
                  <button type="button" className="rt-edit" onClick={openKeypad}>edit&gt;</button>
                </div>
              </div>

              {/* Zone B — item, destination/board and split. Owns its own
                  overflow so a long item name or a large board list scrolls
                  inside 460px instead of pushing into Zone C. */}
              <div className="rt-mode terminal-zone-b">
                <div className="rt-destination-label" id="rt-destination-label">PAYMENT DESTINATION</div>
                <div className="rt-boards" data-tutorial-id="retail-terminal-destination">
                  <div className="rt-boards-row">
                    <button
                      type="button"
                      className={`rt-wire rt-boards-toggle${boardsOn ? " on" : ""}`}
                      aria-pressed={boardsOn}
                      onClick={toggleBoards}
                    >
                      payment boards
                    </button>

                    {/* Pops in beside the toggle once boards are engaged. */}
                    {boardsOn && (
                      <button
                        type="button"
                        className="rt-wire rt-picker-btn rt-sidepop"
                        aria-haspopup="true"
                        aria-expanded={pickerOpen}
                        aria-controls="rt-board-list"
                        /* The visible label becomes the chosen board; the
                           accessible name keeps the control's purpose in front
                           of it so it never reads as a bare noun. */
                        aria-label={
                          selectedBoard ? `selected board: ${boardLabel(selectedBoard)}` : "select board"
                        }
                        onClick={() => {
                          setPickerOpen((open) => !open);
                          closePickerEdits();
                        }}
                      >
                        <span className="rt-picker-label">
                          {selectedBoard ? boardLabel(selectedBoard) : "select board"}
                        </span>
                        <svg
                          className={`rt-caret${pickerOpen ? " open" : ""}`}
                          width="11" height="11" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2.4"
                          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {boardsOn && (
                    <div className={`rt-drop${pickerOpen ? " open" : ""}`}>
                      <div className="rt-drop-inner">
                        <div
                          id="rt-board-list"
                          className="rt-drop-list"
                          role="radiogroup"
                          aria-label="payment boards"
                        >
                          {stones.map((stone) => (
                            <div className="rt-drop-row" key={stone.id}>
                              {editingId === stone.id ? (
                                <input
                                  className="rt-drop-input"
                                  autoFocus
                                  value={draftName}
                                  aria-label={`rename ${boardLabel(stone)}`}
                                  maxLength={60}
                                  onChange={(e) => setDraftName(e.target.value)}
                                  onBlur={() => editBlur(() => commitRename(stone.id))}
                                  onKeyDown={editKeyDown}
                                />
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    role="radio"
                                    aria-checked={
                                      destination.kind === "board" && destination.boardId === stone.id
                                    }
                                    aria-label={`${boardLabel(stone)}, board ${stone.stoneNumber}`}
                                    className="rt-drop-pick"
                                    onClick={() => selectBoard(stone.id)}
                                  >
                                    {boardLabel(stone)}
                                  </button>
                                  <button
                                    type="button"
                                    className="rt-drop-edit"
                                    aria-label={`rename ${boardLabel(stone)}`}
                                    onClick={() => beginRename(stone)}
                                  >
                                    <svg
                                      width="13" height="13" viewBox="0 0 24 24" fill="none"
                                      stroke="currentColor" strokeWidth="2"
                                      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                                    >
                                      <path d="M12 20h9" />
                                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                    </svg>
                                  </button>
                                </>
                              )}
                            </div>
                          ))}

                          <div className="rt-drop-sep" role="presentation" />

                          <div className="rt-drop-row">
                            {creatingBoard ? (
                              <input
                                className="rt-drop-input"
                                autoFocus
                                value={draftName}
                                placeholder="board name"
                                aria-label="new board name"
                                maxLength={60}
                                onChange={(e) => setDraftName(e.target.value)}
                                onBlur={() => editBlur(commitCreate)}
                                onKeyDown={editKeyDown}
                              />
                            ) : (
                              <button
                                type="button"
                                className="rt-drop-create"
                                aria-label="create new board"
                                aria-busy={createBoardMutation.isPending}
                                aria-describedby={
                                  stonesQuery.isLoading || stonesQuery.isError || boardError || atBoardLimit
                                    ? "rt-board-status"
                                    : undefined
                                }
                                disabled={createBoardMutation.isPending || atBoardLimit}
                                onClick={() => {
                                  setEditingId(null);
                                  setDraftName("");
                                  setCreatingBoard(true);
                                }}
                              >
                                {createBoardMutation.isPending ? "creating board…" : "+ create board"}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {(stonesQuery.isLoading || stonesQuery.isError || boardError || atBoardLimit) && (
                    <span
                      id="rt-board-status"
                      className={stonesQuery.isError || boardError ? "rt-inline-error" : "rt-board-hint"}
                      role={stonesQuery.isError || boardError ? "alert" : "status"}
                      aria-live="polite"
                    >
                      {boardError ||
                        (stonesQuery.isError
                          ? "Boards couldn't be loaded. No board remains available."
                          : atBoardLimit
                            ? BOARD_LIMIT_MESSAGE
                            : "loading boards…")}
                    </span>
                  )}
                </div>
                <div className="rt-item-name">{itemName || "new sale"}</div>
                <div className="rt-item-hint">tap send to share payment</div>
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
              </div>

              {/* Zone C — the primary action, pinned at canvas x783/y748 so no
                  amount of Zone B content can push it off the canvas. */}
              <div className="rt-mode terminal-zone-c">
                <button
                  type="button"
                  className="rt-send-btn"
                  data-tutorial-id="retail-terminal-send"
                  aria-label="send payment"
                  aria-busy={createMutation.isPending}
                  aria-describedby={createMutation.isPending || saleError ? "rt-sale-status" : undefined}
                  disabled={createMutation.isPending}
                  onClick={() => send(splitOn)}
                >
                  {sendLabel}
                </button>
                {(createMutation.isPending || saleError) && (
                  <span
                    id="rt-sale-status"
                    className={`rt-cta-status ${saleError ? "rt-inline-error" : "rt-inline-status"}`}
                    role={saleError ? "alert" : "status"}
                    aria-live="polite"
                  >
                    {saleError || "Creating a private payment link…"}
                  </span>
                )}
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
              <div className="rt-kp-amt">{formatDesktopKeypadMoney(kpVal)}</div>
              <div className="rt-kp-quick">
                {QUICK_AMTS.map((q) => (
                  <button key={q} type="button" className="rt-kp-quick-btn" onClick={() => setKpVal(q)}>${q}</button>
                ))}
              </div>
              <div className="rt-kp-hint">quick amounts or type it — ✓ starts the sale</div>
              <div className="rt-kp-grid">
                {DESKTOP_KEYPAD_KEYS.map((k) => {
                  const fill = k !== "." && k !== "<";
                  return (
                    <DesktopKeypadButton
                      key={k}
                      keyValue={k}
                      className="rt-kp-key"
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
            <>
              {/* Zone A — the amount being split. */}
              <div className="rt-mode terminal-zone-a">
                <div className="rt-amt-row">
                  <span className="rt-amt">{money2(amount)}</span>
                  <span className="rt-split-lead">split the bill</span>
                </div>
              </div>

              {/* Zone B — the customer-side split preview. */}
              <div className="rt-mode terminal-zone-b">
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
                </div>
              </div>

              {/* Zone C — Confirm. */}
              <div className="rt-mode terminal-zone-c">
                <button
                  type="button"
                  className="rt-send-btn rt-send-btn-split"
                  aria-label="send split payment"
                  aria-busy={createMutation.isPending}
                  aria-describedby={createMutation.isPending || saleError ? "rt-sale-status" : undefined}
                  disabled={createMutation.isPending}
                  onClick={() => send(true)}
                >
                  {sendLabel}
                </button>
                {(createMutation.isPending || saleError) && (
                  <span
                    id="rt-sale-status"
                    className={`rt-cta-status ${saleError ? "rt-inline-error" : "rt-inline-status"}`}
                    role={saleError ? "alert" : "status"}
                    aria-live="polite"
                  >
                    {saleError || "Creating a private split-payment link…"}
                  </span>
                )}
              </div>
            </>
          )}

          {mode === "share" && (
            <>
              {/* Zone A — the created amount. §4.2 puts the figure on the spine
                  for the current-sale result, not buried in the subtitle. */}
              <div className="rt-mode terminal-zone-a">
                <div className="rt-amt-row">
                  <span className="rt-amt">{money2(currentSale ? currentSale.amount : amount)}</span>
                </div>
              </div>

              {/* Zone B — the in-memory share credential, or the board result. */}
              <div className="rt-mode terminal-zone-b rt-share">
              <div className="rt-share-head">Share payment link</div>
              {currentSale ? (
                <>
                  <div className="rt-share-sub">
                    {currentSale.item + " — anyone with this private link can pay"}
                  </div>
                  <div className="rt-share-body" aria-live="polite">
                    <div className="rt-share-link">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
                      <span className="rt-share-url" title={currentSale.paymentUrl}>
                        {currentSale.paymentUrl.replace(/^https?:\/\//, "")}
                      </span>
                      <button type="button" className="rt-share-copy" onClick={() => copyLink(currentSale.paymentUrl, "current-sale")}>
                        {copiedKey === "current-sale" ? "copied ✓" : "copy link"}
                      </button>
                    </div>
                    <div className="rt-share-actions">
                      <button type="button" className="rt-share-act" onClick={() => shareVia("email", currentSale.paymentUrl)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7l10 7 10-7" /><rect x="2" y="5" width="20" height="14" rx="2" /></svg>
                        <span>email</span>
                      </button>
                      <button type="button" className="rt-share-act" onClick={() => shareVia("sms", currentSale.paymentUrl)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 4H4v12h4v4l5-4h7z" /></svg>
                        <span>sms</span>
                      </button>
                      <button type="button" className="rt-share-act" onClick={() => openQr(currentSale.qrCodeUrl)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="6" height="6" /><rect x="14" y="4" width="6" height="6" /><rect x="4" y="14" width="6" height="6" /><path d="M14 14h3v3h-3zM20 14v6h-6" /></svg>
                        <span>QR code</span>
                      </button>
                    </div>
                    <div className="rt-current-destination">
                      {currentSale.destination.kind === "no-board"
                        ? "private no-board link"
                        : `board ${currentSaleBoard?.stoneNumber ?? currentSaleBoardId} link`}
                    </div>
                  </div>
                </>
              ) : (
                <div className="rt-share-empty-state" aria-live="polite">
                  {saleError ? (
                    <p className="rt-inline-error" role="alert">{saleError}</p>
                  ) : (
                    <p role="status">No current sale link. Start a sale to generate a private payment link.</p>
                  )}
                </div>
              )}
              </div>

              {/* Zone C — Start new sale, in the same place as every other
                  mode's primary action. */}
              <div className="rt-mode terminal-zone-c">
                <button type="button" className="rt-new-sale" onClick={() => openComposeMode("send")}>
                  start new sale
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </DesktopPageScaffold>
  );
}

const RT_CSS = `
.rt-body { position:relative; display:flex; height:100%; box-sizing:border-box; padding:26px 46px 0 52px; }

/* ── left column ── */
/* Positioned so the stack shell can be pinned against it. The column's top
   edge is canvas y93 and its bottom is canvas y880, which is what every stack
   offset below is measured from. */
.rt-left { position:relative; flex:0 0 420px; display:flex; flex-direction:column; }
.rt-scope { display:inline-flex; align-items:center; gap:9px; padding:10px 20px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); font-weight:400; font-size:13.5px; color:${ACCENT_SOFT}; cursor:pointer; transition:background .18s ease; }
.rt-scope:hover { background:rgba(94,158,255,0.08); }
.rt-hero-row { margin-top:22px; display:flex; align-items:flex-start; gap:14px; }
.rt-hero { font-family:'Outfit',sans-serif; font-weight:700; font-size:84px; line-height:0.92; letter-spacing:-0.015em; color:${ACCENT}; font-variant-numeric:tabular-nums; }
.rt-hero-pill { margin-top:6px; padding:6px 13px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); font-weight:700; font-size:13px; color:${ACCENT_SOFT}; white-space:nowrap; }
.rt-hero-sub { margin-top:24px; font-weight:300; font-size:17px; color:${NAV_DIM}; }
.rt-hero-dim { margin-top:36px; font-size:56px; opacity:0.61; }
.rt-hero-sub-dim { margin-top:12px; opacity:0.61; }

/* ── active stack: a fixed shell, not a bottom-anchored block ──
   margin-top:auto made the header sit at canvas y488 with seven rows and
   y720 with one — a 232px jump on a data change. The shell is now pinned and
   only .rt-rows changes size.

     collapsed   header y488  search y532  chips y566  rows end y856
     expanded    header y93   search y137  chips y171  rows end y856

   Both states share the same internal offsets (0 / 44 / 78 from the shell top),
   so expanding only moves top. 395px = y488 - y93; 24px bottom = y880 - y856. */
.rt-stack { position:absolute; left:0; right:0; top:395px; bottom:24px; display:flex; flex-direction:column; min-height:0; }
.rt-stack[data-expanded="true"] { top:0; }
.rt-stack-toggle { display:inline-flex; align-items:center; gap:6px; padding:0; background:transparent; cursor:pointer; }
.rt-stack-caret { transition:transform var(--m-dur-ui) var(--m-ease-out); }
.rt-stack[data-expanded="true"] .rt-stack-caret { transform:rotate(180deg); }

/* When the stack takes the column, the figures above it step out of the way. */
.rt-left:has(.rt-stack[data-expanded="true"]) .rt-scope,
.rt-left:has(.rt-stack[data-expanded="true"]) .rt-hero-row,
.rt-left:has(.rt-stack[data-expanded="true"]) .rt-hero-sub,
.rt-left:has(.rt-stack[data-expanded="true"]) .rt-hero-dim,
.rt-left:has(.rt-stack[data-expanded="true"]) .rt-hero-sub-dim { visibility:hidden; }
.rt-stack-head { flex:0 0 44px; height:44px; display:flex; align-items:center; justify-content:space-between; }
.rt-stack-title { display:inline-flex; align-items:center; gap:6px; font-weight:300; font-size:12px; color:${ACCENT_SOFT}; }
.rt-stack-search { flex:0 0 32px; display:flex; align-items:center; gap:8px; width:180px; height:32px; padding:0 14px; box-sizing:border-box; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); }
.rt-stack-search input { flex:1; min-width:0; border:none; background:transparent; outline:none; color:#fff; font-family:'Outfit',sans-serif; font-weight:500; font-size:11px; }
/* 44 + 32 + 2 = 78px below the shell top → canvas y566 collapsed, y171 expanded. */
.rt-chips { flex:0 0 auto; margin-top:2px; display:flex; gap:8px; }
.rt-chip { padding:6px 13px; border-radius:9999px; font-size:11px; cursor:pointer; transition:background .15s ease, color .15s ease; white-space:nowrap; }
/* The only part of the shell that resizes. */
.rt-rows { flex:1; min-height:0; margin-top:8px; display:flex; flex-direction:column; overflow-y:auto; scrollbar-width:none; }
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
.rt-row-actions { display:flex; gap:8px; padding:0 0 10px 53px; animation:tileIn var(--m-dur-ui) var(--m-ease-out) both; }
.rt-row-act { padding:6px 14px; border-radius:9999px; border:1px solid rgba(94,158,255,0.5); background:transparent; font-weight:600; font-size:11px; color:${ACCENT_SOFT}; cursor:pointer; transition:background .15s ease; }
.rt-row-act:hover:not(:disabled) { background:rgba(94,158,255,0.1); }
.rt-row-act:disabled { opacity:0.5; cursor:default; }
.rt-row-act-danger { border-color:rgba(240,101,108,0.5); color:${RED}; }
.rt-row-act-danger:hover:not(:disabled) { background:rgba(240,101,108,0.1); }
.rt-row-link-note { align-self:center; max-width:215px; font-weight:500; font-size:10.5px; color:rgba(244,246,255,0.48); }
.rt-empty { padding:20px 0; font-weight:300; font-size:12.5px; color:rgba(191,209,255,0.5); }

/* ── centre rail (design places it absolutely at x=550) ── */
/* The slot only reserves the rail's horizontal share of the row; the rail's
   own position is explicit (see .terminal-rail), never derived from here. */
.rt-rail-slot { flex:0 0 76px; margin:0 40px 0 44px; }
/* Geometry lives in .terminal-rail; this keeps only the skin. */
.rt-rail { border:1.5px solid rgba(94,158,255,0.7); border-radius:32px; }
.rt-rail-btn { width:46px; height:46px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background .18s ease; }
.rt-rail-btn:hover { background:rgba(94,158,255,0.14); }
.rt-rail-big { width:54px; height:54px; background:${ACTIVE}; box-shadow:0 8px 20px rgba(102,169,255,0.35); }
.rt-rail-big:hover { background:${ACTIVE}; opacity:0.9; }

/* ── right panel ── */
/* Geometry lives in .terminal-panel; every child is zone-positioned. */
.rt-panel { }
.rt-mode { animation:tileIn var(--m-dur-ui) var(--m-ease-out) both; }

/* send: design pins the two blocks at screen y=154 / y=512 (panel origin = y 92) */
/* .rt-send-top / .rt-send-lower are retired: send's content now lives in the
   shared Zone A/B/C wrappers instead of two independently positioned blocks. */
.terminal-zone-b > .rt-field,
.terminal-zone-b > .rt-split-toggle { margin-top:14px; }
.rt-amt-row { display:flex; align-items:baseline; gap:12px; }
.rt-amt { font-family:'Outfit',sans-serif; font-weight:700; font-size:66px; line-height:0.95; color:${KP_INK}; font-variant-numeric:tabular-nums; }
.rt-edit { font-weight:300; font-size:12px; color:${ACCENT_SOFT}; cursor:pointer; background:transparent; }
.rt-destination-label { margin-top:18px; font-weight:700; font-size:9px; letter-spacing:0.16em; color:rgba(244,246,255,0.45); }
/* ── payment board picker ──────────────────────────────────────────────────
   Progressive disclosure, all in the wireframe idiom: an outlined pill that
   goes solid when engaged, a second pill that pops in beside it, and an
   outlined dropdown that expands to its own height. Nothing overshoots except
   the side-pop, which is a deliberate accent. */
.rt-boards { margin-top:8px; display:flex; flex-direction:column; align-items:flex-start; gap:8px; }
.rt-boards-row { display:flex; align-items:center; gap:8px; }

/* The wireframe base. Text is deliberately lighter than the app's other pills
   so an un-engaged control reads as available rather than as active. */
.rt-wire {
  padding:9px 20px; border-radius:9999px; font-size:12.5px; text-transform:lowercase;
  border:1px solid rgba(94,158,255,0.5); background:transparent;
  color:rgba(127,178,255,0.68); font-weight:500; cursor:pointer; white-space:nowrap;
  transition:background .18s var(--m-ease-out), color .18s var(--m-ease-out), border-color .18s var(--m-ease-out);
}
.rt-wire:hover { border-color:rgba(94,158,255,0.85); color:${ACCENT_SOFT}; }
.rt-boards-toggle.on {
  background:${ACTIVE}; border-color:transparent; color:${NAVY}; font-weight:700;
}
.rt-boards-toggle.on:hover { background:${ACTIVE}; color:${NAVY}; }

@keyframes rtSidePop { from { opacity:0; transform:translateX(-10px); } to { opacity:1; transform:none; } }
.rt-sidepop { animation:rtSidePop var(--m-dur-ui) var(--m-ease-pop) both; }

.rt-picker-btn { display:inline-flex; align-items:center; gap:9px; max-width:220px; }
.rt-picker-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rt-caret { flex:0 0 auto; transition:transform .2s var(--m-ease-out); }
.rt-caret.open { transform:rotate(180deg); }

/* grid-template-rows 0fr→1fr expands to the content's own height, so the panel
   never needs a magic max-height that would clip a long list. */
.rt-drop {
  display:grid; grid-template-rows:0fr; opacity:0; width:248px;
  transition:grid-template-rows .24s var(--m-ease-out), opacity .16s var(--m-ease-out);
}
.rt-drop.open { grid-template-rows:1fr; opacity:1; }
.rt-drop-inner { overflow:hidden; min-height:0; }
.rt-drop-list {
  border:1px solid rgba(94,158,255,0.5); border-radius:16px; padding:5px;
  display:flex; flex-direction:column; gap:1px;
  max-height:236px; overflow-y:auto; scrollbar-width:none;
}
.rt-drop-list::-webkit-scrollbar { display:none; }
.rt-drop-row { display:flex; align-items:center; gap:3px; }
.rt-drop-pick {
  flex:1; min-width:0; text-align:left; padding:8px 12px; border-radius:11px;
  border:none; background:transparent; color:rgba(127,178,255,0.68);
  font-weight:500; font-size:12px; cursor:pointer; text-transform:lowercase;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  transition:background .15s var(--m-ease-out), color .15s var(--m-ease-out);
}
.rt-drop-pick:hover { background:rgba(94,158,255,0.1); color:${ACCENT_SOFT}; }
.rt-drop-pick[aria-checked="true"] { background:rgba(94,158,255,0.16); color:#EAF2FF; font-weight:700; }
.rt-drop-edit {
  flex:0 0 auto; width:26px; height:26px; border-radius:8px; border:none;
  background:transparent; color:rgba(127,178,255,0.5);
  display:grid; place-items:center; cursor:pointer;
  transition:background .15s var(--m-ease-out), color .15s var(--m-ease-out);
}
.rt-drop-edit:hover { background:rgba(94,158,255,0.12); color:${ACCENT_SOFT}; }
.rt-drop-input {
  flex:1; min-width:0; padding:7px 11px; border-radius:11px; font-size:12px;
  border:1px solid rgba(94,158,255,0.5); background:transparent;
  color:#EAF2FF; font-family:inherit; outline:none;
}
.rt-drop-input::placeholder { color:rgba(127,178,255,0.45); }
.rt-drop-sep { height:1px; background:rgba(94,158,255,0.22); margin:4px 8px; flex:0 0 auto; }
.rt-drop-create {
  flex:1; text-align:left; padding:8px 12px; border-radius:11px; border:none;
  background:transparent; color:rgba(127,178,255,0.68); font-weight:600;
  font-size:12px; cursor:pointer; text-transform:lowercase;
  transition:background .15s var(--m-ease-out), color .15s var(--m-ease-out);
}
.rt-drop-create:hover:not(:disabled) { background:rgba(94,158,255,0.1); color:${ACCENT_SOFT}; }
.rt-drop-create:disabled { opacity:0.5; cursor:default; }

@media (prefers-reduced-motion: reduce) {
  .rt-sidepop { animation:none; }
  .rt-drop { transition:none; }
}
.rt-board-hint, .rt-inline-status { font-weight:500; font-size:10.5px; color:rgba(244,246,255,0.48); }
.rt-inline-error { font-weight:600; font-size:10.5px; color:${RED}; }
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
.rt-send-btn { margin:0; width:100%; height:100%; border-radius:9999px; border:1.5px solid rgba(94,158,255,0.7); background:transparent; font-weight:300; font-size:13.5px; color:${TEXT_SOFT}; cursor:pointer; transition:background .15s ease, border-color .2s ease, color .2s ease; }
.rt-send-btn:hover:not(:disabled) { background:rgba(94,158,255,0.08); }
.rt-send-btn:disabled { opacity:0.55; cursor:default; }
.rt-send-btn-split { margin:0; font-weight:700; }
/* Zone C fills with whichever primary action the mode owns. */
.terminal-zone-c > .rt-new-sale { width:100%; height:100%; align-self:auto; padding:0; }
/* Sits under the CTA without adding to Zone C's fixed 46px box. */
.rt-cta-status { position:absolute; left:0; top:calc(100% + 8px); width:100%; text-align:center; }

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

.rt-split-lead { font-weight:600; font-size:15px; color:rgba(198,207,226,0.8); }
.rt-split-body { margin-top:24px; display:flex; flex-direction:column; gap:18px; }
.rt-split-chips { display:flex; gap:10px; }
.rt-split-chip { flex:1; height:44px; border-radius:9999px; font-size:12.5px; cursor:pointer; transition:background .15s ease, color .15s ease; }
.rt-split-each { display:flex; align-items:center; justify-content:space-between; height:54px; padding:0 20px; box-sizing:border-box; border-radius:12px; border:1.5px solid rgba(94,158,255,0.55); font-weight:600; font-size:13px; color:rgba(244,246,255,0.6); }
.rt-split-each-amt { font-family:'Outfit',sans-serif; font-weight:800; font-size:20px; color:${TEXT_SOFT}; }

/* share */

.rt-share-head { font-weight:300; font-size:15px; color:${KP_INK}; }
.rt-share-sub { margin-top:4px; font-weight:500; font-size:12px; color:rgba(244,246,255,0.45); }
.rt-share-body { margin-top:28px; display:flex; flex-direction:column; gap:14px; }
.rt-share-link { display:flex; align-items:center; gap:12px; height:54px; padding:0 20px; box-sizing:border-box; border-radius:12px; border:1.5px solid rgba(94,158,255,0.55); }
.rt-share-url { flex:1; min-width:0; font-weight:600; font-size:13px; color:${TEXT_SOFT}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rt-share-copy { font-weight:700; font-size:12px; color:${ACCENT_SOFT}; cursor:pointer; flex:0 0 auto; background:transparent; }
.rt-share-actions { display:flex; gap:10px; }
.rt-share-act { flex:1; display:inline-flex; align-items:center; justify-content:center; gap:8px; height:44px; border-radius:9999px; border:1.5px solid rgba(94,158,255,0.55); background:transparent; font-weight:600; font-size:12.5px; color:${ACCENT_SOFT}; cursor:pointer; transition:background .15s ease; }
.rt-share-act:hover { background:rgba(94,158,255,0.08); }
.rt-current-destination { font-weight:600; font-size:11px; color:rgba(244,246,255,0.48); text-transform:lowercase; }
.rt-new-sale { align-self:flex-start; padding:8px 17px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); background:transparent; font-weight:700; font-size:11.5px; color:${ACCENT_SOFT}; cursor:pointer; }
.rt-share-empty-state { margin-top:28px; display:flex; flex-direction:column; align-items:flex-start; gap:18px; padding:22px; border-radius:14px; border:1px solid rgba(94,158,255,0.35); font-weight:500; font-size:12.5px; color:rgba(244,246,255,0.62); }
.rt-share-empty-state p { margin:0; }
`;
