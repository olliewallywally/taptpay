import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCurrentMerchantId } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { periodWindow } from "@/lib/property-dashboard-data";
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

const EMOJI_OPTIONS = [
  "☕", "🍕", "🍔", "🍟", "🌮", "🍣", "🍜", "🥗", "🍰", "🧁",
  "🍺", "🥤", "🍷", "🧃", "🥛", "🍫", "🍬", "🍭", "🎁", "🛍️",
  "👕", "👗", "👟", "🎮", "📱", "💻", "⌚", "💍", "🌸", "🎵",
  "🏋️", "🚗", "🏠", "🌿", "🐾", "✂️", "🔑", "📦", "🧴", "💊",
];

type SortKey = "az" | "price-asc" | "price-desc";
const SORT_CHIPS: { v: string; key: SortKey }[] = [
  { v: "a–z", key: "az" },
  { v: "price ↑", key: "price-asc" },
  { v: "price ↓", key: "price-desc" },
];

interface VariationGroup {
  name: string;
  options: { label: string; priceModifier: number }[];
}
interface StockItem {
  id: number;
  name: string;
  cost: string | number;
  description?: string;
  emoji?: string | null;
  variations?: VariationGroup[] | null;
}

interface Tx {
  status: string;
  itemName?: string;
  createdAt: string;
}

const fmtPrice = (cost: unknown) =>
  "$" + parseFloat(String(cost ?? "0") || "0").toFixed(2);

/* Draft used by the add/edit modal. */
interface Draft {
  id?: number;
  name: string;
  cost: string;
  description: string;
  emoji: string;
  variations: VariationGroup[];
}

export default function DesktopRetailStock(props: DesktopRoutePageProps) {
  const merchantId = getCurrentMerchantId();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("az");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isAdd, setIsAdd] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const stockQuery = useQuery<StockItem[]>({
    queryKey: ["/api/merchants", merchantId, "stock-items"],
    queryFn: async () => {
      const token = localStorage.getItem("authToken");
      const res = await fetch(`/api/merchants/${merchantId}/stock-items`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch stock items");
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

  const stockItems = stockQuery.data ?? [];

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["/api/merchants", merchantId, "stock-items"],
    });

  const addMutation = useMutation({
    mutationFn: async (item: Draft) => {
      const token = localStorage.getItem("authToken");
      const res = await fetch(`/api/merchants/${merchantId}/stock-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(item),
      });
      if (!res.ok) throw new Error("Failed to add");
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setDraft(null);
      toast({ title: "Product added" });
    },
    onError: () => toast({ title: "Failed to add product", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (item: Draft) => {
      const token = localStorage.getItem("authToken");
      const res = await fetch(
        `/api/merchants/${merchantId}/stock-items/${item.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            name: item.name,
            cost: item.cost,
            description: item.description,
            emoji: item.emoji,
            variations: item.variations,
          }),
        },
      );
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setDraft(null);
      toast({ title: "Product updated" });
    },
    onError: () => toast({ title: "Failed to update product", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = localStorage.getItem("authToken");
      const res = await fetch(
        `/api/merchants/${merchantId}/stock-items/${id}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setDraft(null);
      toast({ title: "Product deleted" });
    },
    onError: () => toast({ title: "Failed to delete product", variant: "destructive" }),
  });

  /* Sold-this-week per item, matched from transaction itemName (real data —
     stock items carry no sold count). Best seller = highest such count. */
  const soldByName = useMemo(() => {
    const win = periodWindow("week");
    const map = new Map<string, number>();
    (txQuery.data ?? []).forEach((t) => {
      if (t.status !== "completed" || !t.itemName) return;
      const when = new Date(t.createdAt);
      if (when < win.start || when >= win.end) return;
      const key = t.itemName.trim().toLowerCase();
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [txQuery.data]);

  const soldOf = (name: string) => soldByName.get(name.trim().toLowerCase()) ?? 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = stockItems.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.description ?? "").toLowerCase().includes(q),
    );
    return [...list].sort((a, b) => {
      if (sortKey === "az") return a.name.localeCompare(b.name);
      if (sortKey === "price-asc")
        return parseFloat(String(a.cost)) - parseFloat(String(b.cost));
      return parseFloat(String(b.cost)) - parseFloat(String(a.cost));
    });
  }, [stockItems, search, sortKey]);

  const bestSeller = useMemo(() => {
    let best: { name: string; sold: number } | null = null;
    stockItems.forEach((i) => {
      const sold = soldOf(i.name);
      if (sold > 0 && (!best || sold > best.sold)) best = { name: i.name, sold };
    });
    return best as { name: string; sold: number } | null;
  }, [stockItems, soldByName]);

  const openAdd = () => {
    setIsAdd(true);
    setEmojiOpen(false);
    setDraft({ name: "", cost: "", description: "", emoji: "", variations: [] });
  };
  const openEdit = (item: StockItem) => {
    setIsAdd(false);
    setEmojiOpen(false);
    setDraft({
      id: item.id,
      name: item.name,
      cost: typeof item.cost === "number" ? String(item.cost) : item.cost,
      description: item.description ?? "",
      emoji: item.emoji ?? "",
      variations: (item.variations as VariationGroup[]) ?? [],
    });
  };
  const save = () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.cost.trim()) {
      toast({ title: "Name and price are required", variant: "destructive" });
      return;
    }
    (isAdd ? addMutation : updateMutation).mutate(draft);
  };

  const busy =
    addMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <DesktopPageScaffold {...props} vertical="retail" page="directory" showScope={false}>
      <style>{RS_CSS}</style>
      <div className="rs-body">
        {/* ── LEFT ── */}
        <div className="rs-left">
          <button type="button" className="rs-scope" aria-label="my store scope">
            <span>my store</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </button>

          <div className="rs-hero">
            <span className="rs-count">{stockQuery.isLoading ? "—" : stockItems.length}</span>
            <span className="rs-count-sub">products in inventory</span>
          </div>

          <div className="rs-search" data-tutorial-id="retail-stock-directory">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.8-3.8" /></svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search inventory"
              aria-label="search inventory"
            />
          </div>

          <div className="rs-sorts">
            {SORT_CHIPS.map((c) => {
              const active = c.key === sortKey;
              return (
                <button
                  key={c.key}
                  type="button"
                  className="rs-sort"
                  style={{
                    border: active ? "1px solid transparent" : "1px solid rgba(94,158,255,0.4)",
                    background: active ? ACTIVE : "transparent",
                    color: active ? NAVY : ACCENT_SOFT,
                    fontWeight: active ? 700 : 600,
                  }}
                  onClick={() => setSortKey(c.key)}
                >
                  {c.v}
                </button>
              );
            })}
          </div>

          <div className="rs-best">
            <span className="rs-best-label">BEST SELLER THIS WEEK</span>
            {bestSeller ? (
              <div className="rs-best-row">
                <span className="rs-best-name">{bestSeller.name}</span>
                <span className="rs-best-pill">{bestSeller.sold} sold</span>
              </div>
            ) : (
              <div className="rs-best-empty">no sales recorded yet this week</div>
            )}
          </div>
        </div>

        {/* ── RIGHT: card grid ── */}
        <div className="rs-right">
          <div className="rs-grid">
            <button type="button" className="rs-add" data-tutorial-id="retail-stock-add" aria-label="add product" onClick={openAdd}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              <span>add product</span>
            </button>

            {stockQuery.isLoading ? (
              <div className="rs-grid-msg">loading inventory…</div>
            ) : filtered.length === 0 ? (
              <div className="rs-grid-msg">
                {search ? "no matching products" : "no products yet — add your first"}
              </div>
            ) : (
              filtered.map((p) => {
                const sold = soldOf(p.name);
                return (
                  <div
                    key={p.id}
                    className="rs-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => openEdit(p)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") openEdit(p);
                    }}
                  >
                    <span className="rs-card-ico">
                      {p.emoji ? <span className="rs-emoji">{p.emoji}</span> : (
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={DEEP_BLUE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v8" /></svg>
                      )}
                    </span>
                    <span className="rs-card-name">{p.name}</span>
                    <span className="rs-card-sub">
                      {sold > 0 ? `${sold} sold this week` : "no sales this week"}
                    </span>
                    <span className="rs-card-price">{fmtPrice(p.cost)}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── add/edit modal ── */}
      {draft && (
        <div className="rs-modal-scrim" onClick={() => !busy && setDraft(null)}>
          <div className="rs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rs-modal-head">
              <span className="rs-modal-title">{isAdd ? "add product" : "edit product"}</span>
              <button type="button" className="rs-modal-x" aria-label="close" onClick={() => setDraft(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>

            {/* emoji */}
            <div className="rs-field">
              <button type="button" className="rs-emoji-btn" onClick={() => setEmojiOpen((o) => !o)}>
                <span className="rs-emoji-preview">{draft.emoji || "🏷️"}</span>
                <span>{draft.emoji ? "change icon" : "add icon"}</span>
              </button>
              {emojiOpen && (
                <div className="rs-emoji-grid">
                  {EMOJI_OPTIONS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className="rs-emoji-opt"
                      onClick={() => {
                        setDraft((d) => (d ? { ...d, emoji: e } : d));
                        setEmojiOpen(false);
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <label className="rs-label">name
              <input
                className="rs-input"
                value={draft.name}
                autoFocus
                onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                placeholder="flat white"
              />
            </label>

            <label className="rs-label">price
              <div className="rs-input rs-input-price">
                <span>$</span>
                <input
                  inputMode="decimal"
                  value={draft.cost}
                  onChange={(e) =>
                    setDraft((d) =>
                      d ? { ...d, cost: e.target.value.replace(/[^0-9.]/g, "") } : d,
                    )
                  }
                  placeholder="0.00"
                />
              </div>
            </label>

            <label className="rs-label">description <span className="rs-optional">optional</span>
              <input
                className="rs-input"
                value={draft.description}
                onChange={(e) => setDraft((d) => (d ? { ...d, description: e.target.value } : d))}
                placeholder="short note"
              />
            </label>

            {!isAdd && draft.variations.length > 0 && (
              <div className="rs-variations-note">
                {draft.variations.length} variation group
                {draft.variations.length === 1 ? "" : "s"} kept — edit these in the mobile app
              </div>
            )}

            <div className="rs-modal-foot">
              {!isAdd && (
                <button
                  type="button"
                  className="rs-btn rs-btn-danger"
                  disabled={busy}
                  onClick={() => draft.id != null && deleteMutation.mutate(draft.id)}
                >
                  delete
                </button>
              )}
              <div className="rs-modal-foot-right">
                <button type="button" className="rs-btn rs-btn-ghost" disabled={busy} onClick={() => setDraft(null)}>
                  cancel
                </button>
                <button type="button" className="rs-btn rs-btn-primary" disabled={busy} onClick={save}>
                  {busy ? "saving…" : isAdd ? "add product" : "save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DesktopPageScaffold>
  );
}

const RS_CSS = `
.rs-body { display:flex; gap:56px; height:100%; padding:26px 52px 0; }
.rs-left { flex:0 0 330px; display:flex; flex-direction:column; }
.rs-scope { align-self:flex-start; display:inline-flex; align-items:center; gap:9px; padding:10px 20px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); font-size:13.5px; color:${ACCENT_SOFT}; cursor:pointer; transition:background .18s ease; }
.rs-scope:hover { background:rgba(94,158,255,0.08); }
.rs-hero { margin-top:18px; display:flex; flex-direction:column; }
.rs-count { font-family:'Outfit',sans-serif; font-weight:700; font-size:96px; line-height:0.95; letter-spacing:-0.01em; color:${ACCENT}; font-variant-numeric:tabular-nums; }
.rs-count-sub { margin-top:6px; font-weight:300; font-size:16px; color:${NAV_DIM}; }
.rs-search { margin-top:56px; display:flex; align-items:center; gap:10px; width:300px; height:38px; padding:0 16px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); }
.rs-search input { flex:1; border:none; background:transparent; outline:none; color:#fff; font-family:'Outfit',sans-serif; font-weight:500; font-size:12px; }
.rs-sorts { margin-top:16px; display:flex; gap:8px; }
.rs-sort { padding:6px 13px; border-radius:9999px; font-size:11px; cursor:pointer; transition:background .15s ease, color .15s ease; }
.rs-best { margin-top:auto; padding-bottom:34px; display:flex; flex-direction:column; gap:10px; }
.rs-best-label { font-weight:300; font-size:11px; letter-spacing:0.22em; color:${ACCENT_SOFT}; }
.rs-best-row { display:flex; align-items:center; gap:14px; }
.rs-best-name { font-family:'Outfit',sans-serif; font-weight:800; font-size:34px; line-height:1; color:${TEXT_SOFT}; text-transform:lowercase; }
.rs-best-pill { padding:6px 12px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); font-weight:700; font-size:12px; color:${ACCENT_SOFT}; white-space:nowrap; }
.rs-best-empty { font-weight:300; font-size:12.5px; color:rgba(191,209,255,0.5); }

.rs-right { flex:1; min-width:0; padding-top:64px; }
.rs-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; overflow-y:auto; max-height:700px; padding-bottom:26px; }
.rs-grid-msg { grid-column:1 / -1; display:flex; align-items:center; justify-content:center; min-height:150px; font-weight:300; font-size:13px; color:rgba(191,209,255,0.5); }
.rs-add { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; height:150px; border-radius:16px; border:1.5px dashed rgba(94,158,255,0.55); background:transparent; cursor:pointer; transition:background .15s ease; }
.rs-add:hover { background:rgba(94,158,255,0.06); }
.rs-add span { font-weight:600; font-size:12.5px; color:${ACCENT_SOFT}; }
.rs-card { position:relative; display:flex; flex-direction:column; height:150px; border-radius:16px; background:#fff; padding:16px; cursor:pointer; transition:transform .15s ease, box-shadow .15s ease; }
.rs-card:hover { transform:translateY(-2px); box-shadow:0 12px 28px rgba(0,4,28,0.28); }
.rs-card:focus-visible { outline:2px solid ${ACCENT}; outline-offset:2px; }
.rs-card-ico { width:36px; height:36px; border-radius:11px; background:#EEF1F8; display:flex; align-items:center; justify-content:center; }
.rs-emoji { font-size:19px; line-height:1; }
.rs-card-name { margin-top:auto; font-weight:700; font-size:14.5px; color:${INK}; text-transform:lowercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rs-card-sub { margin-top:2px; font-weight:500; font-size:11px; color:#8A90A4; }
.rs-card-price { position:absolute; top:16px; right:16px; font-family:'Outfit',sans-serif; font-weight:800; font-size:15px; color:${DEEP_BLUE}; }

.rs-modal-scrim { position:absolute; inset:0; z-index:40; display:flex; align-items:center; justify-content:center; background:rgba(0,6,26,0.62); backdrop-filter:blur(3px); animation:reportIn .2s ease both; }
.rs-modal { width:420px; max-height:760px; overflow-y:auto; border-radius:20px; background:#071138; border:1px solid rgba(94,158,255,0.3); box-shadow:0 30px 80px rgba(0,0,0,0.5); padding:22px 24px; animation:tileIn .26s cubic-bezier(.22,.9,.3,1) both; }
.rs-modal-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:18px; }
.rs-modal-title { font-weight:700; font-size:18px; color:#fff; text-transform:capitalize; }
.rs-modal-x { width:30px; height:30px; border-radius:50%; border:1px solid rgba(94,158,255,0.4); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background .15s ease; }
.rs-modal-x:hover { background:rgba(94,158,255,0.12); }
.rs-field { margin-bottom:14px; }
.rs-emoji-btn { display:inline-flex; align-items:center; gap:9px; font-weight:500; font-size:13px; color:${ACCENT_SOFT}; cursor:pointer; }
.rs-emoji-preview { font-size:22px; line-height:1; }
.rs-emoji-grid { margin-top:10px; display:grid; grid-template-columns:repeat(10,1fr); gap:4px; padding:10px; border-radius:12px; background:rgba(94,158,255,0.06); border:1px solid rgba(94,158,255,0.18); }
.rs-emoji-opt { height:26px; border-radius:7px; font-size:16px; cursor:pointer; transition:background .12s ease; }
.rs-emoji-opt:hover { background:rgba(94,158,255,0.18); }
.rs-label { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; font-weight:600; font-size:11px; letter-spacing:0.16em; text-transform:uppercase; color:${ACCENT_SOFT}; }
.rs-optional { text-transform:none; letter-spacing:normal; font-weight:400; font-size:11px; color:rgba(191,209,255,0.5); }
.rs-input { display:flex; align-items:center; gap:6px; height:44px; padding:0 15px; border-radius:12px; background:rgba(255,255,255,0.05); border:1px solid rgba(94,158,255,0.28); color:#fff; font-family:'Outfit',sans-serif; font-weight:500; font-size:14px; letter-spacing:normal; text-transform:none; }
.rs-input:focus-within { border-color:${ACCENT}; }
.rs-input input, .rs-label > input.rs-input { flex:1; width:100%; border:none; background:transparent; outline:none; color:#fff; font-family:'Outfit',sans-serif; font-weight:500; font-size:14px; }
.rs-input-price span { color:${ACCENT_SOFT}; font-weight:600; }
.rs-variations-note { margin:-2px 0 14px; padding:10px 12px; border-radius:10px; background:rgba(240,163,78,0.1); border:1px solid rgba(240,163,78,0.28); font-weight:400; font-size:11.5px; color:#F0A34E; }
.rs-modal-foot { display:flex; align-items:center; justify-content:space-between; margin-top:6px; }
.rs-modal-foot-right { display:flex; gap:10px; margin-left:auto; }
.rs-btn { height:42px; padding:0 20px; border-radius:11px; font-weight:700; font-size:13px; cursor:pointer; transition:background .15s ease, opacity .15s ease; }
.rs-btn:disabled { opacity:0.55; cursor:default; }
.rs-btn-primary { background:${ACTIVE}; color:${NAVY}; }
.rs-btn-primary:hover:not(:disabled) { background:#79B4FF; }
.rs-btn-ghost { background:transparent; border:1px solid rgba(94,158,255,0.4); color:${ACCENT_SOFT}; }
.rs-btn-ghost:hover:not(:disabled) { background:rgba(94,158,255,0.1); }
.rs-btn-danger { background:transparent; border:1px solid rgba(240,101,108,0.45); color:#F0656C; }
.rs-btn-danger:hover:not(:disabled) { background:rgba(240,101,108,0.12); }
`;
