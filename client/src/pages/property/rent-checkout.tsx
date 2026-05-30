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

  useEffect(() => {
    if (!token) { setState('not-found'); return; }
    fetch(`/api/checkout/resolve/${token}`)
      .then(async r => {
        if (r.status === 404) { setState('not-found'); return; }
        if (r.status === 410) { setErrorMsg('This payment link has been voided.'); setState('error'); return; }
        if (!r.ok) { setErrorMsg('Failed to load payment details.'); setState('error'); return; }
        const data = await r.json();
        if (data.alreadyPaid) { setState('paid'); return; }
        setInvoice(data);
        setState('ready');
      })
      .catch(() => { setErrorMsg('Unable to load payment. Please check your connection.'); setState('error'); });
  }, [token]);

  const pay = async () => {
    setState('paying');
    try {
      const r = await fetch('/api/checkout/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!r.ok) { const d = await r.json(); setErrorMsg(d.message || 'Payment failed. Please try again.'); setState('error'); return; }
      const { hppUrl } = await r.json();
      window.location.href = hppUrl;
    } catch {
      setErrorMsg('Payment failed. Please try again.');
      setState('error');
    }
  };

  const dueDate = invoice?.dueAt ? new Date(invoice.dueAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

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
              {fmtCents(invoice.amountCents)}
            </div>
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

          {/* Pay button */}
          <button
            onClick={pay}
            disabled={state === 'paying'}
            style={{ width: '100%', padding: '20px 0', borderRadius: 999, background: state === 'paying' ? C.sky : C.btn, color: C.navy, fontWeight: 800, fontSize: 17, border: 'none', cursor: state === 'paying' ? 'wait' : 'pointer', letterSpacing: '-0.01em', transition: 'background 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            {state === 'paying' ? (
              <>
                <div style={{ width: 18, height: 18, borderRadius: 999, border: `2.5px solid ${C.navy}`, borderTopColor: 'transparent', animation: 'spin 0.9s linear infinite' }} />
                processing…
              </>
            ) : (
              `pay ${fmtCents(invoice.amountCents)}`
            )}
          </button>

          <p style={{ textAlign: 'center', fontSize: 11, color: C.mute, marginTop: 16, lineHeight: 1.5 }}>
            secured by tapt pay · you'll be redirected to complete payment
          </p>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
