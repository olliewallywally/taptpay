import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentMerchantId } from "@/lib/auth";
import { tradesFetch } from "@/lib/trades-api";
import { useToast } from "@/hooks/use-toast";
import {
  formatNzd,
  tradesInvoiceRemainingCents,
  tradesOutstandingCents,
} from "@/lib/trades-money";
import { computeQuoteTotals } from "@shared/trades-gst";
import {
  TRADES_CLIENTS_QUERY_KEY,
  TRADES_INVOICES_QUERY_KEY,
  TRADES_QUOTES_QUERY_KEY,
  buildTradesClientRows,
  isTradesInvoiceOverdue,
  isTradesQuoteAwaitingReply,
  scopeTradesData,
  tradesPaidRevenueCents,
  tradesPeriodWindow,
  tradesSiteOptions,
  useTradesClientsQuery,
  useTradesInvoicesQuery,
  useTradesQuotesQuery,
  type TradesClient,
  type TradesClientRow,
  type TradesClientRowStatus,
  type TradesInvoice,
  type TradesQuote,
} from "../data/trades-data";
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
const PALE = "#C6CFE2";
const GREEN = "#35D07F";
const RED = "#F0656C";
const AMBER = "#F0A34E";

type Mode = "client" | "quote" | "keypad" | "invoice" | "paid" | "recurring";
type InvoiceType = "full" | "deposit" | "balance";

const STACK_FILTERS = ["all", "overdue", "sent", "awaiting deposit", "paid"] as const;
type StackFilter = (typeof STACK_FILTERS)[number];

const INVOICE_TYPES: InvoiceType[] = ["full", "deposit", "balance"];
const DEPOSIT_CHIPS = ["none", "25%", "50%"] as const;
type DepositChip = (typeof DEPOSIT_CHIPS)[number];

const STATUS_DOT: Record<TradesClientRowStatus, string> = {
  overdue: RED,
  "delivery failed": RED,
  "awaiting deposit": AMBER,
  sent: ACCENT,
  paid: GREEN,
  "no invoice": AMBER,
};

const wholeNzd = (cents: number) =>
  "$" + Math.round(cents / 100).toLocaleString("en-NZ");

const clientName = (client: TradesClient | null | undefined) =>
  client ? [client.firstName, client.lastName].filter(Boolean).join(" ").trim() || "Client" : "";

const clientInitials = (client: TradesClient) =>
  `${client.firstName[0] ?? ""}${client.lastName[0] ?? ""}`.toUpperCase() || "?";

const contactFor = (client: TradesClient | null) => {
  if (!client) return "";
  return client.preferredChannel === "email"
    ? client.email || client.phone || ""
    : client.phone || client.email || "";
};

interface QuoteLineDraft {
  description: string;
  qty: string;
  unitPrice: string;
}

const EMPTY_LINE: QuoteLineDraft = { description: "", qty: "1", unitPrice: "" };

export default function DesktopTradesTerminal(props: DesktopRoutePageProps) {
  const merchantId = getCurrentMerchantId();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const quickEntry = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("quick") === "1";
  const quoteEntry = typeof window !== "undefined" && window.location.pathname === "/trades/quote";
  const recurringEntry = typeof window !== "undefined" && window.location.pathname === "/trades/recurring";

  const [mode, setMode] = useState<Mode>(recurringEntry ? "recurring" : quoteEntry ? "quote" : quickEntry ? "invoice" : "keypad");
  const [railMoving, setRailMoving] = useState(false);
  const [siteFilter, setSiteFilter] = useState<string | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [jobsOpen, setJobsOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [stackFilter, setStackFilter] = useState<StackFilter>("all");

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [amountCents, setAmountCents] = useState(0);
  const [kpVal, setKpVal] = useState("");
  const [note, setNote] = useState("");
  const [invType, setInvType] = useState<InvoiceType>("full");
  const [sentFlash, setSentFlash] = useState(false);
  const [quickMode, setQuickMode] = useState(quickEntry);
  const [recipient, setRecipient] = useState({ name: "", email: "", phone: "", channel: "email" as "email" | "sms" });
  const [sentInvoice, setSentInvoice] = useState<any>(null);

  const [lines, setLines] = useState<QuoteLineDraft[]>([{ ...EMPTY_LINE }]);
  const [depositChip, setDepositChip] = useState<DepositChip>("none");
  const [quoteFlash, setQuoteFlash] = useState(false);
  const [recurring, setRecurring] = useState({ clientProfileId: "", amount: "", frequency: "monthly", deliveryChannel: "email", startDate: new Date().toISOString().slice(0, 10) });
  const [recurringError, setRecurringError] = useState("");

  useEffect(() => {
    if (!quickEntry) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("quick");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const clientsQuery = useTradesClientsQuery();
  const invoicesQuery = useTradesInvoicesQuery();
  const quotesQuery = useTradesQuotesQuery();
  const schedulesQuery = useQuery<any[]>({ queryKey: ["/api/trades/schedules"], queryFn: () => tradesFetch("/api/trades/schedules").then((r) => r.ok ? r.json() : []) });

  const merchantQuery = useQuery<any>({
    queryKey: ["/api/merchants", merchantId, "profile"],
    queryFn: () =>
      tradesFetch(`/api/merchants/${merchantId}/profile`).then((r) => (r.ok ? r.json() : null)),
    enabled: !!merchantId,
  });

  const clients = useMemo(() => clientsQuery.data ?? [], [clientsQuery.data]);
  const invoices = useMemo(() => invoicesQuery.data ?? [], [invoicesQuery.data]);
  const quotes = useMemo(() => quotesQuery.data ?? [], [quotesQuery.data]);

  const sites = useMemo(() => tradesSiteOptions(clients), [clients]);
  const scoped = useMemo(
    () => scopeTradesData(clients, invoices, quotes, siteFilter),
    [clients, invoices, quotes, siteFilter],
  );

  /* Prospect profiles are hidden from pickers but must stay resolvable, so the
     name lookup uses every client rather than the scoped list. */
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const selectedClient = selectedClientId ? clientById.get(selectedClientId) ?? null : null;

  /* ── left column figures ── */
  const week = useMemo(() => tradesPeriodWindow("week"), []);
  const revenueCents = tradesPaidRevenueCents(scoped.invoices, week.start, week.end);
  const previousCents = tradesPaidRevenueCents(
    scoped.invoices,
    week.previousStart,
    week.previousEnd,
  );
  const growthPct =
    previousCents > 0
      ? Math.round(((revenueCents - previousCents) / previousCents) * 100)
      : null;
  const outstandingCents = tradesOutstandingCents(scoped.invoices);

  const jobRows = useMemo(
    () => buildTradesClientRows(scoped.clients, scoped.invoices),
    [scoped.clients, scoped.invoices],
  );

  const term = search.trim().toLowerCase();
  const visibleJobs = jobRows
    .filter((row) => row.status !== "no invoice")
    .filter((row) => stackFilter === "all" || row.status === stackFilter)
    .filter(
      (row) =>
        !term ||
        row.name.toLowerCase().includes(term) ||
        row.siteAddress.toLowerCase().includes(term),
    );

  /* ── client picker cards ── */
  const clientCards = useMemo(() => {
    const cardTerm = clientSearch.trim().toLowerCase();
    return buildTradesClientRows(scoped.clients, scoped.invoices)
      .filter(
        (row) =>
          !cardTerm ||
          row.name.toLowerCase().includes(cardTerm) ||
          row.siteAddress.toLowerCase().includes(cardTerm),
      )
      .map((row) => {
        const clientInvoices = scoped.invoices.filter(
          (invoice) => invoice.clientProfileId === row.id,
        );
        const owedCents = tradesOutstandingCents(clientInvoices);
        const overdue = clientInvoices.some(
          (invoice) =>
            tradesInvoiceRemainingCents(invoice) > 0 && isTradesInvoiceOverdue(invoice),
        );
        const quoted = scoped.quotes.some(
          (quote) => quote.clientProfileId === row.id && isTradesQuoteAwaitingReply(quote),
        );
        const sub = overdue
          ? "overdue"
          : owedCents > 0
            ? "outstanding"
            : quoted
              ? "quoted"
              : "paid up";
        return { row, owedCents, sub };
      });
  }, [scoped.clients, scoped.invoices, scoped.quotes, clientSearch]);

  /* ── invoice-type availability ──
     A deposit's balance is derived from its quote total, so the server rejects a
     deposit that is not quote-linked; a balance is issued by the server from an
     already-paid deposit rather than composed here. Both chips therefore depend
     on what the selected client actually has. */
  const clientQuotes = selectedClientId
    ? quotes.filter(
        (quote) =>
          quote.clientProfileId === selectedClientId &&
          !["declined", "expired", "invoiced"].includes(quote.status),
      )
    : [];
  const depositQuote: TradesQuote | null =
    [...clientQuotes].sort(
      (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
    )[0] ?? null;

  const balanceDeposit: TradesInvoice | null = selectedClientId
    ? invoices.find(
        (invoice) =>
          invoice.clientProfileId === selectedClientId &&
          invoice.kind === "deposit" &&
          !!invoice.quoteId &&
          ["paid", "paid_external", "deposit_paid"].includes(invoice.status) &&
          !invoices.some(
            (other) =>
              other.quoteId === invoice.quoteId &&
              other.kind === "balance" &&
              other.status !== "voided",
          ),
      ) ?? null
    : null;

  const typeAvailable: Record<InvoiceType, boolean> = {
    full: true,
    deposit: !!depositQuote,
    balance: !!balanceDeposit,
  };
  const typeHint: Record<InvoiceType, string> = {
    full: "",
    deposit: "a deposit must be linked to a quote — create one first",
    balance: "a balance needs a paid, quote-linked deposit",
  };

  /* The balance amount is computed by the server from the quote total, so the
     panel previews that figure rather than the keypad's. */
  const balanceCents = useMemo(() => {
    if (!balanceDeposit?.quoteId) return 0;
    const quote = quotes.find((q) => q.id === balanceDeposit.quoteId);
    if (!quote) return 0;
    const billed = invoices
      .filter((i) => i.quoteId === quote.id && i.status !== "voided")
      .reduce((sum, i) => sum + i.amountCents, 0);
    return Math.max(quote.totalCents - billed, 0);
  }, [balanceDeposit, quotes, invoices]);

  const sendCents = invType === "balance" ? balanceCents : amountCents;

  /* ── quote totals ── */
  const gstRegistered = !!merchantQuery.data?.gstRegistered;
  const gstMode = merchantQuery.data?.tradeGstMode === "exclusive" ? "exclusive" : "inclusive";
  const depositPercent = depositChip === "none" ? 0 : Number(depositChip.replace("%", ""));
  const quoteTotals = useMemo(
    () =>
      computeQuoteTotals(
        lines.map((line) => ({
          qty: Math.max(0, Number(line.qty) || 0),
          unitPriceCents: Math.max(0, Math.round((Number(line.unitPrice) || 0) * 100)),
        })),
        {
          gstRegistered,
          gstMode,
          depositEnabled: depositPercent > 0,
          depositType: depositPercent > 0 ? "percent" : undefined,
          depositValue: depositPercent > 0 ? depositPercent : undefined,
        },
      ),
    [lines, gstRegistered, gstMode, depositPercent],
  );

  /* ── mark-received rows ── */
  const openInvoices = useMemo(
    () =>
      scoped.invoices
        .filter((invoice) => tradesInvoiceRemainingCents(invoice) > 0)
        .sort((a, b) => new Date(a.dueAt ?? 0).getTime() - new Date(b.dueAt ?? 0).getTime()),
    [scoped.invoices],
  );

  /* ── mutations ── */
  const invalidateTrades = () => {
    queryClient.invalidateQueries({ queryKey: TRADES_INVOICES_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: TRADES_QUOTES_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: TRADES_CLIENTS_QUERY_KEY });
  };

  const failure = async (res: Response, fallback: string) => {
    const message = await res
      .json()
      .then((body: { message?: string }) => body.message)
      .catch(() => null);
    return new Error(message || fallback);
  };

  const sendInvoice = useMutation({
    mutationFn: async () => {
      if (!selectedClient && !quickMode) throw new Error("Choose a client first");

      /* A balance is issued by the server from the paid deposit; everything else
         is a new invoice for the typed amount. */
      if (quickMode && invType !== "full") throw new Error("Quick invoices must be full invoices");
      if (invType === "balance") {
        if (!balanceDeposit) throw new Error("No paid deposit to bill the balance for");
        const res = await tradesFetch(
          `/api/trades/invoices/${balanceDeposit.id}/send-balance`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ splitEnabled: false }),
          },
        );
        if (!res.ok) throw await failure(res, "Could not send the balance invoice");
        return res.json();
      }

      if (amountCents <= 0) throw new Error("Enter an amount first");
      const due = new Date();
      due.setDate(due.getDate() + 7);
      const res = await tradesFetch("/api/trades/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(quickMode
            ? { recipient: {
                name: recipient.name.trim(),
                email: recipient.email.trim() || undefined,
                phone: recipient.phone.trim() || undefined,
                channel: recipient.channel,
              } }
            : { clientProfileId: selectedClient!.id }),
          amountCents,
          deliveryChannel: quickMode ? recipient.channel : selectedClient!.preferredChannel || "email",
          dueAt: due.toISOString(),
          kind: invType,
          quoteId: invType === "deposit" ? depositQuote?.id : undefined,
          jobDetails: note.trim() || undefined,
        }),
      });
      if (!res.ok) throw await failure(res, "Could not send the invoice");
      return res.json();
    },
    onSuccess: (data: any) => {
      invalidateTrades();
      setSentInvoice(data);
      setSentFlash(true);
      setTimeout(() => setSentFlash(false), 1800);
      if (!quickMode) {
        setAmountCents(0);
        setNote("");
        setInvType("full");
      }
    },
    onError: (error: unknown) =>
      toast({
        title: "Invoice not sent",
        description: error instanceof Error ? error.message : "Could not send the invoice",
        variant: "destructive",
      }),
  });

  const promoteClient = useMutation({
    mutationFn: async () => {
      if (!sentInvoice?.clientProfileId) throw new Error("No client to save");
      const res = await tradesFetch(`/api/trades/clients//promote`, { method: "POST" });
      if (!res.ok) throw await failure(res, "Could not save the client");
      return res.json();
    },
    onSuccess: () => {
      invalidateTrades();
      toast({ title: "Client saved" });
    },
    onError: (error: unknown) => toast({
      title: "Client not saved",
      description: error instanceof Error ? error.message : "Could not save the client",
      variant: "destructive",
    }),
  });

  const createQuote = useMutation({
    mutationFn: async () => {
      if (!selectedClient) throw new Error("Choose a client first");
      const lineItems = lines.map((line) => {
        const qty = Number(line.qty);
        const unitPriceCents = Math.round((Number(line.unitPrice) || 0) * 100);
        return {
          description: line.description.trim(),
          qty,
          unitPriceCents,
          lineTotalCents: Math.round(qty * unitPriceCents),
        };
      });
      if (
        lineItems.some(
          (line) =>
            !line.description ||
            !Number.isInteger(line.qty) ||
            line.qty <= 0 ||
            line.unitPriceCents < 0,
        )
      ) {
        throw new Error("Complete every line item");
      }
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 30);
      const res = await tradesFetch("/api/trades/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientProfileId: selectedClient.id,
          lineItems,
          deliveryChannel: selectedClient.preferredChannel || "email",
          depositEnabled: depositPercent > 0,
          depositType: depositPercent > 0 ? "percent" : undefined,
          depositValue: depositPercent > 0 ? depositPercent : undefined,
          validUntil: validUntil.toISOString(),
        }),
      });
      if (!res.ok) throw await failure(res, "Could not create the quote");
      return res.json();
    },
    onSuccess: () => {
      invalidateTrades();
      setQuoteFlash(true);
      setTimeout(() => setQuoteFlash(false), 1800);
      setLines([{ ...EMPTY_LINE }]);
      setDepositChip("none");
    },
    onError: (error: unknown) =>
      toast({
        title: "Quote not created",
        description: error instanceof Error ? error.message : "Could not create the quote",
        variant: "destructive",
      }),
  });

  const createRecurring = useMutation({
    mutationFn: async () => {
      const amountCents = Math.round(Number(recurring.amount) * 100);
      if (!recurring.clientProfileId || amountCents <= 0) throw new Error("Choose a client and enter an amount");
      const response = await tradesFetch("/api/trades/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...recurring, amountCents, startDate: new Date(`${recurring.startDate}T09:00:00Z`).toISOString(), amount: undefined }),
      });
      if (!response.ok) throw new Error(await response.json().then((d) => d.message).catch(() => "Could not create recurring invoice"));
      return response.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/trades/schedules"] }); setRecurringError(""); },
    onError: (error) => setRecurringError(error instanceof Error ? error.message : "Could not create recurring invoice"),
  });

  const markReceived = useMutation({
    mutationFn: async (invoiceId: string) => {
      const res = await tradesFetch(`/api/trades/invoices/${invoiceId}/mark-paid-external`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalPaymentReference: null }),
      });
      if (!res.ok) throw await failure(res, "Could not mark the invoice received");
      return res.json();
    },
    onSuccess: () => {
      invalidateTrades();
      toast({ title: "Marked as received" });
    },
    onError: (error: unknown) =>
      toast({
        title: "Not marked",
        description:
          error instanceof Error ? error.message : "Could not mark the invoice received",
        variant: "destructive",
      }),
  });

  /* ── keypad ── */
  const pressKey = (key: DesktopKeypadKey) =>
    setKpVal((value) => desktopKeypadReducer(value, key));
  const openKeypad = () => {
    setKpVal("");
    setMode("keypad");
  };
  const commitKeypad = () => {
    setAmountCents(desktopKeypadCents(kpVal));
    setKpVal("");
    setMode("invoice");
  };
  const cancelKeypad = () => {
    setKpVal("");
    setMode("invoice");
  };

  const pickClient = (id: string) => {
    setSelectedClientId(id);
    setInvType("full");
    setMode("invoice");
  };

  useEffect(() => {
    setRailMoving(true);
    const timer = window.setTimeout(() => setRailMoving(false), 240);
    return () => window.clearTimeout(timer);
  }, [mode]);

  const railModes: Mode[] = ["client", "quote", "keypad", "invoice", "paid"];
  const railBtn = (m: Mode, path: JSX.Element, label: string) => {
    const on = mode === m;
    return (
      <button
        type="button"
        className="tt-rail-btn"
        aria-label={label}
        aria-pressed={on}
        onClick={() => (m === "keypad" ? openKeypad() : setMode(m))}
      >
        <svg
          width={19}
          height={19}
          viewBox="0 0 24 24"
          fill="none"
          stroke={on ? NAVY : ACCENT_SOFT}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {path}
        </svg>
      </button>
    );
  };

  const isLoading = clientsQuery.isLoading || invoicesQuery.isLoading || quotesQuery.isLoading;
  const quickRecipientValid = recipient.name.trim().length > 0 &&
    (recipient.channel === "email" ? recipient.email.trim().length > 0 : recipient.phone.trim().length > 0);
  const canSend =
    (!!selectedClient || (quickMode && quickRecipientValid)) &&
    typeAvailable[invType] &&
    (invType === "balance" ? balanceCents > 0 : amountCents > 0) &&
    !sendInvoice.isPending &&
    !(quickMode && !!sentInvoice);

  return (
    <DesktopPageScaffold {...props} vertical="trades" page="terminal" showScope={false}>
      <style>{TT_CSS}</style>
      <div className="tt-body">
        {/* ── LEFT COLUMN ── */}
        {/* Entry cascade: the left column runs steps 0–5, the centre rail lands
            at step 6. The right panel is driven by the rail's mode morph, so it
            keeps its own tileIn rather than joining the page-entry sequence. */}
        <div className="tt-left dt-cascade">
          <div className="tt-scope-wrap">
            <button
              type="button"
              className="tt-scope"
              aria-haspopup="listbox"
              aria-expanded={scopeOpen}
              aria-label={`${siteFilter ?? "all sites"} scope`}
              onClick={() => setScopeOpen((o) => !o)}
            >
              <span>{siteFilter ?? "all sites"}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {scopeOpen && (
              <div className="tt-scope-menu" role="listbox">
                <button
                  type="button"
                  className="tt-scope-opt"
                  role="option"
                  aria-selected={siteFilter === null}
                  onClick={() => {
                    setSiteFilter(null);
                    setScopeOpen(false);
                  }}
                >
                  all sites
                </button>
                {sites.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="tt-scope-opt"
                    role="option"
                    aria-selected={siteFilter === s}
                    onClick={() => {
                      setSiteFilter(s);
                      setScopeOpen(false);
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="tt-hero-row">
            <span className="tt-hero">{isLoading ? "—" : wholeNzd(revenueCents)}</span>
            {growthPct !== null && (
              <span className="tt-growth">
                {growthPct >= 0 ? "+" : ""}
                {growthPct}%
              </span>
            )}
          </div>
          <span className="tt-hero-label">revenue this week</span>
          <span className="tt-hero-2">{isLoading ? "—" : wholeNzd(outstandingCents)}</span>
          <span className="tt-hero-2-label">outstanding invoices</span>

          <div className="tt-jobs">
            <div className="tt-jobs-head">
              <button
                type="button"
                className="tt-jobs-toggle"
                aria-expanded={jobsOpen}
                onClick={() => setJobsOpen((o) => !o)}
              >
                <span>jobs</span>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={ACCENT_SOFT}
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transform: jobsOpen ? "none" : "rotate(180deg)",
                    transition: "transform .2s ease",
                  }}
                >
                  <path d="m6 14 6-6 6 6" />
                </svg>
              </button>
              <div className="tt-jobs-search">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.8-3.8" /></svg>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="search clients or site"
                  aria-label="search jobs"
                />
              </div>
            </div>

            {jobsOpen && (
              <>
                <div className="tt-chips">
                  {STACK_FILTERS.map((f) => {
                    const on = stackFilter === f;
                    return (
                      <button
                        key={f}
                        type="button"
                        className="tt-chip"
                        aria-pressed={on}
                        style={{
                          border: `1px solid ${on ? "transparent" : "rgba(94,158,255,0.5)"}`,
                          background: on ? ACTIVE : "transparent",
                          color: on ? NAVY : ACCENT_SOFT,
                          fontWeight: on ? 700 : 500,
                        }}
                        onClick={() => setStackFilter(f)}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>

                <div className="tt-rows">
                  {isLoading ? (
                    <div className="tt-empty">loading jobs…</div>
                  ) : visibleJobs.length === 0 ? (
                    <div className="tt-empty">no jobs match</div>
                  ) : (
                    visibleJobs.map((row) => <JobRow key={row.id} row={row} onPick={pickClient} />)
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── CENTRE RAIL ── */}
        <div className="tt-rail-slot">
          <div className="tt-rail dt-rise" style={{ "--dt-i": 6 } as React.CSSProperties} data-tutorial-id="trades-terminal-tools">
            <svg className="tt-goo-filter" aria-hidden="true"><defs><filter id="tt-rail-goo"><feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" /><feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" /><feBlend in="SourceGraphic" /></filter></defs></svg>
            <div className={`tt-rail-blob${railMoving ? " tt-rail-blob-moving" : ""}`} style={{ "--tt-rail-index": mode === "recurring" ? 3 : railModes.indexOf(mode) } as React.CSSProperties} />
            {railBtn("client", (<><circle cx="12" cy="8" r="3.4" /><path d="M5.5 19.5c1-3.2 3.4-4.8 6.5-4.8s5.5 1.6 6.5 4.8" /></>), "choose client")}
            {railBtn("quote", (<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>), "quote builder")}
            {railBtn("keypad", (<path d="M12 5v14M5 12h14" />), "keypad")}
            {railBtn("invoice", (<><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></>), "compose invoice")}
            {railBtn("paid", (<><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m9 12 2.2 2.2L15.5 10" /></>), "mark received")}
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="tt-panel">
          {mode === "invoice" && (
            <>
              <div className="tt-inv-top" data-tutorial-id="trades-terminal-invoice">
                <div className="tt-inv-amt-row">
                  <span className="tt-inv-amt">{formatNzd(sendCents)}</span>
                  <button type="button" className="tt-edit" onClick={openKeypad}>
                    edit&gt;
                  </button>
                </div>
                {quickMode ? (
                  <div className="tt-quick-recipient">
                    <input aria-label="customer name" placeholder="customer name" value={recipient.name} onChange={(e) => setRecipient((r) => ({ ...r, name: e.target.value }))} />
                    <div className="tt-quick-channel">
                      <button type="button" aria-pressed={recipient.channel === "email"} onClick={() => setRecipient((r) => ({ ...r, channel: "email" }))}>email</button>
                      <button type="button" aria-pressed={recipient.channel === "sms"} onClick={() => setRecipient((r) => ({ ...r, channel: "sms" }))}>sms</button>
                    </div>
                    <input aria-label={recipient.channel === "email" ? "customer email" : "customer phone"} placeholder={recipient.channel === "email" ? "customer email" : "customer phone"} value={recipient.channel === "email" ? recipient.email : recipient.phone} onChange={(e) => setRecipient((r) => ({ ...r, [r.channel === "email" ? "email" : "phone"]: e.target.value }))} />
                  </div>
                ) : (<>
                  <div className="tt-inv-client">{selectedClient ? clientName(selectedClient) : "no client chosen"}</div>
                  <div className="tt-inv-site">{selectedClient ? selectedClient.siteAddress : "pick one from the client rail"}</div>
                </>)}
              </div>

              <div className="tt-inv-form">
                <div className="tt-field">
                  <span className="tt-field-label">JOB NOTE</span>
                  <input
                    className="tt-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. bathroom rewire — final"
                    aria-label="job note"
                  />
                </div>

                <div className="tt-via">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 4H4v12h4v4l5-4h7z" /></svg>
                  <span className="tt-via-text">
                    <span className="tt-via-label">
                      sending via {quickMode ? recipient.channel : selectedClient?.preferredChannel ?? "email"}
                    </span>
                    <span className="tt-via-value">
                      {quickMode ? (recipient.channel === "email" ? recipient.email : recipient.phone) || "enter customer details" : contactFor(selectedClient) || "no contact on file"}
                    </span>
                  </span>
                </div>

                {!quickMode && <div className="tt-type-chips">
                  {INVOICE_TYPES.map((t) => {
                    const on = invType === t;
                    const enabled = typeAvailable[t];
                    return (
                      <button
                        key={t}
                        type="button"
                        className="tt-type-chip"
                        aria-pressed={on}
                        disabled={!enabled}
                        title={enabled ? undefined : typeHint[t]}
                        style={{
                          border: `1.5px solid ${on ? "transparent" : "rgba(94,158,255,0.5)"}`,
                          background: on ? ACTIVE : "transparent",
                          color: on ? NAVY : ACCENT_SOFT,
                          fontWeight: on ? 700 : 600,
                        }}
                        onClick={() => setInvType(t)}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>}

                {!typeAvailable[invType] ? (
                  <span className="tt-hint">{typeHint[invType]}</span>
                ) : invType === "balance" ? (
                  <span className="tt-hint">
                    the balance is calculated from the quote total — {formatNzd(balanceCents)}
                  </span>
                ) : null}

                <button
                  type="button"
                  className="tt-send"
                  data-tutorial-id="trades-terminal-send"
                  disabled={!canSend}
                  onClick={() => sendInvoice.mutate()}
                >
                  {sendInvoice.isPending ? "sending…" : sentFlash ? "invoice sent ✓" : quickMode ? "send quick invoice" : "send invoice"}
                </button>
                {quickMode && sentInvoice?.clientProfileId && (
                  <div className="tt-quick-success" role="status">
                    <span>invoice sent ✓</span>
                    <button type="button" disabled={promoteClient.isPending || promoteClient.isSuccess} onClick={() => promoteClient.mutate()}>
                      {promoteClient.isPending ? "saving…" : promoteClient.isSuccess ? "client saved ✓" : "add client"}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {mode === "client" && (
            <div className="tt-mode">
              <div className="tt-mode-title tt-client-title">Choose Client</div>
              <div className="tt-client-search">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.8-3.8" /></svg>
                <input
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="search clients or site"
                  aria-label="search clients"
                />
              </div>
              <div className="tt-client-cards">
                {clientCards.length === 0 ? (
                  <div className="tt-empty">no clients match</div>
                ) : (
                  clientCards.map(({ row, owedCents, sub }) => (
                    <button
                      key={row.id}
                      type="button"
                      className="tt-client-card"
                      aria-label={`choose ${row.name}`}
                      onClick={() => pickClient(row.id)}
                    >
                      <span className="tt-card-avatar">{clientInitials(row.client)}</span>
                      <span className="tt-card-mid">
                        <span className="tt-card-name">{row.name}</span>
                        <span className="tt-card-address">{row.siteAddress}</span>
                      </span>
                      <span className="tt-card-right">
                        <span className="tt-card-amt">{wholeNzd(owedCents)}</span>
                        <span className="tt-card-sub">{sub}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {mode === "quote" && (
            <div className="tt-mode tt-quote">
              <div className="tt-mode-title">
                {selectedClient
                  ? `New Quote — ${clientName(selectedClient)}, ${selectedClient.siteAddress}`
                  : "New Quote — choose a client first"}
              </div>

              <div className="tt-field-label tt-q-head">LINE ITEMS</div>
              <div className="tt-q-lines">
                {lines.map((line, index) => (
                  <div key={index} className="tt-q-line">
                    <input
                      className="tt-q-desc"
                      value={line.description}
                      placeholder="description"
                      aria-label={`line ${index + 1} description`}
                      onChange={(e) =>
                        setLines((ls) =>
                          ls.map((l, i) => (i === index ? { ...l, description: e.target.value } : l)),
                        )
                      }
                    />
                    <input
                      className="tt-q-qty"
                      value={line.qty}
                      inputMode="numeric"
                      aria-label={`line ${index + 1} quantity`}
                      onChange={(e) =>
                        setLines((ls) =>
                          ls.map((l, i) => (i === index ? { ...l, qty: e.target.value } : l)),
                        )
                      }
                    />
                    <input
                      className="tt-q-unit"
                      value={line.unitPrice}
                      inputMode="decimal"
                      placeholder="0.00"
                      aria-label={`line ${index + 1} unit price`}
                      onChange={(e) =>
                        setLines((ls) =>
                          ls.map((l, i) => (i === index ? { ...l, unitPrice: e.target.value } : l)),
                        )
                      }
                    />
                    <span className="tt-q-total">
                      {formatNzd(
                        Math.round(
                          (Number(line.qty) || 0) * Math.round((Number(line.unitPrice) || 0) * 100),
                        ),
                      )}
                    </span>
                    <button
                      type="button"
                      className="tt-q-remove"
                      aria-label={`remove line ${index + 1}`}
                      disabled={lines.length === 1}
                      onClick={() => setLines((ls) => ls.filter((_, i) => i !== index))}
                    >
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="tt-q-add"
                  onClick={() => setLines((ls) => [...ls, { ...EMPTY_LINE }])}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  <span>add line item</span>
                </button>
              </div>

              <div className="tt-field-label tt-q-head">REQUIRE DEPOSIT</div>
              <div className="tt-q-dep">
                {DEPOSIT_CHIPS.map((c) => {
                  const on = depositChip === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      className="tt-q-dep-chip"
                      aria-pressed={on}
                      style={{
                        border: `1.5px solid ${on ? "transparent" : "rgba(94,158,255,0.5)"}`,
                        background: on ? ACTIVE : "transparent",
                        color: on ? NAVY : ACCENT_SOFT,
                        fontWeight: on ? 700 : 600,
                      }}
                      onClick={() => setDepositChip(c)}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>

              <div className="tt-q-totals">
                {gstRegistered && (
                  <>
                    <div className="tt-q-tot-row">
                      <span>{gstMode === "exclusive" ? "subtotal" : "subtotal (excl. GST)"}</span>
                      <span className="tt-q-tot-v">{formatNzd(quoteTotals.subtotalCents)}</span>
                    </div>
                    <div className="tt-q-tot-row">
                      <span>{gstMode === "exclusive" ? "GST (15%)" : "GST (15%) incl."}</span>
                      <span className="tt-q-tot-v">{formatNzd(quoteTotals.gstCents)}</span>
                    </div>
                  </>
                )}
                {quoteTotals.depositCents !== null && quoteTotals.depositCents > 0 && (
                  <div className="tt-q-tot-row tt-q-tot-dep">
                    <span>deposit on acceptance</span>
                    <span className="tt-q-tot-v tt-q-tot-dep">
                      {formatNzd(quoteTotals.depositCents)}
                    </span>
                  </div>
                )}
                <div className="tt-q-rule" />
                <div className="tt-q-tot-row tt-q-tot-final">
                  <span>
                    {gstMode === "exclusive" && gstRegistered ? "total (incl GST)" : "total"}
                  </span>
                  <span className="tt-q-grand">{formatNzd(quoteTotals.totalCents)}</span>
                </div>
              </div>

              <button
                type="button"
                className="tt-q-create"
                disabled={!selectedClient || quoteTotals.totalCents <= 0 || createQuote.isPending}
                onClick={() => createQuote.mutate()}
              >
                {createQuote.isPending ? "creating…" : quoteFlash ? "quote created ✓" : "create quote"}
              </button>
            </div>
          )}

          {mode === "keypad" && (
            <div className="tt-mode tt-keypad">
              <div className="tt-kp-head">
                <button type="button" className="tt-kp-circle" aria-label="cancel keypad" onClick={cancelKeypad}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
                <button type="button" className="tt-kp-circle" aria-label="confirm amount" onClick={commitKeypad}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L19 8" /></svg>
                </button>
              </div>
              <div className="tt-kp-amt">{formatDesktopKeypadMoney(kpVal)}</div>
              <div className="tt-kp-client">
                {selectedClient
                  ? `${clientName(selectedClient)} – ${selectedClient.siteAddress}`
                  : "no client chosen yet"}
              </div>
              <div className="tt-kp-grid">
                {DESKTOP_KEYPAD_KEYS.map((k) => {
                  const fill = k !== "." && k !== "<";
                  return (
                    <DesktopKeypadButton
                      key={k}
                      keyValue={k}
                      className="tt-kp-key"
                      style={{
                        background: fill ? ACTIVE : "transparent",
                        border: fill ? "none" : `1.5px solid ${ACCENT}`,
                        color: fill ? "#FFFFFF" : PALE,
                        boxShadow: fill ? "0 14px 22px rgba(0,6,25,0.45)" : "none",
                      }}
                      onPress={pressKey}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {mode === "recurring" && (
            <div className="tt-mode tt-recurring">
              <div className="tt-mode-title">Recurring invoices</div>
              <div className="tt-rec-grid">
                <select aria-label="recurring client" value={recurring.clientProfileId} onChange={(e) => setRecurring({ ...recurring, clientProfileId: e.target.value })}>
                  <option value="">choose client</option>
                  {clients.filter((c) => !["archived", "prospect"].includes(c.status)).map((c) => <option key={c.id} value={c.id}>{clientName(c)} — {c.siteAddress}</option>)}
                </select>
                <input aria-label="recurring amount" inputMode="decimal" placeholder="amount" value={recurring.amount} onChange={(e) => setRecurring({ ...recurring, amount: e.target.value.replace(/[^\d.]/g, "") })} />
                <select aria-label="recurring frequency" value={recurring.frequency} onChange={(e) => setRecurring({ ...recurring, frequency: e.target.value })}><option value="weekly">weekly</option><option value="fortnightly">fortnightly</option><option value="monthly">monthly</option></select>
                <input aria-label="recurring start date" type="date" value={recurring.startDate} onChange={(e) => setRecurring({ ...recurring, startDate: e.target.value })} />
                <select aria-label="recurring delivery channel" value={recurring.deliveryChannel} onChange={(e) => setRecurring({ ...recurring, deliveryChannel: e.target.value })}><option value="email">email</option><option value="sms">sms</option><option value="whatsapp">whatsapp</option></select>
              </div>
              {recurringError && <div className="tt-rec-error">{recurringError}</div>}
              <button type="button" className="tt-rec-create" disabled={createRecurring.isPending} onClick={() => createRecurring.mutate()}>{createRecurring.isPending ? "saving…" : "create recurring invoice"}</button>
              <div className="tt-rec-title">active schedules</div>
              <div className="tt-rec-list">{(schedulesQuery.data ?? []).length === 0 ? <div className="tt-empty">no recurring invoices</div> : (schedulesQuery.data ?? []).map((schedule) => <div className="tt-rec-row" key={schedule.id}><span><strong>{clientName(clientById.get(schedule.clientProfileId)) || "client"}</strong><small>{schedule.frequency} · {schedule.deliveryChannel}</small></span><strong>{formatNzd(schedule.amountCents)}</strong></div>)}</div>
            </div>
          )}

          {mode === "paid" && (
            <div className="tt-mode tt-paid">
              <div className="tt-mode-title tt-paid-title">Mark as received externally</div>
              <div className="tt-paid-sub">
                for invoices paid by cash or direct bank transfer — tap to confirm
              </div>
              <div className="tt-paid-rows">
                {isLoading ? (
                  <div className="tt-empty">loading invoices…</div>
                ) : openInvoices.length === 0 ? (
                  <div className="tt-empty">nothing outstanding</div>
                ) : (
                  openInvoices.map((invoice) => {
                    const client = clientById.get(invoice.clientProfileId);
                    const overdue = isTradesInvoiceOverdue(invoice);
                    return (
                      <div key={invoice.id} className="tt-paid-row">
                        <span className="tt-paid-mid">
                          <span className="tt-paid-name">{clientName(client) || "client"}</span>
                          <span className="tt-paid-status">
                            {overdue ? "overdue" : invoice.kind === "deposit" ? "deposit due" : "sent"}
                            {invoice.dueAt
                              ? ` · due ${new Date(invoice.dueAt).toLocaleDateString("en-NZ", { day: "2-digit", month: "2-digit" })}`
                              : ""}
                          </span>
                        </span>
                        <span className="tt-paid-amt">
                          {formatNzd(tradesInvoiceRemainingCents(invoice))}
                        </span>
                        <button
                          type="button"
                          className="tt-paid-check"
                          aria-label={`mark ${clientName(client) || "invoice"} received`}
                          disabled={markReceived.isPending}
                          onClick={() => markReceived.mutate(invoice.id)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(94,158,255,0.5)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L19 8" /></svg>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </DesktopPageScaffold>
  );
}

function JobRow({ row, onPick }: { row: TradesClientRow; onPick: (id: string) => void }) {
  const label = row.siteAddress ? `${row.name} | ${row.siteAddress}` : row.name;
  return (
    <button
      type="button"
      className="tt-row"
      title={label}
      aria-label={`select ${row.name}`}
      onClick={() => onPick(row.id)}
    >
      <span className="tt-avatar">{row.initials}</span>
      <span className="tt-row-mid">
        <span className="tt-row-name">{label}</span>
        <span className="tt-row-status">
          <span className="tt-dot" style={{ background: STATUS_DOT[row.status] }} />
          <span>{row.status}</span>
        </span>
      </span>
      <span className="tt-row-amt">
        {row.amountCents === null ? "—" : formatNzd(row.amountCents)}
      </span>
    </button>
  );
}

const TT_CSS = `
.tt-body { position:relative; display:flex; height:100%; box-sizing:border-box; padding:26px 46px 0 52px; }

/* ── left column ── */
.tt-left { flex:0 0 420px; display:flex; flex-direction:column; min-height:0; }
.tt-scope-wrap { position:relative; display:inline-block; align-self:flex-start; z-index:6; }
.tt-scope { display:inline-flex; align-items:center; gap:9px; padding:10px 20px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); background:transparent; font-weight:400; font-size:13.5px; color:${ACCENT_SOFT}; cursor:pointer; transition:background .18s ease; text-transform:lowercase; }
.tt-scope:hover { background:rgba(94,158,255,0.08); }
.tt-scope-menu { position:absolute; top:calc(100% + 6px); left:0; min-width:230px; max-height:260px; overflow-y:auto; padding:6px; border-radius:14px; background:#0B1436; border:1px solid rgba(94,158,255,0.3); box-shadow:0 18px 40px rgba(0,4,24,0.5); display:flex; flex-direction:column; gap:2px; }
.tt-scope-opt { padding:9px 12px; border-radius:9px; background:transparent; font-weight:500; font-size:12.5px; color:${TEXT_SOFT}; text-align:left; cursor:pointer; transition:background .15s ease; text-transform:lowercase; }
.tt-scope-opt:hover { background:rgba(94,158,255,0.14); }
.tt-scope-opt[aria-selected="true"] { background:rgba(94,158,255,0.22); }

.tt-hero-row { margin-top:22px; display:flex; align-items:flex-start; gap:14px; }
.tt-hero { font-family:'Outfit',sans-serif; font-weight:700; font-size:84px; line-height:0.92; letter-spacing:-0.015em; color:${ACCENT}; font-variant-numeric:tabular-nums; }
.tt-growth { margin-top:6px; padding:6px 13px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); font-weight:700; font-size:13px; color:${ACCENT_SOFT}; white-space:nowrap; }
.tt-hero-label { margin-top:24px; font-weight:300; font-size:17px; color:${NAV_DIM}; }
.tt-hero-2 { margin-top:36px; font-family:'Outfit',sans-serif; font-weight:700; font-size:56px; line-height:0.92; letter-spacing:-0.015em; color:${ACCENT}; opacity:0.61; font-variant-numeric:tabular-nums; }
.tt-hero-2-label { margin-top:12px; font-weight:300; font-size:17px; color:${NAV_DIM}; opacity:0.61; }

.tt-jobs { margin-top:auto; padding-bottom:24px; min-height:0; display:flex; flex-direction:column; }
.tt-jobs-head { display:flex; align-items:center; justify-content:space-between; }
.tt-jobs-toggle { display:inline-flex; align-items:center; gap:6px; background:transparent; font-weight:300; font-size:12px; color:${ACCENT_SOFT}; cursor:pointer; }
.tt-jobs-search { display:flex; align-items:center; gap:8px; width:180px; height:32px; padding:0 14px; box-sizing:border-box; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); }
.tt-jobs-search input { flex:1; min-width:0; border:none; background:transparent; outline:none; color:#fff; font-family:'Outfit',sans-serif; font-weight:500; font-size:11px; }
.tt-chips { margin-top:12px; display:flex; gap:8px; flex-wrap:wrap; }
.tt-chip { padding:6px 13px; border-radius:9999px; font-size:11px; cursor:pointer; transition:background .15s ease, color .15s ease; text-transform:lowercase; }
.tt-rows { margin-top:8px; display:flex; flex-direction:column; max-height:290px; overflow-y:auto; scrollbar-width:none; }
.tt-rows::-webkit-scrollbar { display:none; }
.tt-row { display:flex; align-items:center; gap:13px; padding:9px 0; background:transparent; cursor:pointer; text-align:left; border-radius:10px; transition:background .15s ease; }
.tt-row:hover { background:rgba(94,158,255,0.06); }
.tt-avatar { width:40px; height:40px; border-radius:50%; border:1.5px solid rgba(94,158,255,0.8); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:11px; color:#fff; flex:0 0 auto; box-sizing:border-box; }
.tt-row-mid { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
.tt-row-name { font-weight:700; font-size:13px; color:${TEXT_SOFT}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tt-row-status { display:flex; align-items:center; gap:5px; font-weight:500; font-size:10.5px; color:rgba(244,246,255,0.5); }
.tt-dot { width:5px; height:5px; border-radius:50%; flex:0 0 auto; }
.tt-row-amt { font-weight:800; font-size:14.5px; color:#fff; flex:0 0 auto; font-variant-numeric:tabular-nums; }
.tt-empty { padding:18px 0; font-weight:300; font-size:12.5px; color:rgba(191,209,255,0.5); }

/* ── centre rail (design pins it at x=539, y=199) ── */
.tt-rail-slot { flex:0 0 76px; margin:175px 40px 0 44px; }
.tt-rail { position:absolute; left:539px; top:199px; width:86px; box-sizing:border-box; border:1.5px solid rgba(94,158,255,0.7); border-radius:32px; padding:30px 0; display:flex; flex-direction:column; align-items:center; gap:40px; }
.tt-goo-filter { position:absolute; width:0; height:0; }
.tt-rail-blob { --tt-rail-index:2; position:absolute; z-index:0; left:15px; top:26px; width:54px; height:54px; border-radius:50%; background:${ACTIVE}; box-shadow:0 8px 20px rgba(102,169,255,0.35); filter:url(#tt-rail-goo); transform:translateY(calc(var(--tt-rail-index) * 86px)) scaleY(1); transform-origin:center; transition:transform 460ms cubic-bezier(.65,.02,.28,1); pointer-events:none; }
.tt-rail-blob-moving { transform:translateY(calc(var(--tt-rail-index) * 86px)) scaleY(1.48); }
.tt-rail-btn { position:relative; z-index:1; width:46px; height:46px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background .18s ease; }
.tt-rail-btn:hover { background:rgba(94,158,255,0.14); }
@media (prefers-reduced-motion: reduce) { .tt-rail-blob { transition:none; } .tt-rail-blob-moving { transform:translateY(calc(var(--tt-rail-index) * 86px)); } }

/* ── right panel ── */
.tt-panel { flex:1; min-width:0; padding-left:36px; box-sizing:border-box; }
.tt-mode { animation:tileIn .35s cubic-bezier(.22,.9,.3,1) both; }
.tt-mode-title { font-weight:300; font-size:15px; color:${PALE}; }
.tt-field-label { font-weight:700; font-size:10px; letter-spacing:0.18em; color:rgba(244,246,255,0.45); }

/* invoice compose — the design pins both blocks to fixed y offsets */
.tt-inv-top { position:absolute; left:668px; top:154px; width:445px; animation:tileIn .35s cubic-bezier(.22,.9,.3,1) both; }
.tt-inv-amt-row { display:flex; align-items:baseline; gap:12px; }
.tt-inv-amt { font-family:'Outfit',sans-serif; font-weight:700; font-size:66px; line-height:0.95; color:${PALE}; font-variant-numeric:tabular-nums; }
.tt-edit { font-weight:300; font-size:12px; color:${ACCENT_SOFT}; background:transparent; cursor:pointer; }
.tt-edit:hover { text-decoration:underline; }
.tt-inv-client { margin-top:16px; font-weight:300; font-size:16px; color:${TEXT_SOFT}; }
.tt-inv-site { margin-top:4px; font-weight:500; font-size:13px; color:rgba(244,246,255,0.5); }

/* The design pins this block at top:512, which pushes its send button 30px past
   the 813px canvas — the design PNG shows the same clipped button. Raised to
   476 so the primary action is reachable; every internal offset is unchanged. */
.tt-inv-form { position:absolute; left:668px; top:436px; width:430px; display:flex; flex-direction:column; gap:14px; animation:tileIn .35s cubic-bezier(.22,.9,.3,1) both; }
.tt-field { display:flex; flex-direction:column; gap:8px; }
.tt-quick-recipient { margin-top:14px; display:grid; grid-template-columns:1fr auto; gap:8px; }
.tt-quick-recipient > input { grid-column:1 / -1; height:34px; padding:0 12px; border-radius:10px; border:1px solid rgba(94,158,255,.42); background:rgba(255,255,255,.05); color:; outline:none; }
.tt-quick-channel { display:flex; gap:6px; grid-column:1 / -1; }
.tt-quick-channel button { border:1px solid rgba(94,158,255,.5); border-radius:999px; background:transparent; color:; padding:5px 13px; }
.tt-quick-channel button[aria-pressed="true"] { background:; color:; }
.tt-quick-success { margin:14px auto 0; display:flex; align-items:center; justify-content:center; gap:14px; color:; font-size:13px; }
.tt-quick-success button { border:1px solid rgba(94,158,255,.6); border-radius:999px; background:transparent; color:; padding:7px 15px; }
.tt-note { height:50px; box-sizing:border-box; border-radius:9999px; border:none; outline:none; background:#fff; padding:0 22px; color:#12162E; font-family:'Outfit',sans-serif; font-weight:600; font-size:13.5px; }
.tt-via { display:flex; align-items:center; gap:14px; height:54px; padding:0 20px; box-sizing:border-box; border-radius:12px; border:1.5px solid rgba(94,158,255,0.55); }
.tt-via-text { display:flex; flex-direction:column; gap:1px; min-width:0; }
.tt-via-label { font-weight:600; font-size:8.5px; letter-spacing:0.08em; color:rgba(244,246,255,0.45); text-transform:lowercase; }
.tt-via-value { font-weight:600; font-size:13px; color:${TEXT_SOFT}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tt-type-chips { display:flex; gap:10px; margin-top:6px; }
.tt-type-chip { flex:1; height:44px; border-radius:9999px; font-size:12.5px; cursor:pointer; transition:background .15s ease, color .15s ease; text-transform:lowercase; }
.tt-type-chip:disabled { opacity:0.4; cursor:not-allowed; }
.tt-fee { font-weight:500; font-size:11px; color:rgba(244,246,255,0.4); }
.tt-hint { font-weight:500; font-size:11px; color:rgba(240,163,78,0.9); }
.tt-send { margin:16px auto 0; width:200px; height:46px; border-radius:9999px; border:1.5px solid rgba(94,158,255,0.7); background:transparent; font-weight:300; font-size:13.5px; color:${TEXT_SOFT}; cursor:pointer; transition:background .15s ease; }
.tt-send:hover:not(:disabled) { background:rgba(94,158,255,0.08); }
.tt-send:disabled { opacity:0.45; cursor:default; }

/* client picker */
.tt-client-title { margin-top:240px; }
.tt-client-search { margin-top:130px; display:flex; align-items:center; gap:10px; width:300px; height:38px; padding:0 16px; box-sizing:border-box; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); }
.tt-client-search input { flex:1; min-width:0; border:none; background:transparent; outline:none; color:#fff; font-family:'Outfit',sans-serif; font-weight:500; font-size:12px; }
.tt-client-cards { margin-top:56px; display:flex; flex-direction:column; gap:14px; width:440px; max-height:210px; overflow-y:auto; scrollbar-width:none; }
.tt-client-cards::-webkit-scrollbar { display:none; }
.tt-client-card { display:flex; align-items:center; gap:12px; height:52px; padding:0 12px; box-sizing:border-box; border-radius:10px; border:1.5px solid rgba(94,158,255,0.55); background:rgba(94,158,255,0.07); cursor:pointer; text-align:left; flex:0 0 auto; transition:background .15s ease; }
.tt-client-card:hover { background:rgba(94,158,255,0.14); }
.tt-card-avatar { width:34px; height:34px; border-radius:50%; background:${ACTIVE}; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:10.5px; color:${NAVY}; flex:0 0 auto; }
.tt-card-mid { display:flex; flex-direction:column; gap:1px; flex:1; min-width:0; }
.tt-card-name { font-weight:700; font-size:12.5px; color:${TEXT_SOFT}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tt-card-address { font-weight:500; font-size:9.5px; color:rgba(244,246,255,0.5); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tt-card-right { display:flex; flex-direction:column; align-items:flex-end; gap:1px; flex:0 0 auto; }
.tt-card-amt { font-weight:700; font-size:13px; color:${TEXT_SOFT}; font-variant-numeric:tabular-nums; }
.tt-card-sub { font-weight:500; font-size:9.5px; color:rgba(244,246,255,0.5); }

/* quote builder */
.tt-quote { margin-top:40px; }
.tt-q-head { display:block; margin-top:22px; }
.tt-q-lines { margin-top:10px; display:flex; flex-direction:column; gap:8px; width:470px; }
.tt-q-line { display:flex; align-items:center; gap:10px; padding:8px 16px; box-sizing:border-box; border-radius:12px; border:1.5px solid rgba(94,158,255,0.4); }
.tt-q-line input { border:none; outline:none; background:transparent; font-family:'Outfit',sans-serif; color:${TEXT_SOFT}; }
.tt-q-desc { flex:1; min-width:0; font-weight:600; font-size:13px; }
.tt-q-qty { width:34px; text-align:center; font-weight:500; font-size:12px; }
.tt-q-unit { width:70px; text-align:right; font-weight:500; font-size:12px; }
.tt-q-total { font-family:'Outfit',sans-serif; font-weight:700; font-size:13.5px; color:${PALE}; min-width:78px; text-align:right; font-variant-numeric:tabular-nums; }
.tt-q-remove { width:22px; height:22px; border-radius:50%; border:1px solid rgba(94,158,255,0.4); display:flex; align-items:center; justify-content:center; background:transparent; cursor:pointer; flex:0 0 auto; transition:background .15s ease; }
.tt-q-remove:hover:not(:disabled) { background:rgba(240,101,108,0.15); }
.tt-q-remove:disabled { opacity:0.35; cursor:default; }
.tt-q-add { display:flex; align-items:center; justify-content:center; gap:8px; height:42px; border-radius:12px; border:1.5px dashed rgba(94,158,255,0.5); background:transparent; cursor:pointer; font-weight:600; font-size:12.5px; color:${ACCENT_SOFT}; transition:background .15s ease; }
.tt-q-add:hover { background:rgba(94,158,255,0.06); }
.tt-q-dep { margin-top:10px; display:flex; gap:8px; }
.tt-q-dep-chip { padding:9px 18px; border-radius:9999px; font-size:12px; cursor:pointer; transition:background .15s ease, color .15s ease; }
.tt-q-totals { margin-top:22px; width:470px; padding:16px 20px; box-sizing:border-box; border-radius:14px; background:rgba(94,158,255,0.08); display:flex; flex-direction:column; gap:8px; }
.tt-q-tot-row { display:flex; justify-content:space-between; font-weight:500; font-size:12.5px; color:rgba(244,246,255,0.6); }
.tt-q-tot-v { font-family:'Outfit',sans-serif; font-weight:600; font-size:13px; color:${TEXT_SOFT}; font-variant-numeric:tabular-nums; }
.tt-q-tot-dep { color:${ACCENT_SOFT}; }
.tt-q-rule { height:1px; background:rgba(94,158,255,0.25); }
.tt-q-tot-final { font-weight:700; font-size:13.5px; color:${TEXT_SOFT}; }
.tt-q-grand { font-family:'Outfit',sans-serif; font-weight:800; font-size:16px; color:${ACCENT}; font-variant-numeric:tabular-nums; }
.tt-q-create { display:block; margin:24px 0 0 135px; width:200px; height:46px; border-radius:9999px; border:1.5px solid rgba(94,158,255,0.7); background:transparent; font-weight:700; font-size:13.5px; color:${TEXT_SOFT}; cursor:pointer; transition:background .15s ease; }
.tt-q-create:hover:not(:disabled) { background:rgba(94,158,255,0.08); }
.tt-q-create:disabled { opacity:0.45; cursor:default; }

/* keypad */
.tt-kp-head { display:flex; align-items:center; justify-content:space-between; }
.tt-kp-circle { width:40px; height:40px; border-radius:50%; border:1.5px solid rgba(94,158,255,0.7); display:flex; align-items:center; justify-content:center; background:transparent; cursor:pointer; transition:background .15s ease; }
.tt-kp-circle:hover { background:rgba(94,158,255,0.08); }
.tt-kp-amt { margin-top:10px; text-align:center; font-family:'Outfit',sans-serif; font-weight:700; font-size:68px; line-height:1; color:${PALE}; font-variant-numeric:tabular-nums; }
.tt-kp-client { margin-top:110px; text-align:center; font-weight:500; font-size:13px; color:rgba(198,207,226,0.75); }
.tt-kp-grid { margin:36px auto 0; display:grid; grid-template-columns:repeat(3,80px); gap:36px 56px; justify-content:center; }
.tt-kp-key { width:80px; height:80px; border-radius:50%; font-family:'Outfit',sans-serif; font-size:34px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; box-sizing:border-box; transition:opacity .15s ease; }
.tt-kp-key:hover { opacity:0.88; }

/* mark received */
.tt-recurring { padding-top:58px; width:445px; }.tt-rec-grid { margin-top:18px; display:grid; grid-template-columns:1fr 1fr; gap:10px; }.tt-rec-grid select,.tt-rec-grid input { min-width:0; height:44px; border-radius:11px; border:1px solid rgba(94,158,255,.35); background:rgba(94,158,255,.08); color:#fff; padding:0 12px; font:inherit; }.tt-rec-grid select:first-child { grid-column:1/-1; }.tt-rec-grid option { color:#000F3F; }.tt-rec-create { margin-top:14px; height:44px; width:100%; border-radius:999px; background:${ACTIVE}; color:${NAVY}; font-weight:800; cursor:pointer; }.tt-rec-create:disabled { opacity:.5; }.tt-rec-error { margin-top:10px; color:#FFB3B8; font-size:12px; }.tt-rec-title { margin-top:28px; color:${ACCENT_SOFT}; font-size:11px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; }.tt-rec-list { margin-top:8px; max-height:230px; overflow:auto; }.tt-rec-row { display:flex; justify-content:space-between; align-items:center; padding:11px 2px; border-bottom:1px solid rgba(94,158,255,.14); }.tt-rec-row span { display:flex; flex-direction:column; gap:2px; }.tt-rec-row strong { font-size:13px; }.tt-rec-row small { color:rgba(244,246,255,.5); font-size:10.5px; }

.tt-paid-title { margin-top:100px; }
.tt-paid-sub { margin-top:4px; font-weight:500; font-size:12px; color:rgba(244,246,255,0.45); }
.tt-paid-rows { margin-top:22px; display:flex; flex-direction:column; width:440px; max-height:420px; overflow-y:auto; scrollbar-width:none; }
.tt-paid-rows::-webkit-scrollbar { display:none; }
.tt-paid-row { display:flex; align-items:center; gap:14px; padding:11px 0; border-bottom:1px solid rgba(94,158,255,0.14); flex:0 0 auto; }
.tt-paid-mid { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
.tt-paid-name { font-weight:700; font-size:13px; color:${TEXT_SOFT}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tt-paid-status { font-weight:500; font-size:10.5px; color:rgba(244,246,255,0.5); }
.tt-paid-amt { font-weight:800; font-size:14px; color:#fff; flex:0 0 auto; font-variant-numeric:tabular-nums; }
.tt-paid-check { width:32px; height:32px; border-radius:50%; border:1.5px solid ${ACTIVE}; background:transparent; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background .15s ease; flex:0 0 auto; }
.tt-paid-check:hover:not(:disabled) { background:rgba(102,169,255,0.18); }
.tt-paid-check:disabled { opacity:0.5; cursor:default; }
`;
