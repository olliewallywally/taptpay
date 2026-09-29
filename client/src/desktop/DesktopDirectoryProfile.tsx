import { useQuery } from "@tanstack/react-query";
import { propFetch } from "@/lib/property-api";
import { tradesFetch } from "@/lib/trades-api";

type Vertical = "trades" | "property";

export function DesktopDirectoryProfile({
  vertical,
  profile,
}: {
  vertical: Vertical;
  profile: any;
}) {
  const id = String(profile?.id ?? "");
  const noun = vertical === "trades" ? "client" : "tenant";
  const address = vertical === "trades" ? profile?.siteAddress : profile?.propertyAddress;
  const name = `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim() || noun;
  const initials = `${profile?.firstName?.[0] ?? ""}${profile?.lastName?.[0] ?? ""}`.toUpperCase() || "?";
  const base = vertical === "trades" ? "/api/trades/clients" : "/api/property/tenants";
  const eventsQuery = useQuery<any[]>({
    queryKey: [base, id, "events"],
    queryFn: async () => {
      const response = vertical === "trades"
        ? await tradesFetch(`${base}/${id}/events`)
        : await propFetch(`${base}/${id}/events`);
      return response.ok ? response.json() : [];
    },
    enabled: !!id,
    staleTime: 30_000,
    retry: false,
  });
  const events = eventsQuery.data ?? [];

  return (
    <aside key={`${vertical}-${id}`} className="ddp" aria-label={`${name} ${noun} profile`}>
      <div className="ddp-hero ddp-pop" style={{ "--ddp-d": "0ms" } as React.CSSProperties}>
        <div className="ddp-head">
          <span className="ddp-avatar" aria-hidden="true">{initials}</span>
          <div className="ddp-title"><small>{noun} profile</small><strong>{name}</strong></div>
          <span className="ddp-status"><i />{profile?.status ?? "active"}</span>
        </div>
        <div className="ddp-fields">
          <ProfileField label={vertical === "trades" ? "site address" : "property address"} value={address} wide />
          <ProfileField label="email" value={profile?.email} />
          <ProfileField label="phone" value={profile?.phone} />
          <ProfileField label="payment link via" value={profile?.preferredChannel} wide />
          {profile?.notes && <ProfileField label="notes" value={profile.notes} wide />}
        </div>
      </div>
      <div className="ddp-timeline-head ddp-pop" style={{ "--ddp-d": "60ms" } as React.CSSProperties}>
        <strong>activity timeline</strong><span>{events.length}</span>
      </div>
      <div className="ddp-events">
        {eventsQuery.isLoading ? <p>loading activity…</p> : events.length === 0 ? <p>no activity yet</p> : events.slice(0, 10).map((event, index) => (
          <div key={event.id ?? index} className="ddp-event ddp-pop" style={{ "--ddp-d": `${Math.min(90 + index * 28, 230)}ms` } as React.CSSProperties}>
            <span className="ddp-rail"><i /></span>
            <div><strong>{eventLabel(event.eventType)}</strong><small>{formatDate(event.createdAt)}</small></div>
          </div>
        ))}
      </div>
      <style>{CSS}</style>
    </aside>
  );
}

function ProfileField({ label, value, wide = false }: { label: string; value: unknown; wide?: boolean }) {
  if (!value) return null;
  return <div className={`ddp-field${wide ? " ddp-wide" : ""}`}><small>{label}</small><span>{String(value)}</span></div>;
}

const eventLabel = (value: unknown) => String(value ?? "activity").replaceAll("_", " ").toLowerCase();
const formatDate = (value: unknown) => value ? new Date(String(value)).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : "";

const CSS = `
.ddp{position:absolute;left:500px;right:52px;top:42px;bottom:24px;overflow-y:auto;scrollbar-width:none;color:#F4F6FF}.ddp::-webkit-scrollbar{display:none}
.ddp-hero{padding:22px;border-radius:24px;background:#071746}.ddp-head{display:flex;align-items:center;gap:14px}.ddp-avatar{width:52px;height:52px;border-radius:50%;background:#66A9FF;color:#000F3F;display:grid;place-items:center;font-weight:800}.ddp-title{display:flex;flex:1;min-width:0;flex-direction:column}.ddp-title small,.ddp-field small{font-size:9px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:#7FB2FF}.ddp-title strong{margin-top:2px;font-size:22px}.ddp-status{display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:9px;background:rgba(94,158,255,.18);font-size:10px;font-weight:700;text-transform:uppercase;color:#9BC1FF}.ddp-status i{width:6px;height:6px;border-radius:50%;background:#35D07F}
.ddp-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:18px}.ddp-field{min-width:0;padding:11px 12px;border-radius:12px;background:rgba(255,255,255,.07);display:flex;flex-direction:column;gap:5px}.ddp-field span{font-size:13px;overflow-wrap:anywhere}.ddp-wide{grid-column:1/-1}
.ddp-timeline-head{display:flex;justify-content:space-between;align-items:center;padding:22px 4px 10px;text-transform:uppercase;color:#7FB2FF}.ddp-timeline-head strong{font-size:11px;letter-spacing:.12em}.ddp-timeline-head span{font-size:11px}.ddp-events p{padding:20px 4px;color:rgba(191,209,255,.55);font-size:12px}.ddp-event{display:flex;gap:12px;min-height:58px}.ddp-rail{position:relative;width:12px;display:flex;justify-content:center}.ddp-rail:after{content:'';position:absolute;top:15px;bottom:-2px;width:1px;background:rgba(94,158,255,.28)}.ddp-event:last-child .ddp-rail:after{display:none}.ddp-rail i{position:relative;z-index:1;margin-top:6px;width:8px;height:8px;border-radius:50%;background:#66A9FF;box-shadow:0 0 0 4px #000F3F}.ddp-event>div{display:flex;flex:1;justify-content:space-between;gap:12px;padding:2px 0 14px;border-bottom:1px solid rgba(94,158,255,.12)}.ddp-event strong{font-size:12.5px;font-weight:600}.ddp-event small{font-size:10.5px;color:rgba(191,209,255,.55);white-space:nowrap}
.ddp-pop{animation:ddpPop var(--m-dur-enter) var(--m-ease-out) var(--ddp-d) both}@keyframes ddpPop{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){.ddp-pop{animation:none;opacity:1}}
`;
