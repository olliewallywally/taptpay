import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { getCurrentMerchantId } from "@/lib/auth";
import {
  type LucideIcon,
  Search, Plus, Package, Trash2, X, ChevronDown, ChevronUp,
  ArrowUpAZ, ArrowDownAZ, ArrowUp01, ArrowDown01,
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface VariationOption {
  label: string;
  priceModifier: number;
}
interface VariationGroup {
  name: string;
  options: VariationOption[];
}
interface StockItem {
  id: number;
  name: string;
  cost: string | number;
  description?: string;
  emoji?: string | null;
  variations?: VariationGroup[] | null;
}

type SortKey = "az" | "za" | "price-asc" | "price-desc";

const EMOJI_OPTIONS = [
  "☕","🍕","🍔","🍟","🌮","🍣","🍜","🥗","🍰","🧁",
  "🍺","🥤","🍷","🧃","🥛","🍫","🍬","🍭","🎁","🛍️",
  "👕","👗","👟","🎮","📱","💻","⌚","💍","🌸","🎵",
  "🏋️","🚗","🏠","🌿","🐾","✂️","🔑","📦","🧴","💊",
];

function EmojiPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm text-gray-700 font-medium hover:text-[#0055FF] transition-colors"
      >
        <span className="text-xl leading-none">{value || "🏷️"}</span>
        <span>{value ? "Change icon" : "Add icon"}</span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-2 space-y-1">
          <div className="grid grid-cols-10 gap-1 bg-gray-50 rounded-xl p-2 border border-gray-200">
            {EMOJI_OPTIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => { onChange(e); setOpen(false); }}
                className={`text-xl p-1 rounded-lg transition-colors hover:bg-blue-50 ${value === e ? "bg-blue-100 ring-2 ring-[#0055FF]" : ""}`}
              >
                {e}
              </button>
            ))}
          </div>
          {value && (
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Clear icon
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function VariationsBuilder({
  variations,
  onChange,
}: {
  variations: VariationGroup[];
  onChange: (v: VariationGroup[]) => void;
}) {
  const addGroup = () =>
    onChange([...variations, { name: "", options: [{ label: "", priceModifier: 0 }] }]);

  const updateGroup = (gi: number, patch: Partial<VariationGroup>) =>
    onChange(variations.map((g, i) => (i === gi ? { ...g, ...patch } : g)));

  const removeGroup = (gi: number) => onChange(variations.filter((_, i) => i !== gi));

  const addOption = (gi: number) =>
    updateGroup(gi, { options: [...variations[gi].options, { label: "", priceModifier: 0 }] });

  const updateOption = (gi: number, oi: number, patch: Partial<VariationOption>) =>
    updateGroup(gi, {
      options: variations[gi].options.map((o, i) => (i === oi ? { ...o, ...patch } : o)),
    });

  const removeOption = (gi: number, oi: number) =>
    updateGroup(gi, { options: variations[gi].options.filter((_, i) => i !== oi) });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-gray-700 font-medium text-sm">Variations</Label>
        <button
          type="button"
          onClick={addGroup}
          className="flex items-center gap-1 text-xs text-[#0055FF] font-medium hover:text-[#0044DD]"
        >
          <Plus size={13} /> Add group
        </button>
      </div>

      {variations.length === 0 && (
        <p className="text-xs text-gray-400 italic">
          No variations yet — e.g. Size, Colour, Material
        </p>
      )}

      {variations.map((group, gi) => (
        <div key={gi} className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50">
          <div className="flex items-center gap-2">
            <input
              value={group.name}
              onChange={(e) => updateGroup(gi, { name: e.target.value })}
              placeholder="e.g. Size, Colour"
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#0055FF] bg-white"
            />
            <button
              type="button"
              onClick={() => removeGroup(gi)}
              className="text-red-400 hover:text-red-600"
            >
              <X size={15} />
            </button>
          </div>

          <div className="space-y-1.5 pl-1">
            {group.options.map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <input
                  value={opt.label}
                  onChange={(e) => updateOption(gi, oi, { label: e.target.value })}
                  placeholder="e.g. Large, Red"
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#0055FF] bg-white"
                />
                <div className="relative flex items-center">
                  <span className="absolute left-2.5 text-gray-400 text-xs">+$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={opt.priceModifier === 0 ? "" : opt.priceModifier}
                    onChange={(e) =>
                      updateOption(gi, oi, { priceModifier: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="0.00"
                    className="w-20 pl-7 text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#0055FF] bg-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeOption(gi, oi)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => addOption(gi)}
              className="text-xs text-gray-500 hover:text-[#0055FF] flex items-center gap-1 mt-1"
            >
              <Plus size={11} /> Add option
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProductSheet({
  item,
  isAdd,
  onClose,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
}: {
  item: Partial<StockItem> & { name: string; cost: string; variations: VariationGroup[] };
  isAdd: boolean;
  onClose: () => void;
  onSave: (item: Partial<StockItem> & { name: string; cost: string; variations: VariationGroup[] }) => void;
  onDelete?: () => void;
  isSaving: boolean;
  isDeleting: boolean;
}) {
  const [form, setForm] = useState(item);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showVariations, setShowVariations] = useState(
    !!(item.variations && item.variations.length > 0)
  );

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="flex flex-col h-full">
      {/* Sheet header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
        <h2 className="text-[#0055FF] text-lg font-semibold">
          {isAdd ? "New product" : "Edit product"}
        </h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
          <X size={20} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Emoji picker */}
        <EmojiPicker value={form.emoji || ""} onChange={(e) => set({ emoji: e })} />

        {/* Name */}
        <div>
          <Label className="text-gray-700 font-medium text-sm">Product name *</Label>
          <Input
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. Flat White"
            className="mt-1 border-2 border-gray-200 focus:border-[#0055FF] focus-visible:ring-0 bg-white"
            data-testid="input-product-name"
          />
        </div>

        {/* Price */}
        <div>
          <Label className="text-gray-700 font-medium text-sm">Base price ($) *</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={form.cost}
            onChange={(e) => set({ cost: e.target.value })}
            placeholder="0.00"
            className="mt-1 border-2 border-gray-200 focus:border-[#0055FF] focus-visible:ring-0 bg-white"
            data-testid="input-price"
          />
        </div>

        {/* Description */}
        <div>
          <Label className="text-gray-700 font-medium text-sm">Description</Label>
          <Input
            value={form.description || ""}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Optional short description"
            className="mt-1 border-2 border-gray-200 focus:border-[#0055FF] focus-visible:ring-0 bg-white"
            data-testid="input-description"
          />
        </div>

        {/* Variations toggle */}
        <button
          type="button"
          onClick={() => setShowVariations((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-[#0055FF] transition-colors"
        >
          {showVariations ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {showVariations ? "Hide variations" : "Add variations (size, colour…)"}
        </button>

        {showVariations && (
          <VariationsBuilder
            variations={form.variations || []}
            onChange={(v) => set({ variations: v })}
          />
        )}
      </div>

      {/* Footer actions */}
      <div className="px-5 py-4 border-t border-gray-100 space-y-3 shrink-0">
        {!isAdd && confirmDelete ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
            <p className="text-sm text-red-700 font-medium">Delete this product?</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmDelete(false)}
                className="flex-1 text-sm"
              >
                Cancel
              </Button>
              <Button
                onClick={onDelete}
                disabled={isDeleting}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm"
                data-testid="button-delete"
              >
                {isDeleting ? "Deleting…" : "Yes, delete"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            {!isAdd && (
              <Button
                variant="outline"
                onClick={() => setConfirmDelete(true)}
                className="border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 px-3"
              >
                <Trash2 size={16} />
              </Button>
            )}
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 border-gray-200 text-gray-600"
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={() => onSave(form)}
              disabled={isSaving}
              className="flex-1 bg-[#0055FF] hover:bg-[#0044DD] text-white"
              data-testid={isAdd ? "button-confirm-add" : "button-update"}
            >
              {isSaving ? "Saving…" : isAdd ? "Add product" : "Save"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

const blankItem = () => ({ name: "", cost: "", description: "", emoji: "", variations: [] as VariationGroup[] });

export default function StockManagement() {
  const [, setLocation] = useLocation();
  const [sheetItem, setSheetItem] = useState<(Partial<StockItem> & { name: string; cost: string; variations: VariationGroup[] }) | null>(null);
  const [isAdd, setIsAdd] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("az");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const merchantId = getCurrentMerchantId();

  if (!merchantId) {
    setLocation("/login");
    return null;
  }

  const { data: stockItems = [], isLoading } = useQuery({
    queryKey: ["/api/merchants", merchantId, "stock-items"],
    queryFn: async () => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}/stock-items`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch stock items");
      return response.json();
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async (item: typeof sheetItem) => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}/stock-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(item),
      });
      if (!response.ok) throw new Error("Failed to add stock item");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "stock-items"] });
      setSheetItem(null);
      toast({ title: "Product added" });
    },
    onError: () => toast({ title: "Failed to add product", variant: "destructive" }),
  });

  const updateItemMutation = useMutation({
    mutationFn: async (item: StockItem & { variations: VariationGroup[] }) => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}/stock-items/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: item.name,
          cost: item.cost,
          description: item.description,
          emoji: item.emoji,
          variations: item.variations,
        }),
      });
      if (!response.ok) throw new Error("Failed to update stock item");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "stock-items"] });
      setSheetItem(null);
      toast({ title: "Product updated" });
    },
    onError: () => toast({ title: "Failed to update product", variant: "destructive" }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: number) => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}/stock-items/${itemId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to delete stock item");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "stock-items"] });
      setSheetItem(null);
      toast({ title: "Product deleted" });
    },
    onError: () => toast({ title: "Failed to delete product", variant: "destructive" }),
  });

  const openAdd = () => {
    setIsAdd(true);
    setSheetItem(blankItem());
  };

  const openEdit = (item: StockItem) => {
    setIsAdd(false);
    setSheetItem({
      ...item,
      cost: typeof item.cost === "number" ? item.cost.toString() : item.cost,
      emoji: item.emoji || "",
      variations: (item.variations as VariationGroup[]) || [],
    });
  };

  const handleSave = (form: typeof sheetItem) => {
    if (!form?.name || !form?.cost) {
      toast({ title: "Name and price are required", variant: "destructive" });
      return;
    }
    if (isAdd) {
      addItemMutation.mutate(form);
    } else {
      updateItemMutation.mutate(form as StockItem & { variations: VariationGroup[] });
    }
  };

  const handleDelete = () => {
    if (sheetItem && (sheetItem as StockItem).id) {
      deleteItemMutation.mutate((sheetItem as StockItem).id);
    }
  };

  const filteredAndSorted = useMemo(() => {
    const filtered = (stockItems as StockItem[]).filter(
      (item) =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );
    return [...filtered].sort((a, b) => {
      if (sortKey === "az") return a.name.localeCompare(b.name);
      if (sortKey === "za") return b.name.localeCompare(a.name);
      if (sortKey === "price-asc") return parseFloat(String(a.cost)) - parseFloat(String(b.cost));
      return parseFloat(String(b.cost)) - parseFloat(String(a.cost));
    });
  }, [stockItems, searchQuery, sortKey]);

  const totalValue = (stockItems as StockItem[]).reduce(
    (s, i) => s + parseFloat(String(i.cost || 0)),
    0
  );

  const sortButtons: { key: SortKey; icon: LucideIcon; label: string }[] = [
    { key: "az", icon: ArrowUpAZ, label: "A–Z" },
    { key: "za", icon: ArrowDownAZ, label: "Z–A" },
    { key: "price-asc", icon: ArrowUp01, label: "Price ↑" },
    { key: "price-desc", icon: ArrowDown01, label: "Price ↓" },
  ];

  return (
    <div className="min-h-screen bg-gray-100 pb-28">
      {/* Header */}
      <div className="relative">
        <div
          className="absolute left-0 right-0 h-[80px] sm:h-[106px] bg-[#00E5CC] rounded-b-[60px] sm:rounded-b-[100px] z-0"
          style={{ bottom: "-20px" }}
        />
        <div className="bg-[#0055FF] pt-6 sm:pt-8 pb-10 sm:pb-12 rounded-b-[60px] sm:rounded-b-[100px] relative z-10">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <h1 className="text-[#00E5CC] text-center text-xl sm:text-2xl md:text-3xl mb-6">
              inventory
            </h1>

            {/* Search */}
            <div className="relative mb-4">
              <input
                type="text"
                placeholder="Search products…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/10 backdrop-blur-sm border border-[#00E5CC]/30 rounded-full px-5 py-3 pl-12 text-white placeholder-[#00E5CC]/60 focus:outline-none focus:border-[#00E5CC]"
                data-testid="input-search"
              />
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[#00E5CC]"
                size={18}
              />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {[
                { label: "Total items", value: stockItems.length, color: "text-[#00E5CC]" },
                {
                  label: "Total value",
                  value: `$${totalValue.toFixed(2)}`,
                  color: "text-yellow-300",
                },
                {
                  label: "Showing",
                  value: filteredAndSorted.length,
                  color: "text-[#00E5CC]",
                },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-3 sm:p-4 text-center"
                >
                  <div className={`${color} text-xl sm:text-2xl font-semibold`} data-testid={label === "Total items" ? "text-total-items" : undefined}>
                    {value}
                  </div>
                  <div className="text-[#00E5CC]/70 text-[11px] sm:text-xs mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 mt-10 sm:mt-12 relative z-10">
        {/* Toolbar: sort + add */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-1 flex-1 flex-wrap">
            {sortButtons.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setSortKey(key)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  sortKey === key
                    ? "bg-[#0055FF] text-white shadow-sm"
                    : "bg-white text-gray-500 border border-gray-200 hover:border-[#0055FF] hover:text-[#0055FF]"
                }`}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-[#0055FF] text-white rounded-full px-4 py-2 text-sm font-medium hover:bg-[#0044DD] transition-colors shadow-md"
            data-testid="button-add-product"
          >
            <Plus size={16} /> Add
          </button>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-2xl bg-white/40 animate-pulse"
              />
            ))}
          </div>
        ) : filteredAndSorted.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Package size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              {searchQuery ? "No products match your search" : "No products yet — add your first!"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredAndSorted.map((item) => {
              const hasVariations = item.variations && (item.variations as VariationGroup[]).length > 0;
              return (
                <button
                  key={item.id}
                  onClick={() => openEdit(item)}
                  data-testid={`card-product-${item.id}`}
                  className="group relative flex flex-col items-center justify-between text-left rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-md hover:shadow-lg"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.3) 100%)",
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    border: "1px solid rgba(255,255,255,0.6)",
                  }}
                >
                  {/* Subtle inner glow */}
                  <div className="absolute inset-0 rounded-2xl pointer-events-none"
                    style={{
                      background: "linear-gradient(135deg, rgba(0,85,255,0.06) 0%, rgba(0,229,204,0.04) 100%)",
                    }}
                  />

                  <div className="relative w-full p-3 sm:p-4 flex flex-col gap-2 min-h-[120px] sm:min-h-[140px]">
                    {/* Emoji / icon */}
                    <div className="text-3xl sm:text-4xl leading-none select-none">
                      {item.emoji || <Package size={28} className="text-gray-300" />}
                    </div>

                    {/* Name — two-line clamp */}
                    <p className="text-[#1a1b2e] font-semibold text-sm sm:text-base leading-tight line-clamp-2 flex-1">
                      {item.name}
                    </p>

                    {/* Price */}
                    <p className="text-[#0055FF] font-bold text-base sm:text-lg">
                      ${parseFloat(String(item.cost)).toFixed(2)}
                    </p>

                    {/* Variations badge */}
                    {hasVariations && (
                      <span className="absolute top-2 right-2 text-[10px] bg-[#0055FF]/10 text-[#0055FF] rounded-full px-1.5 py-0.5 font-medium">
                        {(item.variations as VariationGroup[]).length}v
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Product bottom-sheet */}
      <Sheet open={!!sheetItem} onOpenChange={(open) => !open && setSheetItem(null)}>
        <SheetContent
          side="bottom"
          className="bg-white rounded-t-3xl p-0 h-[92dvh] flex flex-col overflow-hidden [&>button]:hidden"
        >
          {sheetItem && (
            <ProductSheet
              item={sheetItem}
              isAdd={isAdd}
              onClose={() => setSheetItem(null)}
              onSave={handleSave}
              onDelete={handleDelete}
              isSaving={addItemMutation.isPending || updateItemMutation.isPending}
              isDeleting={deleteItemMutation.isPending}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
