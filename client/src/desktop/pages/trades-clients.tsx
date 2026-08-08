import { useMemo, useState, type CSSProperties } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { tradesFetch } from "@/lib/trades-api";
import { fmtNZD } from "@/lib/report-utils";
import {
  TRADES_CLIENTS_QUERY_KEY,
  buildTradesClientRows,
  tradesSiteOptions,
  useTradesClientsQuery,
  useTradesInvoicesQuery,
  type TradesClientRow,
  type TradesClientRowStatus,
} from "../data/trades-data";
import {
  DesktopPageScaffold,
  type DesktopRoutePageProps,
} from "../DesktopPageScaffold";
import { DesktopDirectoryProfile } from "../DesktopDirectoryProfile";

/* ── palette ── */
const ACCENT = "#5E9EFF";
const ACCENT_SOFT = "#7FB2FF";
const NAV_DIM = "#4A86F0";
const ACTIVE = "#66A9FF";
const TEXT_SOFT = "#F4F6FF";
const NAVY = "#000F3F";
const GREEN = "#35D07F";
const RED = "#F0656C";
const AMBER = "#F0A34E";

type Channel = "email" | "whatsapp" | "sms";

const CHANNELS: { v: Channel; label: string }[] = [
  { v: "email", label: "email" },
  { v: "sms", label: "sms" },
  { v: "whatsapp", label: "whatsapp" },
];

/* The dot is coloured by state, as on 2b. The prototype paints every dot the
   same accent blue, which carries no information once the rows are real. */
const STATUS_DOT: Record<TradesClientRowStatus, string> = {
  overdue: RED,
  "delivery failed": RED,
  "awaiting deposit": AMBER,
  sent: ACCENT,
  paid: GREEN,
  "no invoice": AMBER,
};

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  siteAddress: "",
  preferredChannel: "email" as Channel,
  notes: "",
};

export default function DesktopTradesClients(props: DesktopRoutePageProps) {
  const queryClient = useQueryClient();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("client"));
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState<string | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saveError, setSaveError] = useState<string | null>(null);

  const clientsQuery = useTradesClientsQuery();
  const invoicesQuery = useTradesInvoicesQuery();
  const clients = useMemo(() => clientsQuery.data ?? [], [clientsQuery.data]);
  const invoices = useMemo(() => invoicesQuery.data ?? [], [invoicesQuery.data]);

  const sites = useMemo(() => tradesSiteOptions(clients), [clients]);

  /* One row per visible client carrying its worst-case live invoice — the same
     rule trades home uses, so a client reads identically on both screens. */
  const allRows = useMemo(
    () => buildTradesClientRows(clients, invoices),
    [clients, invoices],
  );

  const scopedRows = useMemo(
    () => (siteFilter ? allRows.filter((r) => r.siteAddress === siteFilter) : allRows),
    [allRows, siteFilter],
  );

  const term = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      scopedRows.filter(
        (r) =>
          !term ||
          r.name.toLowerCase().includes(term) ||
          r.siteAddress.toLowerCase().includes(term),
      ),
    [scopedRows, term],
  );

  /* The count sits under the scope pill, so it answers "how many here": it
     follows the site filter but not the search box. */
  const activeCount = scopedRows.length;

  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_FORM) => {
      const res = await tradesFetch("/api/trades/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const message = await res
          .json()
          .then((d: { message?: string }) => d.message)
          .catch(() => null);
        throw new Error(message || `Error ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRADES_CLIENTS_QUERY_KEY });
      setAddOpen(false);
      setForm(EMPTY_FORM);
      setSaveError(null);
    },
    onError: (err: unknown) =>
      setSaveError(err instanceof Error ? err.message : "Failed to add client."),
  });

  /* The chosen delivery channel must have a contact to send to — the mobile
     directory's rule, kept identical so the same clients are valid on both. */
  const channelContactOk =
    form.preferredChannel === "email" ? !!form.email.trim() : !!form.phone.trim();
  const formValid =
    !!form.firstName.trim() &&
    !!form.lastName.trim() &&
    !!form.siteAddress.trim() &&
    channelContactOk;

  const set = (k: keyof typeof EMPTY_FORM) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }) as typeof EMPTY_FORM);

  const isLoading = clientsQuery.isLoading || invoicesQuery.isLoading;
  const loadError = clientsQuery.error || invoicesQuery.error;
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null;
  const selectClient = (id: string) => {
    setSelectedClientId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("client", id);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  return (
    <DesktopPageScaffold {...props} vertical="trades" page="directory" showScope={false}>
      <style>{TC_CSS}</style>
      <div className="tc-body">
        {/* Entry cascade: scope → hero → search → list. The profile panel is
            opened by selecting a client, so it keeps its own animation. */}
        <div className="tc-scope-wrap dt-rise" style={{ "--dt-i": 0 } as CSSProperties}>
          <button
            type="button"
            className="tc-scope"
            aria-haspopup="listbox"
            aria-expanded={scopeOpen}
            aria-label={`${siteFilter ?? "all sites"} scope`}
            onClick={() => setScopeOpen((o) => !o)}
          >
            <span>{siteFilter ?? "all sites"}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {scopeOpen && (
            <div className="tc-scope-menu" role="listbox">
              <button
                type="button"
                className="tc-scope-opt"
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
                  className="tc-scope-opt"
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

        <div className="tc-hero dt-rise" style={{ "--dt-i": 1 } as CSSProperties}>
          <span className="tc-hero-count">{isLoading ? "—" : activeCount}</span>
          <span className="tc-hero-label">
            active client{activeCount === 1 ? "" : "s"}
          </span>
        </div>

        <div className="tc-search-row dt-rise" style={{ "--dt-i": 2 } as CSSProperties} data-tutorial-id="trades-directory-search">
          <div className="tc-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.8-3.8" /></svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search clients or site"
              aria-label="search clients or site"
            />
          </div>
          <button
            type="button"
            className="tc-add"
            data-tutorial-id="trades-directory-add"
            aria-label="add client"
            onClick={() => setAddOpen(true)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>

        <div className="tc-list dt-rise" style={{ "--dt-i": 3 } as CSSProperties}>
          {loadError ? (
            <div className="tc-empty">couldn’t load clients — try again shortly</div>
          ) : isLoading ? (
            <div className="tc-empty">loading clients…</div>
          ) : rows.length === 0 ? (
            <div className="tc-empty">
              {term || siteFilter
                ? "no matching clients"
                : "no clients yet — add your first with +"}
            </div>
          ) : (
            rows.map((row) => <ClientRow key={row.id} row={row} selected={row.id === selectedClientId} onOpen={selectClient} />)
          )}
        </div>
        {selectedClient && <DesktopDirectoryProfile vertical="trades" profile={selectedClient} />}
      </div>

      {/* ── add client ── */}
      {addOpen && (
        <div className="tc-modal-wrap">
          <div
            className="tc-backdrop"
            role="button"
            tabIndex={-1}
            aria-label="close"
            onClick={() => setAddOpen(false)}
          />
          <div className="tc-modal" role="dialog" aria-modal="true" aria-label="add client">
            <div className="tc-modal-head">
              <span className="tc-modal-title">Add client</span>
              <button type="button" className="tc-modal-x" aria-label="close" onClick={() => setAddOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>

            <div className="tc-grid">
              <label className="tc-field">
                <span>FIRST NAME</span>
                <input value={form.firstName} onChange={(e) => set("firstName")(e.target.value)} aria-label="first name" />
              </label>
              <label className="tc-field">
                <span>LAST NAME</span>
                <input value={form.lastName} onChange={(e) => set("lastName")(e.target.value)} aria-label="last name" />
              </label>
              <label className="tc-field tc-field-wide">
                <span>SITE ADDRESS</span>
                <input value={form.siteAddress} onChange={(e) => set("siteAddress")(e.target.value)} aria-label="site address" />
              </label>
              <label className="tc-field">
                <span>EMAIL</span>
                <input value={form.email} onChange={(e) => set("email")(e.target.value)} type="email" aria-label="email" />
              </label>
              <label className="tc-field">
                <span>PHONE</span>
                <input value={form.phone} onChange={(e) => set("phone")(e.target.value)} type="tel" aria-label="phone" />
              </label>
            </div>

            <div className="tc-channel">
              <span className="tc-field-label">SEND INVOICES BY</span>
              <div className="tc-channel-chips">
                {CHANNELS.map((c) => {
                  const on = form.preferredChannel === c.v;
                  return (
                    <button
                      key={c.v}
                      type="button"
                      className="tc-chip"
                      style={{
                        border: `1.5px solid ${on ? "transparent" : "rgba(94,158,255,0.5)"}`,
                        background: on ? ACTIVE : "transparent",
                        color: on ? NAVY : ACCENT_SOFT,
                        fontWeight: on ? 700 : 600,
                      }}
                      onClick={() => setForm((f) => ({ ...f, preferredChannel: c.v }))}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
              {!channelContactOk && (
                <span className="tc-hint">
                  {form.preferredChannel === "email"
                    ? "an email address is required to send by email"
                    : "a phone number is required to send by sms or whatsapp"}
                </span>
              )}
            </div>

            {saveError && <div className="tc-error">{saveError}</div>}

            <div className="tc-modal-actions">
              <button type="button" className="tc-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
              <button
                type="button"
                className="tc-primary"
                disabled={!formValid || createMutation.isPending}
                onClick={() => createMutation.mutate(form)}
              >
                {createMutation.isPending ? "Adding…" : "Add client"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DesktopPageScaffold>
  );
}

/* The design prints name and site as one line ("mike thompson | 12 harbour view
   rd") inside a 400px column, which ellipsises on real data — and the hover
   title that recovered it does nothing on tablet, where there is no hover. The
   column width is the design's and stays; the label splits onto its own line so
   both read in full. */
export function ClientRow({
  row,
  onOpen,
  selected = false,
}: {
  row: TradesClientRow;
  onOpen: (id: string) => void;
  selected?: boolean;
}) {
  const idPrefix = `tc-client-${row.id}`;
  const nameId = `${idPrefix}-name`;
  const siteId = `${idPrefix}-site`;
  const statusId = `${idPrefix}-status`;
  const amountId = `${idPrefix}-amount`;
  const descriptionIds = [
    row.siteAddress ? siteId : null,
    statusId,
    amountId,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className="tc-row"
      aria-labelledby={nameId}
      aria-describedby={descriptionIds}
      aria-current={selected ? "true" : undefined}
      onClick={() => onOpen(row.id)}
    >
      <span className="tc-avatar" aria-hidden="true">{row.initials}</span>
      <span className="tc-row-mid">
        <span id={nameId} className="tc-row-name">{row.name}</span>
        {row.siteAddress && <span id={siteId} className="tc-row-site">{row.siteAddress}</span>}
        <span id={statusId} className="tc-row-status">
          <span
            className="tc-row-dot"
            style={{ background: STATUS_DOT[row.status] }}
            aria-hidden="true"
          />
          <span>{row.status}</span>
        </span>
      </span>
      <span id={amountId} className="tc-row-amt">
        {row.amountCents === null ? "—" : fmtNZD(row.amountCents)}
      </span>
    </button>
  );
}

const TC_CSS = `
.tc-body { position:relative; height:100%; box-sizing:border-box; padding:26px 52px 0; }

.tc-scope-wrap { position:relative; display:inline-block; z-index:5; }
.tc-scope { display:inline-flex; align-items:center; gap:9px; padding:10px 20px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); background:transparent; font-weight:400; font-size:13.5px; color:${ACCENT_SOFT}; cursor:pointer; transition:background .18s ease; text-transform:lowercase; }
.tc-scope:hover { background:rgba(94,158,255,0.08); }
.tc-scope-menu { position:absolute; top:calc(100% + 6px); left:0; min-width:220px; max-height:260px; overflow-y:auto; padding:6px; border-radius:14px; background:#0B1436; border:1px solid rgba(94,158,255,0.3); box-shadow:0 18px 40px rgba(0,4,24,0.5); display:flex; flex-direction:column; gap:2px; }
.tc-scope-opt { padding:9px 12px; border-radius:9px; background:transparent; font-weight:500; font-size:12.5px; color:${TEXT_SOFT}; text-align:left; cursor:pointer; transition:background .15s ease; text-transform:lowercase; white-space:normal; overflow-wrap:anywhere; }
.tc-scope-opt:hover { background:rgba(94,158,255,0.14); }
.tc-scope-opt[aria-selected="true"] { background:rgba(94,158,255,0.22); }

.tc-hero { margin-top:18px; display:flex; flex-direction:column; }
.tc-hero-count { font-family:'Outfit',sans-serif; font-weight:700; font-size:96px; line-height:0.95; letter-spacing:-0.01em; color:${ACCENT}; font-variant-numeric:tabular-nums; }
.tc-hero-label { margin-top:6px; font-weight:300; font-size:16px; color:${NAV_DIM}; }

.tc-search-row { margin-top:56px; display:flex; align-items:center; gap:12px; }
.tc-search { display:flex; align-items:center; gap:10px; width:300px; height:38px; padding:0 16px; box-sizing:border-box; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); }
.tc-search input { flex:1; min-width:0; border:none; background:transparent; outline:none; color:#fff; font-family:'Outfit',sans-serif; font-weight:500; font-size:12px; }
.tc-add { width:38px; height:38px; border-radius:50%; background:${ACTIVE}; display:flex; align-items:center; justify-content:center; cursor:pointer; flex:0 0 auto; box-shadow:0 2px 10px rgba(102,169,255,0.35); transition:opacity .15s ease, transform .15s ease; }
.tc-add:hover { opacity:0.92; transform:scale(1.05); }

.tc-list { margin-top:16px; display:flex; flex-direction:column; gap:5px; width:400px; max-height:490px; overflow-y:auto; scrollbar-width:none; }
.tc-list::-webkit-scrollbar { display:none; }
.tc-row { display:flex; align-items:center; gap:16px; width:100%; min-width:0; box-sizing:border-box; padding:5px 0; border-radius:10px; background:transparent; cursor:pointer; text-align:left; transition:background .15s ease; }
.tc-row:hover { background:rgba(94,158,255,0.06); }
.tc-row[aria-current="true"] { background:rgba(94,158,255,0.12); }
.tc-row:focus-visible { outline:2px solid ${ACCENT_SOFT}; outline-offset:2px; background:rgba(94,158,255,0.1); }
.tc-avatar { width:40px; height:40px; border-radius:50%; border:1.5px solid rgba(94,158,255,0.8); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:11px; color:#fff; flex:0 0 auto; box-sizing:border-box; }
.tc-row-mid { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; white-space:normal; overflow-wrap:anywhere; }
.tc-row-name { font-weight:300; font-size:13.5px; color:${TEXT_SOFT}; white-space:normal; overflow-wrap:anywhere; }
.tc-row-site { font-weight:300; font-size:11.5px; color:rgba(244,246,255,0.62); white-space:normal; overflow-wrap:anywhere; }
.tc-row-status { display:flex; align-items:center; gap:5px; font-weight:500; font-size:11px; color:rgba(244,246,255,0.5); }
.tc-row-dot { width:5px; height:5px; border-radius:50%; opacity:0.7; flex:0 0 auto; }
.tc-row-amt { font-weight:800; font-size:15px; color:#fff; flex:0 0 auto; font-variant-numeric:tabular-nums; }
.tc-empty { padding:26px 0; font-weight:300; font-size:13px; color:rgba(191,209,255,0.5); }

/* ── add-client modal ── */
.tc-modal-wrap { position:absolute; inset:0; z-index:40; display:flex; align-items:center; justify-content:center; }
.tc-backdrop { position:absolute; inset:0; background:rgba(0,6,28,0.62); backdrop-filter:blur(6px); }
.tc-modal { position:relative; width:640px; max-height:620px; overflow-y:auto; padding:26px 28px; border-radius:20px; background:#0B1436; border:1px solid rgba(94,158,255,0.3); box-shadow:0 30px 70px rgba(0,4,24,0.6); animation:tileIn .32s cubic-bezier(.22,.9,.3,1) both; scrollbar-width:none; }
.tc-modal::-webkit-scrollbar { display:none; }
.tc-modal-head { display:flex; align-items:center; justify-content:space-between; }
.tc-modal-title { font-family:'Outfit',sans-serif; font-weight:700; font-size:22px; color:${TEXT_SOFT}; }
.tc-modal-x { width:32px; height:32px; border-radius:50%; border:1px solid rgba(94,158,255,0.4); display:flex; align-items:center; justify-content:center; background:transparent; cursor:pointer; transition:background .15s ease; }
.tc-modal-x:hover { background:rgba(94,158,255,0.1); }

.tc-grid { margin-top:20px; display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.tc-field { display:flex; flex-direction:column; gap:7px; }
.tc-field-wide { grid-column:1 / -1; }
.tc-field > span, .tc-field-label { font-weight:700; font-size:10px; letter-spacing:0.16em; color:rgba(244,246,255,0.45); }
.tc-field input { height:46px; box-sizing:border-box; border-radius:12px; border:1px solid rgba(94,158,255,0.35); background:rgba(94,158,255,0.08); padding:0 16px; font-family:'Outfit',sans-serif; font-weight:600; font-size:13.5px; color:#fff; outline:none; transition:border-color .15s ease; }
.tc-field input:focus { border-color:${ACTIVE}; }

.tc-channel { margin-top:18px; display:flex; flex-direction:column; gap:9px; }
.tc-channel-chips { display:flex; gap:9px; }
.tc-chip { padding:9px 20px; border-radius:9999px; font-size:12.5px; cursor:pointer; transition:background .15s ease, color .15s ease; }
.tc-hint { font-weight:500; font-size:11.5px; color:rgba(240,163,78,0.9); }
.tc-error { margin-top:16px; padding:11px 14px; border-radius:12px; background:rgba(240,101,108,0.14); border:1px solid rgba(240,101,108,0.32); font-weight:600; font-size:12.5px; color:#FFB3B8; }

.tc-modal-actions { margin-top:24px; display:flex; align-items:center; justify-content:flex-end; gap:12px; }
.tc-ghost { height:46px; padding:0 22px; border-radius:9999px; border:1px solid rgba(94,158,255,0.5); background:transparent; font-weight:600; font-size:13.5px; color:${ACCENT_SOFT}; cursor:pointer; transition:background .15s ease; }
.tc-ghost:hover { background:rgba(94,158,255,0.08); }
.tc-primary { height:46px; padding:0 26px; border-radius:9999px; background:${ACTIVE}; font-weight:700; font-size:13.5px; color:${NAVY}; cursor:pointer; transition:opacity .15s ease; }
.tc-primary:hover:not(:disabled) { opacity:0.92; }
.tc-primary:disabled { opacity:0.45; cursor:default; }
`;
