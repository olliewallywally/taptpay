import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePropertyInvoices, usePropertyTenants, PROPERTY_KEYS } from "@/lib/property-data";
import { propHeaders } from "@/lib/property-api";
import { fmtNZD } from "@/lib/report-utils";
import {
  DesktopPageScaffold,
  type DesktopRoutePageProps,
} from "../DesktopPageScaffold";
import { entranceProps, useListEntrance } from "../list-entrance";
import { DesktopDirectoryProfile } from "../DesktopDirectoryProfile";

/* ── palette ── */
const ACCENT = "#5E9EFF";
const ACCENT_SOFT = "#7FB2FF";
const NAV_DIM = "#4A86F0";
const ACTIVE = "#66A9FF";
const TEXT_SOFT = "#F4F6FF";
const NAVY = "#000F3F";
const RED = "#F0656C";
const AMBER = "#F0A34E";

type Channel = "email" | "whatsapp" | "sms";

const CHANNELS: { v: Channel; label: string }[] = [
  { v: "email", label: "email" },
  { v: "sms", label: "sms" },
  { v: "whatsapp", label: "whatsapp" },
];

const initialsOf = (t: any) =>
  `${t?.firstName?.[0] ?? ""}${t?.lastName?.[0] ?? ""}`.toUpperCase() || "?";

const fullNameOf = (t: any) => `${t?.firstName ?? ""} ${t?.lastName ?? ""}`.trim() || "tenant";

const fmtDue = (invoice: any) =>
  invoice?.dueAt
    ? new Date(invoice.dueAt).toLocaleDateString("en-NZ", { day: "2-digit", month: "2-digit" })
    : "";

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  propertyAddress: "",
  preferredChannel: "email" as Channel,
};

export default function DesktopPropertyClients(props: DesktopRoutePageProps) {
  const queryClient = useQueryClient();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("client"));
  const [search, setSearch] = useState("");
  const [propFilter, setPropFilter] = useState<string | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saveError, setSaveError] = useState<string | null>(null);

  const tenantsQuery = usePropertyTenants();
  const invoicesQuery = usePropertyInvoices();
  const tenants = tenantsQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];

  /* Same worst-case-status rule the mobile directory uses, so a tenant reads the
     same on both UIs: overdue beats pending, pending beats the newest invoice. */
  const invoiceByTenant = useMemo(() => {
    const map = new Map<string, any>();
    for (const t of tenants) {
      const live = invoices.filter((i: any) => i.tenantProfileId === t.id && i.status !== "voided");
      if (live.length === 0) continue;
      const overdue = live.find((i: any) => i.status === "overdue");
      const pending = live.find((i: any) =>
        ["dispatched", "pending_dispatch", "dispatch_failed"].includes(i.status),
      );
      map.set(
        t.id,
        overdue ??
          pending ??
          [...live].sort(
            (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )[0],
      );
    }
    return map;
  }, [tenants, invoices]);

  const activeTenants = useMemo(
    () => tenants.filter((t: any) => t.status !== "archived"),
    [tenants],
  );
  const addresses = useMemo(
    () =>
      Array.from(
        new Set(activeTenants.map((t: any) => t.propertyAddress).filter(Boolean)),
      ) as string[],
    [activeTenants],
  );
  /* A property can disappear from the active choices after a refetch (for
     example, when its final tenant is archived). Treat that stale selection as
     all properties immediately instead of leaving the directory at an
     impossible zero-row scope. */
  const propertyScope =
    propFilter && addresses.includes(propFilter) ? propFilter : null;

  /* The count sits under the scope pill, so it answers "how many here": it
     follows the property scope but not the search box, which is a find-tool
     rather than a filter. Same rule as the trades directory (3b). */
  const scopedTenants = activeTenants.filter(
    (t: any) => !propertyScope || t.propertyAddress === propertyScope,
  );

  const term = search.trim().toLowerCase();
  const rows = scopedTenants.filter(
    (t: any) =>
      !term ||
      fullNameOf(t).toLowerCase().includes(term) ||
      String(t.propertyAddress ?? "").toLowerCase().includes(term),
  );
  /* Row entrance: seeded from the whole tenant dataset, so searching or
     changing the property scope never replays a row the user has already seen. */
  const entrance = useListEntrance(
    useMemo(() => tenants.map((t: any) => String(t.id)), [tenants]),
    useMemo(() => rows.map((t: any) => String(t.id)), [rows]),
  );

  const selectedTenant = tenants.find((tenant: any) => tenant.id === selectedTenantId) ?? null;
  const selectTenant = (id: string) => {
    setSelectedTenantId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("client", id);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_FORM) => {
      const res = await fetch("/api/property/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...propHeaders() },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const message = await res
          .json()
          .then((d) => d.message)
          .catch(() => `Error ${res.status}`);
        throw new Error(message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROPERTY_KEYS.tenants as any });
      setAddOpen(false);
      setForm(EMPTY_FORM);
      setSaveError(null);
    },
    onError: (err: any) => setSaveError(err?.message || "Failed to add tenant."),
  });

  /* The chosen delivery channel must have a contact to send to — the mobile
     form's rule, kept identical so the same tenants are valid on both. */
  const channelContactOk =
    form.preferredChannel === "email" ? !!form.email.trim() : !!form.phone.trim();
  const formValid =
    !!form.firstName.trim() && !!form.lastName.trim() && !!form.propertyAddress.trim() && channelContactOk;

  const set = (k: keyof typeof EMPTY_FORM) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v } as typeof EMPTY_FORM));

  const countLabel = `active tenant${scopedTenants.length === 1 ? "" : "s"}`;
  const countAnnouncement = tenantsQuery.isLoading
    ? "loading active tenants"
    : `${scopedTenants.length} ${countLabel}`;

  return (
    <DesktopPageScaffold {...props} vertical="property" page="directory" showScope={false}>
      <style>{PC_CSS}</style>
      <div className="pc-body">
        <div className="pc-scope-wrap dt-rise">
          <button
            type="button"
            className="pc-scope"
            aria-haspopup="listbox"
            aria-expanded={scopeOpen}
            aria-label={`${propertyScope ?? "all properties"} scope`}
            onClick={() => setScopeOpen((o) => !o)}
          >
            <span>{propertyScope ?? "all properties"}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {scopeOpen && (
            <div className="pc-scope-menu" role="listbox">
              <button
                type="button"
                className="pc-scope-opt"
                role="option"
                aria-selected={propertyScope === null}
                onClick={() => {
                  setPropFilter(null);
                  setScopeOpen(false);
                }}
              >
                all properties
              </button>
              {addresses.map((a) => (
                <button
                  key={a}
                  type="button"
                  className="pc-scope-opt"
                  role="option"
                  aria-selected={propertyScope === a}
                  onClick={() => {
                    setPropFilter(a);
                    setScopeOpen(false);
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          className="pc-hero dt-rise"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label={countAnnouncement}
        >
          <span className="pc-hero-count">
            {tenantsQuery.isLoading ? "—" : scopedTenants.length}
          </span>
          <span className="pc-hero-label">{countLabel}</span>
        </div>

        <div className="pc-search-row dt-rise" data-tutorial-id="property-directory-search">
          <div className="pc-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.8-3.8" /></svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search tenants"
              aria-label="search tenants"
            />
          </div>
          <button type="button" className="pc-add" data-tutorial-id="property-directory-add" aria-label="add tenant" onClick={() => setAddOpen(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>

        {/* No dt-rise here: the rows own the entrance, and stacking a wrapper
            rise on top of it would run two entrances against each other. */}
        <div className="pc-list">
          {tenantsQuery.isLoading ? (
            <div className="pc-empty">loading tenants…</div>
          ) : rows.length === 0 ? (
            <div className="pc-empty">
              {term || propertyScope ? "no matching tenants" : "no tenants yet — add your first with +"}
            </div>
          ) : (
            rows.map((t: any) => {
              const invoice = invoiceByTenant.get(t.id);
              const overdue = invoice?.status === "overdue";
              const statusLabel = invoice
                ? overdue
                  ? `overdue · ${fmtDue(invoice)}`
                  : `next payment · ${fmtDue(invoice)}`
                : "no invoice yet";
              return (
                <button
                  key={t.id}
                  type="button"
                  {...entranceProps(entrance, String(t.id), "pc-row")}
                  aria-current={t.id === selectedTenantId ? "true" : undefined}
                  onClick={() => selectTenant(t.id)}
                >
                  <span className="pc-avatar">{initialsOf(t)}</span>
                  <span className="pc-row-mid">
                    <span className="pc-row-name">{fullNameOf(t)}</span>
                    <span className="pc-row-status">
                      <span
                        className="pc-row-dot"
                        style={{ background: overdue ? RED : invoice ? ACCENT : AMBER }}
                      />
                      <span>{statusLabel}</span>
                    </span>
                  </span>
                  <span className="pc-row-address">{t.propertyAddress}</span>
                  <span className="pc-row-amt">{invoice ? fmtNZD(invoice.amountCents ?? 0) : "—"}</span>
                </button>
              );
            })
          )}
        </div>
        {selectedTenant && <DesktopDirectoryProfile vertical="property" profile={selectedTenant} />}
      </div>

      {/* ── add tenant ── */}
      {addOpen && (
        <div className="pc-modal-wrap">
          <div
            className="pc-backdrop"
            role="button"
            tabIndex={-1}
            aria-label="close"
            onClick={() => setAddOpen(false)}
          />
          <div className="pc-modal" role="dialog" aria-modal="true" aria-label="add tenant">
            <div className="pc-modal-head">
              <span className="pc-modal-title">Add tenant</span>
              <button type="button" className="pc-modal-x" aria-label="close" onClick={() => setAddOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>

            <div className="pc-grid">
              <label className="pc-field">
                <span>FIRST NAME</span>
                <input value={form.firstName} onChange={(e) => set("firstName")(e.target.value)} aria-label="first name" />
              </label>
              <label className="pc-field">
                <span>LAST NAME</span>
                <input value={form.lastName} onChange={(e) => set("lastName")(e.target.value)} aria-label="last name" />
              </label>
              <label className="pc-field pc-field-wide">
                <span>PROPERTY ADDRESS</span>
                <input value={form.propertyAddress} onChange={(e) => set("propertyAddress")(e.target.value)} aria-label="property address" />
              </label>
              <label className="pc-field">
                <span>EMAIL</span>
                <input value={form.email} onChange={(e) => set("email")(e.target.value)} type="email" aria-label="email" />
              </label>
              <label className="pc-field">
                <span>PHONE</span>
                <input value={form.phone} onChange={(e) => set("phone")(e.target.value)} aria-label="phone" />
              </label>
            </div>

            <div className="pc-channel">
              <span className="pc-field-label">SEND RENT REQUESTS BY</span>
              <div className="pc-channel-chips">
                {CHANNELS.map((c) => {
                  const on = form.preferredChannel === c.v;
                  return (
                    <button
                      key={c.v}
                      type="button"
                      className="pc-chip"
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
                <span className="pc-hint">
                  {form.preferredChannel === "email"
                    ? "an email address is required to send by email"
                    : "a phone number is required to send by sms or whatsapp"}
                </span>
              )}
            </div>

            {saveError && <div className="pc-error">{saveError}</div>}

            <div className="pc-modal-actions">
              <button type="button" className="pc-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
              <button
                type="button"
                className="pc-primary"
                disabled={!formValid || createMutation.isPending}
                onClick={() => createMutation.mutate(form)}
              >
                {createMutation.isPending ? "Adding…" : "Add tenant"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DesktopPageScaffold>
  );
}

const PC_CSS = `
.pc-body { position:relative; height:100%; box-sizing:border-box; padding:26px 52px 0; }

/* Page-entry cascade: scope → count → search → list (steps 0–3). */
.pc-scope-wrap { position:relative; display:inline-block; z-index:5; --dt-i:0; }
.pc-scope { display:inline-flex; align-items:center; gap:9px; padding:10px 20px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); background:transparent; font-weight:400; font-size:13.5px; color:${ACCENT_SOFT}; cursor:pointer; transition:background .18s ease; text-transform:lowercase; }
.pc-scope:hover { background:rgba(94,158,255,0.08); }
.pc-scope-menu { position:absolute; top:calc(100% + 6px); left:0; min-width:220px; max-height:260px; overflow-y:auto; padding:6px; border-radius:14px; background:#0B1436; border:1px solid rgba(94,158,255,0.3); box-shadow:0 18px 40px rgba(0,4,24,0.5); display:flex; flex-direction:column; gap:2px; }
.pc-scope-opt { padding:9px 12px; border-radius:9px; background:transparent; font-weight:500; font-size:12.5px; color:${TEXT_SOFT}; text-align:left; cursor:pointer; transition:background .15s ease; text-transform:lowercase; }
.pc-scope-opt:hover { background:rgba(94,158,255,0.14); }
.pc-scope-opt[aria-selected="true"] { background:rgba(94,158,255,0.22); }

.pc-hero { margin-top:18px; display:flex; flex-direction:column; --dt-i:1; }
.pc-hero-count { font-family:'Outfit',sans-serif; font-weight:700; font-size:96px; line-height:0.95; letter-spacing:-0.01em; color:${ACCENT}; font-variant-numeric:tabular-nums; }
.pc-hero-label { margin-top:6px; font-weight:300; font-size:16px; color:${NAV_DIM}; }

.pc-search-row { margin-top:56px; display:flex; align-items:center; gap:12px; --dt-i:2; }
.pc-search { display:flex; align-items:center; gap:10px; width:300px; height:38px; padding:0 16px; box-sizing:border-box; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); }
.pc-search input { flex:1; min-width:0; border:none; background:transparent; outline:none; color:#fff; font-family:'Outfit',sans-serif; font-weight:500; font-size:12px; }
.pc-add { width:38px; height:38px; border-radius:50%; background:${ACTIVE}; display:flex; align-items:center; justify-content:center; cursor:pointer; flex:0 0 auto; box-shadow:0 2px 10px rgba(102,169,255,0.35); transition:opacity .15s ease, transform .15s ease; }
.pc-add:hover { opacity:0.92; transform:scale(1.05); }

.pc-list { margin-top:16px; display:flex; flex-direction:column; gap:5px; width:400px; max-height:520px; overflow-y:auto; scrollbar-width:none; --dt-i:3; }
.pc-list::-webkit-scrollbar { display:none; }
.pc-row { display:flex; align-items:center; gap:16px; padding:2px 8px 2px 0; border-radius:10px; background:transparent; cursor:pointer; text-align:left; transition:background .15s ease; }
.pc-row:hover { background:rgba(94,158,255,0.06); }
.pc-row[aria-current="true"] { background:rgba(94,158,255,0.12); }
.pc-avatar { width:40px; height:40px; border-radius:50%; border:1.5px solid rgba(94,158,255,0.8); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:11px; color:#fff; flex:0 0 auto; box-sizing:border-box; }
.pc-row-mid { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
.pc-row-name { font-weight:300; font-size:13.5px; color:${TEXT_SOFT}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pc-row-status { display:flex; align-items:center; gap:5px; font-weight:500; font-size:11px; color:rgba(244,246,255,0.5); }
.pc-row-dot { width:5px; height:5px; border-radius:50%; opacity:0.7; flex:0 0 auto; }
.pc-row-address { display:none; }
.pc-row-amt { font-weight:800; font-size:15px; color:#fff; flex:0 0 auto; font-variant-numeric:tabular-nums; }
.pc-empty { padding:26px 0; font-weight:300; font-size:13px; color:rgba(191,209,255,0.5); }

/* ── add-tenant modal ── */
.pc-modal-wrap { position:absolute; inset:0; z-index:40; display:flex; align-items:center; justify-content:center; }
.pc-backdrop { position:absolute; inset:0; background:rgba(0,6,28,0.62); backdrop-filter:blur(6px); }
.pc-modal { position:relative; width:640px; max-height:620px; overflow-y:auto; padding:26px 28px; border-radius:20px; background:#0B1436; border:1px solid rgba(94,158,255,0.3); box-shadow:0 30px 70px rgba(0,4,24,0.6); animation:tileIn var(--m-dur-ui) var(--m-ease-out) both; scrollbar-width:none; }
.pc-modal::-webkit-scrollbar { display:none; }
.pc-modal-head { display:flex; align-items:center; justify-content:space-between; }
.pc-modal-title { font-family:'Outfit',sans-serif; font-weight:700; font-size:22px; color:${TEXT_SOFT}; }
.pc-modal-x { width:32px; height:32px; border-radius:50%; border:1px solid rgba(94,158,255,0.4); display:flex; align-items:center; justify-content:center; background:transparent; cursor:pointer; transition:background .15s ease; }
.pc-modal-x:hover { background:rgba(94,158,255,0.1); }

.pc-grid { margin-top:20px; display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.pc-field { display:flex; flex-direction:column; gap:7px; }
.pc-field-wide { grid-column:1 / -1; }
.pc-field > span, .pc-field-label { font-weight:700; font-size:10px; letter-spacing:0.16em; color:rgba(244,246,255,0.45); }
.pc-field input { height:46px; box-sizing:border-box; border-radius:12px; border:1px solid rgba(94,158,255,0.35); background:rgba(94,158,255,0.08); padding:0 16px; font-family:'Outfit',sans-serif; font-weight:600; font-size:13.5px; color:#fff; outline:none; transition:border-color .15s ease; }
.pc-field input:focus { border-color:${ACTIVE}; }

.pc-channel { margin-top:18px; display:flex; flex-direction:column; gap:9px; }
.pc-channel-chips { display:flex; gap:9px; }
.pc-chip { padding:9px 20px; border-radius:9999px; font-size:12.5px; cursor:pointer; transition:background .15s ease, color .15s ease; }
.pc-hint { font-weight:500; font-size:11.5px; color:rgba(240,163,78,0.9); }
.pc-error { margin-top:16px; padding:11px 14px; border-radius:12px; background:rgba(240,101,108,0.14); border:1px solid rgba(240,101,108,0.32); font-weight:600; font-size:12.5px; color:#FFB3B8; }

.pc-modal-actions { margin-top:24px; display:flex; align-items:center; justify-content:flex-end; gap:12px; }
.pc-ghost { height:46px; padding:0 22px; border-radius:9999px; border:1px solid rgba(94,158,255,0.5); background:transparent; font-weight:600; font-size:13.5px; color:${ACCENT_SOFT}; cursor:pointer; transition:background .15s ease; }
.pc-ghost:hover { background:rgba(94,158,255,0.08); }
.pc-primary { height:46px; padding:0 26px; border-radius:9999px; background:${ACTIVE}; font-weight:700; font-size:13.5px; color:${NAVY}; cursor:pointer; transition:opacity .15s ease; }
.pc-primary:hover:not(:disabled) { opacity:0.92; }
.pc-primary:disabled { opacity:0.45; cursor:default; }
`;
