import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getCurrentMerchantId } from "@/lib/auth";
import { Download, FileSpreadsheet, RotateCcw, AlertCircle, Mail, MessageCircle, Link2, Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import QRCode from "qrcode";

interface Transaction {
  id: number;
  price: string;
  status: string;
  itemName: string;
  paymentMethod: string;
  createdAt: string;
  refundableAmount?: string;
  totalRefunded?: string;
  windcaveTransactionId?: string;
  merchantNet?: string;
}

/* ── Design tokens ── */
const C = {
  navy:   '#040D6D',
  sky:    '#58ABFF',
  white:  '#FFFFFF',
  sheet:  '#F4F4F4',
  handle: 'rgba(0,0,0,0.08)',
  dark:   '#1a1a1a',
  muted:  'rgba(0,0,0,0.35)',
};

type Timeframe = 'day' | 'week' | 'month' | 'year';

/* ── SVG chart helpers (ported from property-analytics) ── */
function toSmooth(pts: number[], W: number, H: number, pad = 8) {
  const n = pts.length;
  if (n < 2) return { d: '', coords: [] as {x:number;y:number}[] };
  const sx = (W - pad * 2) / (n - 1);
  const coords = pts.map((v, i) => ({ x: pad + i * sx, y: pad + ((100 - v) / 100) * (H - pad * 2) }));
  let d = `M${coords[0].x},${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1], curr = coords[i];
    const cpx = (prev.x + curr.x) / 2;
    d += ` C${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`;
  }
  return { d, coords };
}
function toArea(pts: number[], W: number, H: number, pad = 8) {
  const { d } = toSmooth(pts, W, H, pad);
  if (!d) return '';
  return d + ` L${W - pad},${H} L${pad},${H} Z`;
}

function buildChartData(txs: Transaction[], tf: Timeframe) {
  const now = new Date();
  const buckets = 10;
  let getKey: (d: Date) => number;
  if (tf === 'day')   getKey = d => Math.floor((now.getTime() - d.getTime()) / (2.4 * 3600000));
  else if (tf === 'week')  getKey = d => Math.floor((now.getTime() - d.getTime()) / (16.8 * 3600000));
  else if (tf === 'month') getKey = d => Math.floor((now.getTime() - d.getTime()) / (72 * 3600000));
  else                     getKey = d => Math.floor((now.getTime() - d.getTime()) / (876 * 3600000));

  const rev: number[] = Array(buckets).fill(0);
  const cnt: number[] = Array(buckets).fill(0);

  txs.forEach(tx => {
    if (tx.status !== 'completed') return;
    const date = new Date(tx.createdAt);
    const bucket = Math.max(0, Math.min(buckets - 1, getKey(date)));
    rev[buckets - 1 - bucket] += parseFloat(tx.price);
    cnt[buckets - 1 - bucket] += 1;
  });

  const maxVal = Math.max(...rev, 1);
  const maxCnt = Math.max(...cnt, 1);
  return {
    primary:   rev.map(v => Math.round((v / maxVal) * 90) + 5),
    secondary: cnt.map(v => Math.round((v / maxCnt) * 90) + 5),
  };
}

export default function Transactions() {
  const [, setLocation] = useLocation();
  const [tf, setTf] = useState<Timeframe>('week');
  const [totVis, setTotVis] = useState(true);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [isActioning, setIsActioning] = useState(false);
  const [showRefundForm, setShowRefundForm] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [showShare, setShowShare] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [showDownloads, setShowDownloads] = useState(false);

  /* Swipeable sheet */
  const topRef    = useRef<HTMLDivElement>(null);
  const sheetRef  = useRef<HTMLDivElement>(null);
  const dragStartY   = useRef(0);
  const dragStartOff = useRef(0);
  const [measuredTop, setMeasuredTop] = useState<number | null>(null);
  const [sheetOffset, setSheetOffset] = useState<number | null>(null); // null = resting at default
  const [dragging, setDragging] = useState(false);
  const { toast } = useToast();
  const merchantId = getCurrentMerchantId();

  if (!merchantId) {
    setLocation('/login');
    return null;
  }

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["/api/merchants", merchantId, "transactions"],
    queryFn: async () => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}/transactions`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch transactions");
      return response.json();
    },
  });

  const { data: merchant } = useQuery({
    queryKey: ["/api/merchants", merchantId],
    queryFn: async () => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch merchant");
      return response.json();
    },
    enabled: !!merchantId,
  });

  const refundMutation = useMutation({
    mutationFn: async ({ txId, amount, reason }: { txId: number; amount: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/transactions/${txId}/refunds`, {
        refundAmount: amount,
        refundReason: reason,
        refundMethod: "original_payment_method",
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Refund successful", description: data.message || "The refund has been processed." });
      setShowRefundForm(false);
      setRefundAmount("");
      setRefundReason("");
      if (data.transaction) {
        setSelectedTx((prev) => prev ? { ...prev, ...data.transaction } : null);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "transactions"] });
    },
    onError: (err: any) => {
      toast({ title: "Refund failed", description: err.message || "Could not process refund.", variant: "destructive" });
    },
  });

  const handleRefundSubmit = () => {
    if (!selectedTx) return;
    const amount = parseFloat(refundAmount);
    const maxRefundable = parseFloat(selectedTx.refundableAmount || selectedTx.price);
    if (!refundAmount || isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid amount", description: "Please enter a valid refund amount.", variant: "destructive" });
      return;
    }
    if (amount > maxRefundable) {
      toast({ title: "Amount too high", description: `Maximum refundable amount is $${maxRefundable.toFixed(2)}.`, variant: "destructive" });
      return;
    }
    if (!refundReason.trim()) {
      toast({ title: "Reason required", description: "Please enter a reason for the refund.", variant: "destructive" });
      return;
    }
    refundMutation.mutate({ txId: selectedTx.id, amount: amount.toFixed(2), reason: refundReason.trim() });
  };

  const fetchPdfBlob = async (txId: number): Promise<Blob> => {
    const token = localStorage.getItem("authToken");
    const response = await fetch(`/api/transactions/${txId}/receipt-pdf`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Failed to generate PDF");
    return response.blob();
  };

  const handleDownload = async (tx: Transaction) => {
    setIsActioning(true);
    try {
      const blob = await fetchPdfBlob(tx.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `receipt-${tx.id}-${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", description: "Could not generate receipt PDF.", variant: "destructive" });
    } finally {
      setIsActioning(false);
    }
  };


  /* Timeframe filter */
  const cutoff = useMemo(() => {
    const now = new Date();
    return {
      day:   new Date(now.getTime() - 24 * 3600000),
      week:  new Date(now.getTime() - 7 * 86400000),
      month: new Date(now.getTime() - 30 * 86400000),
      year:  new Date(now.getTime() - 365 * 86400000),
    }[tf];
  }, [tf]);

  const filteredTransactions = useMemo(() =>
    (transactions as Transaction[]).filter(tx => new Date(tx.createdAt) >= cutoff),
    [transactions, cutoff]
  );

  const totalRevenue = filteredTransactions
    .filter((tx: Transaction) => tx.status === 'completed')
    .reduce((sum: number, tx: Transaction) => sum + parseFloat(tx.price), 0);

  const totalTransactions = filteredTransactions.filter((tx: Transaction) => tx.status === 'completed').length;

  const switchTf = (p: Timeframe) => {
    if (p === tf) return;
    setTotVis(false);
    setTimeout(() => { setTf(p); setTotVis(true); }, 150);
  };

  const chart = useMemo(() =>
    (transactions as Transaction[]).length > 0
      ? buildChartData(transactions as Transaction[], tf)
      : { primary: Array(10).fill(5), secondary: Array(10).fill(5) },
    [transactions, tf]
  );

  /* ── Freely slidable sheet ──
     The sheet parks wherever the drag releases it — anywhere between fully
     covering the graph (0) and fully revealing it (defaultOffset). No snapping;
     only a spring back inside the bounds if the drag overshot them.
     Pointer events cover touch AND mouse, so it slides on desktop too. */
  useEffect(() => {
    const measure = () => {
      if (topRef.current) setMeasuredTop(topRef.current.offsetHeight + 12);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (topRef.current) ro.observe(topRef.current);
    return () => ro.disconnect();
  }, []);

  const defaultOffset = measuredTop ?? 340;
  const currentOffset = sheetOffset ?? defaultOffset;

  const onDragStart = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartY.current   = e.clientY;
    dragStartOff.current = currentOffset;
    setDragging(true);
  }, [currentOffset]);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const raw = dragStartOff.current + (e.clientY - dragStartY.current);
    // Small rubber-band past both ends while the finger is down
    setSheetOffset(Math.max(-24, Math.min(defaultOffset + 40, raw)));
  }, [dragging, defaultOffset]);

  const onDragEnd = useCallback(() => {
    setDragging(false);
    // Stay put — just spring back inside the bounds if overshot
    setSheetOffset(o => o === null ? null : Math.max(0, Math.min(defaultOffset, o)));
  }, [defaultOffset]);

  /* QR code for selected transaction */
  useEffect(() => {
    if (!selectedTx) { setQrDataUrl(''); return; }
    const url = `${window.location.origin}/receipt/${selectedTx.id}`;
    QRCode.toDataURL(url, { width: 200, margin: 2, color: { dark: C.navy, light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [selectedTx]);

  const handleDownloadCSV = () => {
    const headers = ['ID', 'Date', 'Time', 'Item', 'Amount', 'Method', 'Status'];
    const rows = filteredTransactions.map((tx: Transaction) => {
      const date = new Date(tx.createdAt);
      return [
        tx.id,
        date.toLocaleDateString(),
        date.toLocaleTimeString(),
        tx.itemName,
        parseFloat(tx.price).toFixed(2),
        tx.paymentMethod,
        tx.status,
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((row: any[]) => row.map((cell: any) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast({ title: "CSV file downloaded successfully" });
  };

  const handleDownloadXeroCSV = () => {
    const xeroTransactions = filteredTransactions.filter(
      (tx: Transaction) => tx.status === 'completed' || tx.status === 'partially_refunded'
    );

    if (xeroTransactions.length === 0) {
      toast({ title: "No transactions to export", description: "There are no completed transactions in the selected date range.", variant: "destructive" });
      return;
    }

    const headers = ['Date', 'Amount', 'Payee', 'Description', 'Reference'];
    const rows: string[][] = [];

    xeroTransactions.forEach((tx: Transaction) => {
      const date = new Date(tx.createdAt);
      const dd = String(date.getDate()).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const yyyy = date.getFullYear();
      const xeroDate = `${dd}/${mm}/${yyyy}`;

      const amount = parseFloat(tx.merchantNet || tx.price).toFixed(2);
      const payee = tx.itemName;
      const method = tx.paymentMethod.replace(/_/g, ' ');
      const description = `${method} - ${tx.itemName}`;
      const reference = `TAPT-${tx.id}`;

      rows.push([xeroDate, amount, payee, description, reference]);

      const refunded = parseFloat(tx.totalRefunded || '0');
      if (refunded > 0) {
        rows.push([xeroDate, `-${refunded.toFixed(2)}`, payee, `Refund - ${tx.itemName}`, `TAPT-${tx.id}-R`]);
      }
    });

    const escapeCSV = (val: string) => `"${val.replace(/"/g, '""')}"`;
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map(escapeCSV).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const merchantSlug = (merchant?.businessName || merchant?.name || 'taptpay')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const fromStr = tf;
    const toStr = new Date().toISOString().split('T')[0];
    a.download = `${merchantSlug}-xero-${fromStr}_${toStr}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast({ title: "Xero CSV downloaded", description: "Upload this file to Xero via Bank Accounts > Import a Statement." });
  };

  const handleDownloadPDF = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}/export/pdf`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `business-report-${new Date().toISOString().split('T')[0]}.pdf`;
        a.click();
        toast({ title: "Business report downloaded successfully" });
      } else {
        toast({ title: "Failed to download report", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Failed to download report", variant: "destructive" });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-[#00E5CC]';
      case 'pending': return 'text-yellow-500';
      case 'failed': return 'text-red-500';
      case 'refunded': return 'text-purple-500';
      case 'partially_refunded': return 'text-orange-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-[#00E5CC]/10';
      case 'pending': return 'bg-yellow-500/10';
      case 'failed': return 'bg-red-500/10';
      case 'refunded': return 'bg-purple-500/10';
      case 'partially_refunded': return 'bg-orange-500/10';
      default: return 'bg-gray-500/10';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'partially_refunded': return 'partial refund';
      default: return status;
    }
  };

  return (
    <div style={{ background: '#FFFFFF', minHeight: '100svh', display: 'flex', justifyContent: 'center' }}>
    <div style={{ width: '100%', maxWidth: 430, height: '100svh', fontFamily: "'Outfit', system-ui, sans-serif", background: C.navy, position: 'relative', overflow: 'hidden' }}>

      {/* ── Dark top ── */}
      <div ref={topRef} style={{ padding: '52px 24px 0' }}>
        <div style={{ marginBottom: 20 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.white }}>analytics</span>
        </div>

        {/* Period pills */}
        <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.06)', borderRadius: 999, padding: 3, marginBottom: 20 }}>
          {(['day', 'week', 'month', 'year'] as Timeframe[]).map(p => (
            <button key={p} onClick={() => switchTf(p)} style={{ flex: 1, padding: '8px 0', borderRadius: 999, border: 'none', fontSize: 13, fontWeight: tf === p ? 600 : 500, textTransform: 'capitalize', background: tf === p ? C.sky : 'transparent', color: tf === p ? C.navy : 'rgba(255,255,255,0.4)', transition: 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
              {p}
            </button>
          ))}
        </div>

        {/* Total */}
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <p style={{ fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.4)', margin: 0, letterSpacing: '0.04em' }}>Revenue · {totalTransactions} transactions</p>
          <p style={{ fontSize: 46, fontWeight: 700, color: C.white, margin: 0, letterSpacing: '-2px', marginTop: 6, fontVariantNumeric: 'tabular-nums', opacity: totVis ? 1 : 0, transform: totVis ? 'translateY(0)' : 'translateY(6px)', transition: 'all 0.45s cubic-bezier(0.34,1.56,0.64,1)' as any }}>
            ${totalRevenue.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        {/* SVG Chart */}
        <div style={{ margin: '8px -24px 4px', overflow: 'visible' }}>
          {(() => {
            const W = 342, H = 100, pad = 8;
            const { d: pLine, coords: pCoords } = toSmooth(chart.primary, W, H, pad);
            const { d: sLine } = toSmooth(chart.secondary, W, H, pad);
            const pArea = toArea(chart.primary, W, H, pad);
            const sArea = toArea(chart.secondary, W, H, pad);
            const tipPt = pCoords[7] ?? { x: W - pad, y: H / 2 };
            return (
              <div style={{ position: 'relative', margin: '8px 0 4px', padding: '0 4px' }}>
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" style={{ display: 'block', overflow: 'visible' }}>
                  <defs>
                    <linearGradient id="ra1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.sky} stopOpacity="0.22" />
                      <stop offset="100%" stopColor={C.sky} stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="ra2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.sky} stopOpacity="0.08" />
                      <stop offset="100%" stopColor={C.sky} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {sArea && <path d={sArea} fill="url(#ra2)" />}
                  {sLine && <path d={sLine} fill="none" stroke={C.sky} strokeWidth="1.5" strokeOpacity="0.3" strokeDasharray="4 3" />}
                  {pArea && <path d={pArea} fill="url(#ra1)" />}
                  {pLine && <path d={pLine} fill="none" stroke={C.sky} strokeWidth="2" />}
                  <circle cx={tipPt.x} cy={tipPt.y} r="4" fill={C.sky} />
                  <circle cx={tipPt.x} cy={tipPt.y} r="7" fill={C.sky} fillOpacity="0.22" />
                </svg>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── Swipeable white sheet ── */}
      <div
        ref={sheetRef}
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: '100svh',
          background: C.sheet,
          borderRadius: '32px 32px 0 0',
          transform: `translateY(${currentOffset}px)`,
          transition: dragging ? 'none' : 'transform 0.38s cubic-bezier(0.34,1.56,0.64,1)',
          overflowY: currentOffset < 40 ? 'auto' : 'hidden',
          overflowX: 'hidden',
          willChange: 'transform',
        }}
      >
        {/* Drag handle */}
        <div
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          style={{ width: '100%', height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: dragging ? 'grabbing' : 'grab', flexShrink: 0, touchAction: 'none' }}
        >
          <div style={{ width: 40, height: 5, borderRadius: 3, background: C.handle }} />
        </div>

        <div style={{ padding: '0 20px 130px', marginTop: 2 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: C.dark, margin: 0, letterSpacing: '-0.4px' }}>Transaction History</h2>
            <button
              onClick={() => setShowDownloads(v => !v)}
              style={{ fontSize: 12, fontWeight: 600, color: C.sky, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              {showDownloads ? 'hide exports' : 'export →'}
            </button>
          </div>

          {/* Download section (collapsible) */}
          {showDownloads && (
            <div style={{ background: '#ffffff', borderRadius: 16, padding: 16, marginBottom: 16, border: '1px solid rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Export Data</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={handleDownloadPDF} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: C.navy, border: 'none', color: C.white, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <Download size={14} /> Business Report (PDF)
                </button>
                <button onClick={handleDownloadCSV} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: C.sky, border: 'none', color: C.navy, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <Download size={14} /> Raw Data (CSV)
                </button>
                <button onClick={handleDownloadXeroCSV} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: '#E8F4FD', border: 'none', color: '#0070BA', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <FileSpreadsheet size={14} /> Export for Xero
                </button>
              </div>
            </div>
          )}

          {/* Transaction list */}
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: C.muted, fontSize: 14 }}>Loading transactions…</div>
          ) : filteredTransactions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: C.muted, fontSize: 14 }}>No transactions in this period</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(filteredTransactions as Transaction[]).slice().reverse().map((tx: Transaction) => {
                const statusDot: Record<string, string> = { completed: '#22C55E', pending: '#F59E0B', failed: '#EF4444', refunded: '#8B5CF6', partially_refunded: '#F97316' };
                return (
                  <div
                    key={tx.id}
                    onClick={() => { setSelectedTx(tx); setShowRefundForm(false); setShowShare(false); setRefundAmount(""); setRefundReason(""); }}
                    style={{ background: '#ffffff', borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.05)' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.itemName}</div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                        {new Date(tx.createdAt).toLocaleString('en-NZ', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {' · '}
                        <span style={{ textTransform: 'capitalize' }}>{tx.paymentMethod.replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0, marginLeft: 12 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>${parseFloat(tx.price).toFixed(2)}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 6, height: 6, borderRadius: 999, background: statusDot[tx.status] || C.muted }} />
                        <span style={{ fontSize: 11, color: C.muted, textTransform: 'capitalize' }}>{getStatusLabel(tx.status)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Transaction Receipt Modal */}
      <Dialog open={!!selectedTx} onOpenChange={(open) => { if (!open) { setSelectedTx(null); setShowRefundForm(false); setShowShare(false); setRefundAmount(""); setRefundReason(""); } }}>
        <DialogContent className="max-w-md w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Transaction Receipt
            </DialogTitle>
          </DialogHeader>

          {selectedTx && (() => {
            const effectiveAmount = parseFloat(selectedTx.price);
            const gstAmount = (effectiveAmount * 0.15) / 1.15;
            const netAmount = effectiveAmount - gstAmount;
            const mName = (merchant as any)?.businessName || (merchant as any)?.name || "Merchant";

            return (
              <div className="space-y-4">
                {/* Transaction Details */}
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Transaction Details</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Transaction ID</span>
                    <span className="font-mono text-gray-800">#{selectedTx.id}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Date</span>
                    <span className="text-gray-800">{new Date(selectedTx.createdAt).toLocaleString("en-NZ", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Payment Method</span>
                    <span className="text-gray-800 capitalize">{selectedTx.paymentMethod.replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Status</span>
                    <span className={`font-medium ${getStatusColor(selectedTx.status)}`}>{getStatusLabel(selectedTx.status)}</span>
                  </div>
                </div>

                {/* Receipt Card */}
                <div className="border border-gray-200 rounded-lg p-4 text-gray-800">
                  <div className="text-center border-b border-gray-200 pb-3 mb-3">
                    <h3 className="font-semibold text-base">{mName}</h3>
                    {(merchant as any)?.businessAddress && (
                      <p className="text-xs text-gray-500 whitespace-pre-line mt-1">{(merchant as any).businessAddress}</p>
                    )}
                    {(merchant as any)?.contactPhone && <p className="text-xs text-gray-500">{(merchant as any).contactPhone}</p>}
                    {(merchant as any)?.contactEmail && <p className="text-xs text-gray-500">{(merchant as any).contactEmail}</p>}
                    {(merchant as any)?.gstNumber && <p className="text-xs text-gray-500 mt-1 font-medium">GST No: {(merchant as any).gstNumber}</p>}
                    {(merchant as any)?.nzbn && <p className="text-xs text-gray-500">NZBN: {(merchant as any).nzbn}</p>}
                  </div>

                  <div className="space-y-1 mb-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Items</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">{selectedTx.itemName}</span>
                      <span className="font-medium">${effectiveAmount.toFixed(2)}</span>
                    </div>
                  </div>

                  <Separator className="my-2" />

                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Cost Breakdown</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Subtotal (excl. GST)</span>
                      <span>${netAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">GST (15%)</span>
                      <span>${gstAmount.toFixed(2)}</span>
                    </div>
                    <Separator className="my-1" />
                    <div className="flex justify-between font-bold text-base">
                      <span>Total</span>
                      <span>${effectiveAmount.toFixed(2)}</span>
                    </div>
                  </div>

                  <p className="text-center text-xs text-gray-400 mt-3">Powered by TaptPay</p>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2">
                  <Button
                    onClick={() => handleDownload(selectedTx)}
                    disabled={isActioning}
                    className="w-full bg-[#040D6D] hover:bg-[#0a1880] text-white"
                  >
                    {isActioning ? (
                      <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Working...</>
                    ) : (
                      <><Download className="w-4 h-4 mr-2" />Download Receipt PDF</>
                    )}
                  </Button>
                  <Button
                    onClick={() => setShowShare(v => !v)}
                    variant="outline"
                    className="w-full border-[#040D6D] text-[#040D6D] hover:bg-blue-50"
                  >
                    <Share2 className="w-4 h-4 mr-2" />
                    {showShare ? 'Hide Share Options' : 'Share Receipt'}
                  </Button>

                  {/* Inline share panel */}
                  {showShare && (
                    <div style={{ borderRadius: 12, border: '1px solid rgba(4,13,109,0.12)', padding: 16, background: '#F8FAFF', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Share via</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {/* Email */}
                        <a
                          href={`mailto:?subject=Receipt from ${mName}&body=Your receipt for $${parseFloat(selectedTx.price).toFixed(2)} — view it here: ${window.location.origin}/receipt/${selectedTx.id}`}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: C.navy, textDecoration: 'none', color: C.white, fontSize: 13, fontWeight: 600 }}
                        >
                          <Mail size={14} /> Email
                        </a>
                        {/* SMS */}
                        <a
                          href={`sms:?body=Receipt from ${mName}: ${window.location.origin}/receipt/${selectedTx.id}`}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: C.navy, textDecoration: 'none', color: C.white, fontSize: 13, fontWeight: 600 }}
                        >
                          <MessageCircle size={14} /> Text
                        </a>
                        {/* WhatsApp */}
                        <a
                          href={`https://wa.me/?text=${encodeURIComponent(`Receipt from ${mName}: ${window.location.origin}/receipt/${selectedTx.id}`)}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: '#25D366', textDecoration: 'none', color: C.white, fontSize: 13, fontWeight: 600 }}
                        >
                          <MessageCircle size={14} /> WhatsApp
                        </a>
                        {/* Copy link */}
                        <button
                          onClick={async () => {
                            await navigator.clipboard.writeText(`${window.location.origin}/receipt/${selectedTx.id}`);
                            setCopiedLink(true);
                            setTimeout(() => setCopiedLink(false), 2000);
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: copiedLink ? '#22C55E' : C.sky, border: 'none', color: C.navy, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                        >
                          {copiedLink ? <Check size={14} /> : <Link2 size={14} />}
                          {copiedLink ? 'Copied!' : 'Copy link'}
                        </button>
                      </div>
                      {/* QR code */}
                      {qrDataUrl && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <p style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>QR Code</p>
                          <img src={qrDataUrl} alt="Receipt QR code" style={{ width: 160, height: 160, borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)' }} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Refund button — only for completed / partially refunded transactions */}
                  {(selectedTx.status === "completed" || selectedTx.status === "partially_refunded") && (
                    parseFloat(selectedTx.refundableAmount || selectedTx.price) > 0
                  ) && (
                    <Button
                      variant="outline"
                      className="w-full border-red-400 text-red-500 hover:bg-red-50"
                      onClick={() => {
                        setShowRefundForm((v) => !v);
                        const max = parseFloat(selectedTx.refundableAmount || selectedTx.price);
                        setRefundAmount(max.toFixed(2));
                        setRefundReason("");
                      }}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      {showRefundForm ? "Cancel Refund" : "Issue Refund"}
                    </Button>
                  )}
                </div>

                {/* Inline refund form */}
                {showRefundForm && (selectedTx.status === "completed" || selectedTx.status === "partially_refunded") && (
                  <div className="border border-red-200 rounded-lg p-4 bg-red-50 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      <p className="text-sm font-medium text-red-700">Issue a Refund</p>
                    </div>
                    <p className="text-xs text-red-600">
                      Max refundable: <strong>${parseFloat(selectedTx.refundableAmount || selectedTx.price).toFixed(2)}</strong>
                      {selectedTx.totalRefunded && parseFloat(selectedTx.totalRefunded) > 0 && (
                        <> &nbsp;·&nbsp; Already refunded: <strong>${parseFloat(selectedTx.totalRefunded).toFixed(2)}</strong></>
                      )}
                    </p>
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Refund Amount (NZD)</label>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        max={parseFloat(selectedTx.refundableAmount || selectedTx.price)}
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        className="border-red-200 focus:border-red-400"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Reason for Refund</label>
                      <Textarea
                        value={refundReason}
                        onChange={(e) => setRefundReason(e.target.value)}
                        className="border-red-200 focus:border-red-400 text-sm"
                        placeholder="e.g. Customer requested refund, item out of stock..."
                        rows={2}
                      />
                    </div>
                    <Button
                      className="w-full bg-red-500 hover:bg-red-600 text-white"
                      onClick={handleRefundSubmit}
                      disabled={refundMutation.isPending}
                    >
                      {refundMutation.isPending ? (
                        <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Processing Refund...</>
                      ) : (
                        <><RotateCcw className="w-4 h-4 mr-2" />Confirm Refund ${parseFloat(refundAmount || "0").toFixed(2)}</>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}
