import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tradesFetch, tradesHeaders } from "@/lib/trades-api";
import { computeQuoteTotals } from "@shared/trades-gst";
import { TRADES_THEME } from "@/lib/trades-theme";
import ClientProfile from "./client-profile";
import { notifyIfBillingCardRequired } from "@/lib/queryClient";
import {
  QuoteView,
  TradesTerminalView,
  type QuoteDraftLine,
  type TradesTerminalScreen,
} from "@/features/terminal/trades/TradesTerminalView";

/* ═══ TOKENS (trades palette via TRADES_THEME — see trades-theme.ts) ═══ */
const NAVY  = TRADES_THEME.INK;    // charcoal base (was property NAVY)
const BLUE  = TRADES_THEME.ACCENT; // safety amber (was property BLUE)
const OFFW  = TRADES_THEME.OFFW;
const GREEN = TRADES_THEME.GREEN;
const RED   = TRADES_THEME.RED;

function clientName(client: any) {
  return client.firstName + ' ' + client.lastName;
}

const SUBBAR_ROUTE: Record<number, TradesTerminalScreen> = {
  0: 'clients',
  1: 'quote',
  2: 'invoice',
  3: 'external',
};

/* ═══ PRODUCTION QUOTE CONTROLLER ═══ */
export function QuoteScreen({ onCancel, onExit }: { onCancel: () => void; onExit: () => void }) {
  const queryClient = useQueryClient();
  const [clientId, setClientId]             = useState('');
  const [lines, setLines]                   = useState<QuoteDraftLine[]>([{ id: 1, description: '', qty: '1', unitPrice: '' }]);
  const [depositEnabled, setDepositEnabled] = useState(false);
  const [depositType, setDepositType]       = useState<'percent' | 'fixed'>('percent');
  const [depositValue, setDepositValue]     = useState('20');
  const [notes, setNotes]                   = useState('');
  const [created, setCreated]               = useState<any>(null);
  const [error, setError]                   = useState('');

  const { data: clients = [] } = useQuery<any[]>({
    queryKey: ['/api/trades/clients'],
    queryFn: () => tradesFetch('/api/trades/clients').then(r => r.ok ? r.json() : []),
  });
  const { data: auth } = useQuery<any>({
    queryKey: ['/api/auth/me', 'trades-quote'],
    queryFn: () => tradesFetch('/api/auth/me').then(r => r.ok ? r.json() : null),
  });

  const gstMode = auth?.user?.tradeGstMode === 'exclusive' ? 'exclusive' : 'inclusive';
  const totals = useMemo(() => {
    const lineInputs = lines.map(line => ({
      qty: Math.max(0, Number(line.qty) || 0),
      unitPriceCents: Math.max(0, Math.round((Number(line.unitPrice) || 0) * 100)),
    }));
    const depositInput = depositEnabled
      ? depositType === 'percent' ? Number(depositValue) || 0 : Math.round((Number(depositValue) || 0) * 100)
      : undefined;
    const computed = computeQuoteTotals(lineInputs, {
      gstRegistered: !!auth?.user?.gstRegistered,
      gstMode,
      depositEnabled,
      depositType: depositEnabled ? depositType : undefined,
      depositValue: depositInput,
    });
    return { total: computed.totalCents, gst: computed.gstCents, net: computed.subtotalCents, deposit: computed.depositCents ?? 0 };
  }, [lines, auth?.user?.gstRegistered, gstMode, depositEnabled, depositType, depositValue]);

  const createQuote = useMutation({
    mutationFn: async () => {
      setError('');
      const lineItems = lines.map(line => {
        const qty = Number(line.qty);
        const unitPriceCents = Math.round(Number(line.unitPrice) * 100);
        return { description: line.description.trim(), qty, unitPriceCents, lineTotalCents: Math.round(qty * unitPriceCents) };
      });
      if (!clientId) throw new Error('Choose a client');
      if (lineItems.some(line => !line.description || !Number.isInteger(line.qty) || line.qty <= 0 || line.unitPriceCents < 0)) throw new Error('Complete every line item');
      const validUntil = new Date(); validUntil.setDate(validUntil.getDate() + 30);
      const selected = clients.find((client: any) => client.id === clientId);
      const body = {
        clientProfileId: clientId,
        lineItems,
        deliveryChannel: selected?.preferredChannel || 'email',
        depositEnabled,
        depositType: depositEnabled ? depositType : undefined,
        depositValue: depositEnabled ? (depositType === 'percent' ? Math.round(Number(depositValue)) : Math.round(Number(depositValue) * 100)) : undefined,
        validUntil: validUntil.toISOString(),
        notes: notes.trim() || undefined,
      };
      const response = await fetch('/api/trades/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json', ...tradesHeaders() }, body: JSON.stringify(body) });
      if (!response.ok) {
        notifyIfBillingCardRequired(response);
        throw new Error(await response.json().then((d: any) => d.message).catch(() => 'Could not create quote'));
      }
      return response.json();
    },
    onSuccess: quote => { queryClient.invalidateQueries({ queryKey: ['/api/trades/quotes'] }); setCreated(quote); },
    onError: (err: any) => setError(err?.message || 'Could not create quote'),
  });

  const updateLine = (id: number, field: keyof QuoteDraftLine, value: string) => setLines(cur => cur.map(l => l.id === id ? { ...l, [field]: value } : l));
  const gstReg = !!auth?.user?.gstRegistered;

  const publicUrl = created ? `${window.location.origin}/trades/quote/${created.token}` : '';
  const downloadPdf = async () => {
    if (!created?.id) return;
    const response = await fetch(`/api/trades/quotes/${created.id}/pdf`, { headers: tradesHeaders() });
    if (!response.ok) { setError(await response.json().then((d: any) => d.message).catch(() => 'Could not download PDF')); return; }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `quote-${String(created.token || created.id).slice(0, 8)}.pdf`; link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <QuoteView
      clients={clients}
      clientId={clientId}
      lines={lines}
      depositEnabled={depositEnabled}
      depositType={depositType}
      depositValue={depositValue}
      notes={notes}
      created={created}
      error={error}
      gstRegistered={gstReg}
      gstMode={gstMode}
      totals={totals}
      publicUrl={publicUrl}
      isCreating={createQuote.isPending}
      onClientIdChange={setClientId}
      onLineChange={updateLine}
      onRemoveLine={(id) => setLines(current => current.filter(line => line.id !== id))}
      onAddLine={() => setLines(current => [...current, { id: Date.now(), description: '', qty: '1', unitPrice: '' }])}
      onDepositEnabledChange={setDepositEnabled}
      onDepositTypeChange={setDepositType}
      onDepositValueChange={setDepositValue}
      onNotesChange={setNotes}
      onCreate={() => createQuote.mutate()}
      onCopyLink={() => { void navigator.clipboard?.writeText(publicUrl); }}
      onDownloadPdf={downloadPdf}
      onCancel={onCancel}
      onExit={onExit}
    />
  );
}

/* ═══ MAIN ═══ */
export default function TradesTerminal() {
  const queryClient = useQueryClient();

  /* State */
  const [screen, setScreen]                 = useState<TradesTerminalScreen>('home');
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [amount, setAmount]                 = useState(0);
  const [jobNote, setJobNote]               = useState('');
  const [splitEnabled, setSplitEnabled]     = useState(false);
  const [conveyor, setConveyor]             = useState<{ prevId: TradesTerminalScreen; dir: string } | null>(null);
  const [contentKey, setContentKey]         = useState(0);
  const [toastMsg, setToastMsg]             = useState<string | null>(null);
  const [banner, setBanner]                 = useState<string | null>(null);
  const [successLabel, setSuccessLabel]     = useState('');
  // Quick invoice: no client required — recipient details are typed inline and
  // the server creates a hidden 'prospect' profile behind the scenes.
  const [quickMode, setQuickMode]           = useState(false);
  const [recipient, setRecipient]           = useState({ name: '', email: '', phone: '', channel: 'email' as 'email' | 'sms' });
  const [sentInvoice, setSentInvoice]       = useState<any>(null);
  // When invoice/external is tapped from the subbar without a client, remember where to go after selection.
  const [pendingDest, setPendingDest]       = useState<'invoice' | 'external' | null>(null);
  // Tapped job row → action sheet (mark received / cancel).
  const [rowAction, setRowAction]           = useState<any>(null);
  // Tapped quote row → in-terminal client profile (never leaves the terminal page).
  const [profileClientId, setProfileClientId] = useState<string | null>(null);
  const conveyorTimer = useRef<ReturnType<typeof setTimeout>>();

  // Dashboard "quick invoice" tile deep-links here with ?quick=1 — jump straight
  // into the amount keypad in quick mode (no client picker). Strip the param so
  // refresh/back doesn't re-trigger.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('quick') === '1') {
      setQuickMode(true);
      setScreen('amount');
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  /* Data */
  const { data: clients = [] } = useQuery<any[]>({
    queryKey: ['/api/trades/clients'],
    queryFn: () => tradesFetch('/api/trades/clients').then(r => r.ok ? r.json() : []),
    staleTime: 60000, retry: false,
  });

  const { data: rawInvoices = [] } = useQuery<any[]>({
    queryKey: ['/api/trades/invoices'],
    queryFn: () => tradesFetch('/api/trades/invoices').then(r => r.ok ? r.json() : []),
    staleTime: 30000, retry: false,
  });

  const { data: rawQuotes = [] } = useQuery<any[]>({
    queryKey: ['/api/trades/quotes'],
    queryFn: () => tradesFetch('/api/trades/quotes').then(r => r.ok ? r.json() : []),
    staleTime: 30000, retry: false,
  });

  // The invoices endpoint returns plain rows; decorate each with its client's name
  // (looked up from the clients query) so the stack + action sheet can show it.
  const clientById = (id: string) => (clients as any[]).find((c: any) => c.id === id);
  const invoices = (rawInvoices as any[]).map((i: any) => {
    const c = clientById(i.clientProfileId);
    const balanceSent = i.kind === 'deposit' && (rawInvoices as any[]).some((other: any) => other.quoteId === i.quoteId && other.kind === 'balance' && other.status !== 'voided');
    return { ...i, clientName: c ? clientName(c) : '', balanceSent };
  });
  const quoteRows = (rawQuotes as any[])
    .filter((q: any) => !['accepted', 'expired'].includes(q.status))
    .map((q: any) => {
      const c = clientById(q.clientProfileId);
      return { ...q, id: `quote-${q.id}`, quoteId: q.id, isQuote: true, kind: 'quote', amountCents: q.totalCents, clientName: c ? clientName(c) : '' };
    });
  const stackRows = [...quoteRows, ...invoices].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  /* Mutations */
  const invoiceMutation = useMutation({
    mutationFn: async ({ clientId, recipient, amountCents, channel, jobDetails, splitEnabled }: any) => {
      const due = new Date(); due.setDate(due.getDate() + 7);
      const r = await fetch('/api/trades/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...tradesHeaders() },
        body: JSON.stringify({
          // Quick invoice sends inline recipient details; the server creates a
          // hidden prospect profile. Otherwise a normal client-linked invoice.
          ...(recipient
            ? { recipient: { name: recipient.name, email: recipient.email || undefined, phone: recipient.phone || undefined, channel: recipient.channel } }
            : { clientProfileId: clientId }),
          amountCents, deliveryChannel: channel,
          dueAt: due.toISOString(), kind: 'full',
          jobDetails: jobDetails || undefined,
          splitEnabled: !!splitEnabled,
        }),
      });
      if (!r.ok) {
        notifyIfBillingCardRequired(r);
        const msg = await r.json().then((d: any) => d.message).catch(() => 'Failed to send invoice');
        throw new Error(msg);
      }
      return r.json();
    },
    onSuccess: (data: any, vars: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trades/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trades/clients'] });
      setSplitEnabled(false);
      setSuccessLabel(vars.recipient
        ? (vars.recipient.email || vars.recipient.phone || '')
        : (selectedClient?.email || selectedClient?.phone || ''));
      setSentInvoice(data);
      promoteMutation.reset();
      setContentKey(k => k + 1);
      setScreen('success');
    },
    onError: (err: any) => { toast(err?.message || 'Failed to send invoice'); },
  });

  // "add client" on the quick-invoice success screen — turns the hidden
  // prospect profile into a real directory client.
  const promoteMutation = useMutation({
    mutationFn: async (clientProfileId: string) => {
      const r = await fetch(`/api/trades/clients/${clientProfileId}/promote`, { method: 'POST', headers: tradesHeaders() });
      if (!r.ok) throw new Error(await r.json().then((d: any) => d.message).catch(() => 'Could not save client'));
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/trades/clients'] }); },
    onError: (e: any) => toast(e?.message || 'Could not save client'),
  });

  const markMutation = useMutation({
    mutationFn: async ({ invoiceId, ref }: any) => {
      const r = await fetch(`/api/trades/invoices/${invoiceId}/mark-paid-external`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...tradesHeaders() },
        body: JSON.stringify({ externalPaymentReference: ref || null }),
      });
      if (!r.ok) throw new Error('Failed to mark');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trades/invoices'] });
      setBanner('Marked as received');
      triggerConveyor(screen, 'down');
      setScreen('home');
      setSelectedClient(null);
      setRowAction(null);
    },
  });

  // Cancel (void) a single job invoice — from the row action sheet.
  const voidMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const r = await fetch(`/api/trades/invoices/${invoiceId}/void`, { method: 'POST', headers: tradesHeaders() });
      if (!r.ok) throw new Error('Failed to cancel');
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/trades/invoices'] }); setBanner('Invoice cancelled'); setRowAction(null); },
    onError: (e: any) => { toast(e?.message || 'Could not cancel'); },
  });

  const jobActionMutation = useMutation({
    mutationFn: async ({ invoiceId, action, splitEnabled }: { invoiceId: string; action: 'send-balance' | 'complete'; splitEnabled?: boolean }) => {
      const r = await fetch(`/api/trades/invoices/${invoiceId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...tradesHeaders() },
        body: action === 'send-balance' ? JSON.stringify({ splitEnabled: !!splitEnabled }) : undefined,
      });
      if (!r.ok) throw new Error(await r.json().then((d: any) => d.message).catch(() => 'Action failed'));
      return r.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trades/invoices'] });
      setBanner(vars.action === 'send-balance' ? 'Balance invoice created' : 'Job completed');
      setRowAction(null);
    },
    onError: (e: any) => toast(e?.message || 'Action failed'),
  });

  /* Helpers */
  const toast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 1600); };
  const outstanding = (invoices as any[])
    .filter((i: any) => ['pending_dispatch', 'dispatched', 'viewed', 'deposit_paid', 'balance_due', 'dispatch_failed'].includes(i.status))
    .reduce((s: number, i: any) => s + (i.amountCents ?? 0), 0);

  const triggerConveyor = (prevId: TradesTerminalScreen, dir: string) => {
    setConveyor({ prevId, dir });
    clearTimeout(conveyorTimer.current);
    conveyorTimer.current = setTimeout(() => setConveyor(null), 650);
  };

  const go = (next: TradesTerminalScreen, dir = 'up') => {
    if (next === 'home') {
      triggerConveyor(screen, dir);
      setScreen('home');
      setSelectedClient(null);
      setAmount(0);
      setJobNote('');
      setSplitEnabled(false);
      setPendingDest(null);
      setQuickMode(false);
      setRecipient({ name: '', email: '', phone: '', channel: 'email' });
      setSentInvoice(null);
      return;
    }
    // invoice/external with no client: remember destination, go to client picker
    // (quick mode is the exception — its invoice screen takes inline details)
    if ((next === 'invoice' || next === 'external') && !selectedClient && !(quickMode && next === 'invoice')) {
      setPendingDest(next as 'invoice' | 'external');
      if (screen === 'home') triggerConveyor(screen, 'up');
      setContentKey(k => k + 1);
      setScreen('clients');
      return;
    }
    if (screen === 'home') triggerConveyor(screen, dir);
    setContentKey(k => k + 1);
    setScreen(next);
  };

  const handleClientSelect = (c: any) => {
    setSelectedClient(c);
    setQuickMode(false);
    setContentKey(k => k + 1);
    const dest = pendingDest || 'invoice';
    setPendingDest(null);
    if (dest === 'external') { setScreen('external'); return; }
    setAmount(0);
    setJobNote('');
    setSplitEnabled(false);
    setScreen('amount');
  };

  // "quick invoice · no client" from the client picker — enter quick mode.
  const handleQuickInvoice = () => {
    setQuickMode(true);
    setSelectedClient(null);
    setPendingDest(null);
    setAmount(0);
    setJobNote('');
    setSplitEnabled(false);
    setContentKey(k => k + 1);
    setScreen('amount');
  };

  const handleRowTap = (inv: any) => {
    if (inv.isQuote) { setProfileClientId(inv.clientProfileId); go('profile'); return; }
    setRowAction(inv);
  };

  const handleVoid = () => {
    const inv = rowAction;
    if (!inv) return;
    if (window.confirm('Cancel this invoice? The client will no longer be able to pay it. This cannot be undone.')) {
      voidMutation.mutate(inv.id);
    }
  };

  // Send button / FAB entry into the invoice flow.
  const handleSend = () => {
    if (!selectedClient) { go('clients'); return; }
    go('invoice');
  };

  const handleSendInvoice = () => {
    if (amount <= 0) { toast('set an amount first'); return; }
    if (selectedClient) {
      invoiceMutation.mutate({
        clientId: selectedClient.id,
        amountCents: amount,
        channel: selectedClient.preferredChannel || 'email',
        jobDetails: jobNote,
        splitEnabled,
      });
      return;
    }
    if (quickMode) {
      const missingRecipient = !recipient.name.trim()
        || (recipient.channel === 'email' ? !recipient.email.trim() : !recipient.phone.trim());
      if (missingRecipient) { toast('enter the customer details first'); return; }
      invoiceMutation.mutate({
        recipient,
        amountCents: amount,
        channel: recipient.channel,
        jobDetails: jobNote,
        splitEnabled,
      });
    }
  };

  const handleMark = (invoiceId: string, ref: string) => {
    markMutation.mutate({ invoiceId, ref });
  };

  /* Subbar → go shortcut */
  const handleSubbarPick = (i: number) => {
    const dest = SUBBAR_ROUTE[i];
    if (!dest || dest === screen) return;
    if ((dest === 'invoice' || dest === 'external') && !selectedClient && !(quickMode && dest === 'invoice')) {
      setPendingDest(dest as 'invoice' | 'external');
      if (screen === 'home') triggerConveyor(screen, 'up');
      setContentKey(k => k + 1);
      setScreen('clients');
      return;
    }
    if (screen === 'home') triggerConveyor(screen, 'up');
    setContentKey(k => k + 1);
    setScreen(dest);
  };

  return (
    <TradesTerminalView
      screen={screen}
      contentKey={contentKey}
      conveyor={conveyor}
      clients={clients}
      invoices={invoices}
      stackRows={stackRows}
      outstanding={outstanding}
      selectedClient={selectedClient}
      amount={amount}
      jobNote={jobNote}
      splitEnabled={splitEnabled}
      quickMode={quickMode}
      recipient={recipient}
      allowQuickInvoice={pendingDest === 'invoice'}
      successLabel={successLabel}
      showAddClient={quickMode && !!sentInvoice?.clientProfileId}
      addClientState={promoteMutation.isSuccess ? 'saved' : promoteMutation.isPending ? 'saving' : 'idle'}
      banner={banner}
      toastMessage={toastMsg}
      rowAction={rowAction}
      quoteView={<QuoteScreen onCancel={() => go('home', 'down')} onExit={() => go('home', 'down')} />}
      profileView={<ClientProfile embedded clientId={profileClientId ?? undefined} onClose={() => go('home')} />}
      busy={{
        invoice: invoiceMutation.isPending,
        mark: markMutation.isPending,
        row: voidMutation.isPending || markMutation.isPending || jobActionMutation.isPending,
      }}
      onNavigate={go}
      onClientSelect={handleClientSelect}
      onQuickInvoice={handleQuickInvoice}
      onAmountCommit={(amountCents) => { setAmount(amountCents); go('invoice'); }}
      onRecipientChange={setRecipient}
      onJobNoteChange={setJobNote}
      onSplitEnabledChange={setSplitEnabled}
      onSendInvoice={handleSendInvoice}
      onEditAmount={() => go('amount')}
      onRowTap={handleRowTap}
      onMarkExternal={handleMark}
      onSubbarPick={handleSubbarPick}
      onSendShortcut={handleSend}
      onAddClient={() => {
        if (sentInvoice?.clientProfileId) promoteMutation.mutate(sentInvoice.clientProfileId);
      }}
      onCloseRow={() => setRowAction(null)}
      onSendBalance={(rowSplitEnabled) => {
        if (rowAction) jobActionMutation.mutate({ invoiceId: rowAction.id, action: 'send-balance', splitEnabled: rowSplitEnabled });
      }}
      onCompleteRow={() => {
        if (rowAction) jobActionMutation.mutate({ invoiceId: rowAction.id, action: 'complete' });
      }}
      onMarkRowReceived={() => {
        if (rowAction) markMutation.mutate({ invoiceId: rowAction.id, ref: '' });
      }}
      onVoidRow={handleVoid}
    />
  );
}

/* ═══ CSS (same shell as SmartTransitions TP_CSS — solid hex interpolated from
   TRADES_THEME so the chrome matches the vertical; rgba tints are deferred to 3c) ═══ */
export const TP_TERM_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap');
.tp-viewport { width: 100%; max-width: 430px; height: 100svh; margin: 0 auto; position: relative; overflow: hidden; font-family: 'Outfit', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.tp-screen { position: absolute; inset: 0; display: flex; flex-direction: column; overflow: hidden; }
.tp-top-banner { position: absolute; top: 0; left: 0; right: 0; z-index: 55; background: linear-gradient(150deg,${NAVY} 0%,#072b20 100%); border-bottom: 2px solid ${GREEN}; box-shadow: 0 8px 40px rgba(27,191,133,0.3); padding: 52px 22px 20px; display: flex; align-items: center; gap: 16px; transform: translateY(-100%); transition: transform 0.6s cubic-bezier(0.34,1.56,0.64,1); pointer-events: none; }
.tp-top-banner.show { transform: translateY(0); pointer-events: auto; }
.tp-banner-icon { width: 44px; height: 44px; border-radius: 50%; background: ${GREEN}; color: ${NAVY}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.tp-banner-body { display: flex; flex-direction: column; }
.tp-banner-title { font-weight: 700; font-size: 16px; color: #fff; }
.tp-subhead { display: flex; justify-content: space-between; align-items: center; padding: 20px 22px 0; }
.tp-subhead-btn { width: 44px; height: 44px; border-radius: 999px; border: 2px solid ${NAVY}; display: flex; align-items: center; justify-content: center; color: ${NAVY}; background: none; cursor: pointer; transition: transform 120ms, background 120ms; }
.tp-subhead-btn:active { transform: scale(0.92); background: rgba(4,13,109,0.06); }
.tp-amount { font-family: 'Outfit', system-ui; font-weight: 800; letter-spacing: -0.04em; line-height: 0.95; }
.tp-subbar-wrap { display: flex; justify-content: center; }
.tp-subbar { position: relative; display: inline-flex; align-items: center; justify-content: center; background: ${BLUE}; border-radius: 26px; padding: 5px 11px; gap: 4px; border: 1px solid rgba(255,255,255,0.3); box-shadow: 0 16px 48px rgba(4,13,109,0.2), 0 4px 12px rgba(4,13,109,0.1), inset 0 1px 0 rgba(255,255,255,0.25); transform: scale(0.85); transform-origin: center; }
.tp-subbar-ind { position: absolute; top: 5px; height: 27px; background: ${NAVY}; border-radius: 16px; box-shadow: 0 4px 16px rgba(4,13,109,0.4); pointer-events: none; z-index: 2; opacity: 0; will-change: left, width, opacity; }
.tp-subbar-ind.on { opacity: 1; }
.tp-subbar-ind.animate { transition: left 0.45s cubic-bezier(0.34,1.56,0.64,1), width 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease; }
.tp-subbar-btn { position: relative; z-index: 1; height: 27px; padding: 0 22px; display: flex; align-items: center; justify-content: center; gap: 6px; border-radius: 16px; border: none; cursor: pointer; background: transparent; color: rgba(244,244,244,0.55); transition: color 0.2s ease, transform 0.18s ease; -webkit-tap-highlight-color: transparent; flex-shrink: 0; }
.tp-subbar-btn:active { transform: scale(0.92); }
.tp-subbar-btn.active { background: transparent !important; box-shadow: none !important; color: ${OFFW}; z-index: 3; }
.tp-subbar.compact .tp-subbar-btn { padding: 0 11px; }
.tp-subbar-label { font-family: 'Outfit', system-ui; font-weight: 600; font-size: 12px; letter-spacing: 0.4px; color: ${OFFW}; white-space: nowrap; animation: tp-labelIn 0.3s ease-out; }
@keyframes tp-labelIn { from { opacity:0; transform:translateX(-4px); } to { opacity:1; transform:translateX(0); } }
.tp-send { display: flex; align-items: center; gap: 6px; padding: 4px 14px 4px 4px; border-radius: 26px; background: ${NAVY}; border: none; cursor: pointer; box-shadow: 0 4px 16px rgba(4,13,109,0.25); transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1); -webkit-tap-highlight-color: transparent; flex-shrink: 0; height: 37px; }
.tp-send:active { transform: scale(0.94); }
.tp-send-circle { width: 20px; height: 20px; border-radius: 50%; background: ${BLUE}; display: flex; align-items: center; justify-content: center; }
.tp-send-label { font-size: 11px; font-weight: 700; color: ${OFFW}; letter-spacing: 0.3px; }
.tp-fab { width: 70px; height: 70px; border-radius: 999px; background: ${BLUE}; color: ${OFFW}; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 18px rgba(4,13,109,0.25); border: none; cursor: pointer; transition: transform 140ms; -webkit-tap-highlight-color: transparent; }
.tp-fab:active { transform: scale(0.92); }
.tp-stack-hdr { display: flex; justify-content: space-between; align-items: center; padding: 0 4px; margin-bottom: 12px; }
.tp-stack-title { font-weight: 700; font-size: 14px; color: ${NAVY}; letter-spacing: -0.2px; }
.tp-stack-card { border-radius: 14px; background: #fff; overflow: hidden; box-shadow: 0 2px 12px rgba(4,13,109,0.06); border: 1px solid rgba(4,13,109,0.04); }
.tp-stack-row { display: flex; align-items: center; padding: 14px 16px; animation: tp-stackIn 0.38s cubic-bezier(0.34,1.56,0.64,1) both; }
.tp-stack-row + .tp-stack-row { border-top: 1px solid rgba(4,13,109,0.05); }
@keyframes tp-stackIn { from { opacity:0; transform:translateY(-12px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
.tp-stack-name { font-weight: 600; font-size: 14px; color: ${NAVY}; margin-bottom: 1px; }
.tp-stack-meta { display: flex; align-items: center; gap: 5px; }
.tp-stack-status { font-weight: 500; font-size: 11px; color: rgba(4,13,109,0.35); }
.tp-stack-price { font-weight: 700; font-size: 15px; color: ${NAVY}; letter-spacing: -0.3px; }
.tp-stack-empty { padding: 14px 16px; font-size: 13px; color: rgba(4,13,109,0.4); text-align: center; }
.tp-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; animation: tp-pulse 2s ease-in-out infinite; }
.tp-dot.awaiting { background: ${BLUE}; }
.tp-dot.payment-sent { background: ${BLUE}; }
.tp-dot.paid { background: ${GREEN}; animation: none; opacity: 1; }
.tp-dot.declined { background: ${RED}; animation: none; opacity: 1; }
@keyframes tp-pulse { 0%,100% { opacity:0.4; } 50% { opacity:1; } }
.tp-field { width: 100%; padding: 18px 24px; border-radius: 999px; background: ${OFFW}; border: none; color: ${NAVY}; font-family: 'Outfit', system-ui; font-weight: 500; font-size: 17px; letter-spacing: -0.01em; outline: none; box-sizing: border-box; }
.tp-field::placeholder { color: rgba(4,13,109,0.35); }
.tp-cta { display: inline-flex; align-items: center; justify-content: center; padding: 14px 36px; border-radius: 999px; background: ${BLUE}; color: ${OFFW}; font-family: 'Outfit', system-ui; font-weight: 600; font-size: 15px; transition: transform 120ms, opacity 120ms; white-space: nowrap; border: none; cursor: pointer; box-sizing: border-box; }
.tp-cta:active { transform: scale(0.96); opacity: 0.92; }
.tp-cta-wire { display: inline-flex; align-items: center; justify-content: center; padding: 14px 36px; border-radius: 999px; background: transparent; color: ${BLUE}; font-family: 'Outfit', system-ui; font-weight: 600; font-size: 15px; border: 1.5px solid ${BLUE}; transition: background 160ms ease, color 160ms ease, transform 120ms; white-space: nowrap; cursor: pointer; box-sizing: border-box; }
.tp-cta-wire:active { background: ${BLUE}; color: ${NAVY}; transform: scale(0.96); }
.tp-kp { width: 76px; height: 76px; border-radius: 999px; display: flex; align-items: center; justify-content: center; font-family: 'Outfit', system-ui; font-weight: 700; font-size: 30px; transition: transform 100ms, background 100ms; background: ${BLUE}; color: #fff; border: none; cursor: pointer; }
.tp-kp:active { transform: scale(0.92); }
.tp-kp.outline { background: transparent; color: ${OFFW}; box-shadow: inset 0 0 0 2px ${OFFW}; }
.tp-kp.outline:active { background: rgba(88,171,255,0.12); }
.tp-success-check { width: 92px; height: 92px; border-radius: 999px; background: ${BLUE}; display: flex; align-items: center; justify-content: center; color: ${OFFW}; }
.tp-pulse { animation: tp-pulseDot 1800ms ease-in-out infinite; }
@keyframes tp-pulseDot { 0%,100% { transform:scale(1); opacity:1; } 50% { transform:scale(1.08); opacity:0.85; } }
.tp-thin-scroll { scrollbar-width: thin; scrollbar-color: rgba(88,171,255,0) transparent; transition: scrollbar-color 350ms; }
.tp-thin-scroll::-webkit-scrollbar { width: 3px; }
.tp-thin-scroll::-webkit-scrollbar-thumb { background-color: rgba(88,171,255,0); border-radius: 999px; }
.tp-stack-scroll { scrollbar-width: thin; scrollbar-color: ${NAVY} transparent; }
.tp-stack-scroll::-webkit-scrollbar { width: 4px; background: transparent; }
.tp-stack-scroll::-webkit-scrollbar-track { background: transparent; }
.tp-stack-scroll::-webkit-scrollbar-thumb { background: ${NAVY}; border-radius: 999px; }
.tp-toast { position: absolute; left: 50%; transform: translateX(-50%); bottom: 110px; background: ${NAVY}; color: ${OFFW}; padding: 12px 22px; border-radius: 999px; font-size: 14px; font-weight: 500; opacity: 0; pointer-events: none; transition: opacity 200ms, transform 200ms; z-index: 60; }
.tp-toast.show { opacity: 1; transform: translateX(-50%) translateY(-4px); }
.tp-layer { position: absolute; inset: 0; display: flex; flex-direction: column; overflow: hidden; will-change: transform; z-index: 0; }
.tp-layer.leaving.up   { animation: tp-outUp   0.48s cubic-bezier(0.4,0,0.2,1) both; z-index: 1; }
.tp-layer.leaving.down { animation: tp-outDown 0.48s cubic-bezier(0.4,0,0.2,1) both; z-index: 1; }
.tp-layer.entering.up   { animation: tp-inUp   0.48s cubic-bezier(0.16,1,0.3,1) both; }
.tp-layer.entering.down { animation: tp-inDown 0.48s cubic-bezier(0.16,1,0.3,1) both; }
@keyframes tp-inUp    { from { transform: translateY(100%); }  to { transform: translateY(0); } }
@keyframes tp-outUp   { from { transform: translateY(0); }     to { transform: translateY(-100%); } }
@keyframes tp-inDown  { from { transform: translateY(-100%); } to { transform: translateY(0); } }
@keyframes tp-outDown { from { transform: translateY(0); }     to { transform: translateY(100%); } }
@keyframes tp-popIn { from { opacity:0; transform:translateY(16px) scale(0.96); } to { opacity:1; transform:translateY(0) scale(1); } }
.stagger { transition: height 0.55s cubic-bezier(0.34,1.56,0.64,1); }
.stagger > * { animation: tp-popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both; }
.stagger > *:nth-child(1) { animation-delay: 0s; }
.stagger > *:nth-child(2) { animation-delay: 0.06s; }
.stagger > *:nth-child(3) { animation-delay: 0.12s; }
.stagger > *:nth-child(4) { animation-delay: 0.18s; }
.tp-overlay { position: absolute; inset: 0; pointer-events: none; z-index: 30; }
.tp-overlay > * { pointer-events: auto; }
.tp-pfab { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); transition: opacity 240ms cubic-bezier(0,0,0.2,1), transform 360ms cubic-bezier(0.34,1.56,0.64,1); will-change: opacity, transform; }
.tp-pfab.hide { opacity: 0; transform: translate(-50%, -50%) translateY(8px) scale(0.7); pointer-events: none; }
.tp-pfab.show { opacity: 1; }
.tp-psubbar { position: absolute; top: 50%; left: 0; right: 0; padding: 0 22px; box-sizing: border-box; transform: translateY(67px); display: flex; align-items: center; gap: 8px; transition: opacity 220ms cubic-bezier(0,0,0.2,1), transform 300ms cubic-bezier(0.4,0,0.2,1); will-change: opacity, transform; height: 37px; pointer-events: none; }
.tp-psubbar.show .tp-subbar, .tp-psubbar.show .tp-send-slot { pointer-events: auto; }
.tp-psubbar.hide { opacity: 0; transform: translateY(67px) scale(0.92); pointer-events: none; }
.tp-psubbar.show { opacity: 1; }
.tp-psubbar.feature { transform: translateY(calc(-100% - 20px)); }
.tp-subbar-center { flex: 1 1 auto; min-width: 0; display: flex; justify-content: center; }
.tp-send-slot { flex-shrink: 0; display: flex; align-items: center; overflow: hidden; max-width: 0; opacity: 0; transition: max-width 420ms cubic-bezier(0.34,1.56,0.64,1), opacity 280ms ease 80ms; height: 37px; }
.tp-send-slot.show { max-width: 143px; opacity: 1; }
`;
