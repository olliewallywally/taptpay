import { useState, useEffect } from "react";
import { useRoute } from "wouter";

const C = {
  navy:  '#040D6D',
  sky:   '#58ABFF',
  btn:   '#3F9BFF',
  white: '#FFFFFF',
  gray:  '#F4F4F4',
  mute:  '#8C8C8C',
  green: '#13C29A',
  red:   '#FF3B4E',
};

function fmtCents(c: number) { return '$' + (c / 100).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function RentCheckout() {
  const [, params] = useRoute('/r/:token');
  const token = params?.token ?? '';

  const [state, setState] = useState<'loading' | 'ready' | 'paying' | 'paid' | 'error' | 'not-found'>('loading');
  const [invoice, setInvoice] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [splitChoosing, setSplitChoosing] = useState(false);
  const [payerEmail, setPayerEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchInvoice = async (firstLoad = false) => {
    if (!token) { if (firstLoad) setState('not-found'); return; }
    try {
      const r = await fetch(`/api/checkout/resolve/${token}`);
      if (r.status === 404) { setState('not-found'); return; }
      if (r.status === 410) { setErrorMsg('This payment link has been voided.'); setState('error'); return; }
      if (!r.ok) { if (firstLoad) { setErrorMsg('Failed to load payment details.'); setState('error'); } return; }
      const data = await r.json();
      if (data.alreadyPaid) { setState('paid'); return; }
      setInvoice(data);
      if (firstLoad) setState('ready');
    } catch {
      if (firstLoad) { setErrorMsg('Unable to load payment. Please check your connection.'); setState('error'); }
    }
  };

  // Initial load
  useEffect(() => { fetchInvoice(true); }, [token]);

  // Poll every 8 seconds when split is active — keeps split progress live for all flatmates
  useEffect(() => {
    const splitActive = !!invoice?.splitEnabled && (invoice?.splitCount ?? 0) > 0;
    const allPaid = splitActive && (invoice?.splitPaidCount ?? 0) >= (invoice?.splitCount ?? 0);
    if (!splitActive || allPaid || state !== 'ready') return;
    const id = setInterval(() => fetchInvoice(false), 8000);
    return () => clearInterval(id);
  }, [invoice?.splitEnabled, invoice?.splitCount, invoice?.splitPaidCount, state]);

  const pay = async () => {
    setState('paying');
    try {
      const r = await fetch('/api/checkout/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, payerEmail: payerEmail.trim() || undefined }),
      });
      if (!r.ok) { const d = await r.json(); setErrorMsg(d.message || 'Payment failed. Please try again.'); setState('error'); return; }
      const { hppUrl } = await r.json();
      window.location.href = hppUrl;
    } catch {
      setErrorMsg('Payment failed. Please try again.');
      setState('error');
    }
  };

  const setupSplit = async (count: number) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/checkout/${token}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count }),
      });
      if (!r.ok) { const d = await r.json(); setErrorMsg(d.message || 'Could not set up the split.'); setState('error'); return; }
      const data = await r.json();
      setInvoice((prev: any) => ({ ...prev, splitCount: data.splitCount, splitPaidCount: data.splitPaidCount }));
      setSplitChoosing(false);
    } catch {
      setErrorMsg('Could not set up the split.'); setState('error');
    } finally { setBusy(false); }
  };

  const dueDate = invoice?.dueAt ? new Date(invoice.dueAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  /* Split-bill derived values */
  const total = invoice?.amountCents ?? 0;
  const splitCount = invoice?.splitCount ?? 0;
  const splitPaid = invoice?.splitPaidCount ?? 0;
  const splitActive = !!invoice?.splitEnabled && splitCount > 0;
  const shareBase = splitCount ? Math.floor(total / splitCount) : 0;
  const isLastShare = splitCount ? splitPaid === splitCount - 1 : false;
  const shareCents = splitCount ? (isLastShare ? total - shareBase * (splitCount - 1) : shareBase) : total;
  const sharesLeft = splitCount ? splitCount - splitPaid : 0;
  const paying = state === 'paying';

  return (
    <div style={{ minHeight: '100svh', background: C.gray, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Outfit', system-ui, sans-serif" }}>

      {state === 'loading' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, borderRadius: 999, border: `3px solid ${C.sky}`, borderTopColor: 'transparent', animation: 'spin 0.9s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: C.mute, fontSize: 14 }}>loading payment…</p>
        </div>
      )}

      {state === 'not-found' && (
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <h2 style={{ color: C.navy, fontWeight: 700, fontSize: 22, margin: '0 0 8px' }}>link not found</h2>
          <p style={{ color: C.mute, fontSize: 14, lineHeight: 1.5 }}>this payment link doesn't exist or has expired.</p>
        </div>
      )}

      {state === 'paid' && (
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div style={{ width: 64, height: 64, borderRadius: 999, background: 'rgba(19,194,154,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7"/></svg>
          </div>
          <h2 style={{ color: C.navy, fontWeight: 700, fontSize: 22, margin: '0 0 8px' }}>already paid</h2>
          <p style={{ color: C.mute, fontSize: 14 }}>this rent has already been paid. thanks!</p>
        </div>
      )}

      {state === 'error' && (
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div style={{ width: 64, height: 64, borderRadius: 999, background: 'rgba(255,59,78,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.2" strokeLinecap="round"><path d="M12 8v5M12 16.5h.01"/><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/></svg>
          </div>
          <h2 style={{ color: C.navy, fontWeight: 700, fontSize: 22, margin: '0 0 8px' }}>something went wrong</h2>
          <p style={{ color: C.mute, fontSize: 14, lineHeight: 1.5 }}>{errorMsg}</p>
        </div>
      )}

      {(state === 'ready' || state === 'paying') && invoice && (
        <div style={{ width: '100%', maxWidth: 390 }}>
          {/* Header */}
          <div style={{ background: C.navy, borderRadius: 24, padding: '28px 28px 32px', marginBottom: 20 }}>
            <div style={{ fontWeight: 500, fontSize: 12, color: C.sky, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 }}>rent payment</div>
            <div style={{ fontWeight: 900, fontSize: 52, color: C.sky, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', marginBottom: 12 }}>
              {splitActive && sharesLeft > 0 ? fmtCents(shareCents) : fmtCents(invoice.amountCents)}
            </div>
            {splitActive && sharesLeft > 0 && (
              <div style={{ fontSize: 12, color: 'rgba(88,171,255,0.6)', marginBottom: 4, marginTop: -8 }}>
                your share · {fmtCents(invoice.amountCents)} total
              </div>
            )}
            <div style={{ height: 1, background: 'rgba(88,171,255,0.2)', marginBottom: 16 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>property</span>
                <span style={{ fontSize: 13, color: C.white, fontWeight: 600, maxWidth: 220, textAlign: 'right' }}>{invoice.propertyAddress}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>tenant</span>
                <span style={{ fontSize: 13, color: C.white, fontWeight: 600 }}>{invoice.tenantName}</span>
              </div>
              {invoice.coTenantsText && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>co-tenants</span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', maxWidth: 200, textAlign: 'right' }}>{invoice.coTenantsText}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>managed by</span>
                <span style={{ fontSize: 13, color: C.white, fontWeight: 600 }}>{invoice.merchantName}</span>
              </div>
              {dueDate && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>due</span>
                  <span style={{ fontSize: 13, color: C.white, fontWeight: 600 }}>{dueDate}</span>
                </div>
              )}
            </div>
          </div>

          {/* Split progress (once a split is under way) */}
          {splitActive && (
            <div style={{ background: C.white, border: '1px solid #ECECEC', borderRadius: 18, padding: '16px 18px', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.navy, letterSpacing: '0.04em', textTransform: 'uppercase' }}>split {splitCount} ways</span>
                <span style={{ fontSize: 12, color: C.mute }}>{splitPaid} of {splitCount} paid</span>
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                {Array.from({ length: splitCount }).map((_, i) => (
                  <div key={i} style={{ flex: 1, height: 7, borderRadius: 999, background: i < splitPaid ? C.green : 'rgba(4,13,109,0.1)', transition: 'background 0.3s' }} />
                ))}
              </div>
              <div style={{ marginTop: 12, fontSize: 12.5, color: C.mute, lineHeight: 1.5 }}>
                {sharesLeft > 0
                  ? <>each flatmate pays their share with this same link — <strong style={{ color: C.navy }}>{sharesLeft}</strong> share{sharesLeft !== 1 ? 's' : ''} left.</>
                  : 'all shares paid 🎉'}
              </div>
            </div>
          )}

          {/* Split chooser */}
          {invoice.splitEnabled && !splitActive && splitChoosing && (
            <div style={{ background: C.white, border: '1px solid #ECECEC', borderRadius: 18, padding: '18px', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 4 }}>how many of you are splitting?</div>
              <div style={{ fontSize: 12, color: C.mute, marginBottom: 14 }}>the rent is divided evenly — everyone pays their share with this link.</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
                {[2, 3, 4, 5, 6].map(n => (
                  <button key={n} onClick={() => !busy && setupSplit(n)} disabled={busy}
                    style={{ padding: '14px 0', borderRadius: 12, border: `1.5px solid ${C.sky}`, background: C.white, color: C.navy, fontWeight: 800, fontSize: 16, cursor: busy ? 'wait' : 'pointer' }}>
                    {n}
                  </button>
                ))}
              </div>
              <button onClick={() => setSplitChoosing(false)} style={{ marginTop: 12, width: '100%', background: 'none', border: 'none', color: C.mute, fontSize: 13, cursor: 'pointer' }}>cancel</button>
            </div>
          )}

          {/* Payer email (for split shares — so each person gets their GST invoice) */}
          {splitActive && sharesLeft > 0 && (
            <input
              type="email"
              value={payerEmail}
              onChange={e => setPayerEmail(e.target.value)}
              placeholder="your email (for your receipt)"
              style={{ width: '100%', boxSizing: 'border-box', padding: '15px 18px', borderRadius: 14, border: '1px solid #E2E2E2', fontSize: 15, color: C.navy, outline: 'none', marginBottom: 12, fontFamily: 'inherit' }}
            />
          )}

          {/* Primary action(s) */}
          {sharesLeft > 0 || !splitActive ? (
            <button
              onClick={pay}
              disabled={paying}
              style={{ width: '100%', padding: '20px 0', borderRadius: 999, background: paying ? C.sky : C.btn, color: C.navy, fontWeight: 800, fontSize: 17, border: 'none', cursor: paying ? 'wait' : 'pointer', letterSpacing: '-0.01em', transition: 'background 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              {paying ? (
                <>
                  <div style={{ width: 18, height: 18, borderRadius: 999, border: `2.5px solid ${C.navy}`, borderTopColor: 'transparent', animation: 'spin 0.9s linear infinite' }} />
                  processing…
                </>
              ) : splitActive ? `pay your share ${fmtCents(shareCents)}` : `pay ${fmtCents(total)}`}
            </button>
          ) : null}

          {/* Offer to split (only before a split has started) */}
          {invoice.splitEnabled && !splitActive && !splitChoosing && (
            <button
              onClick={() => setSplitChoosing(true)}
              disabled={paying}
              style={{ width: '100%', padding: '16px 0', borderRadius: 999, background: 'transparent', color: C.navy, fontWeight: 700, fontSize: 15, border: `1.5px solid ${C.sky}`, cursor: 'pointer', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="3.2"/><circle cx="17" cy="8" r="2.4"/><path d="M3 20c0-3.3 2.7-5.8 6-5.8s6 2.5 6 5.8"/><path d="M17.5 14.3c2.1.3 3.7 2 3.7 4.2"/></svg>
              split with flatmates
            </button>
          )}

          <p style={{ textAlign: 'center', fontSize: 11, color: C.mute, marginTop: 16, lineHeight: 1.5 }}>
            secured by tapt pay · you'll be redirected to complete payment
          </p>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
