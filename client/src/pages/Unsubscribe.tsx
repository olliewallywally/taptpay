import { useEffect, useState } from 'react';

/**
 * Public unsubscribe landing — the email opt-out target required by NZ's
 * Unsolicited Electronic Messages Act 2007. Reads ?email= (and later ?token=)
 * and posts to the public suppression endpoint. No auth.
 */
export default function Unsubscribe() {
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const email = params.get('email') || '';
  const token = params.get('token') || '';
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const submit = async () => {
    setState('working');
    try {
      const res = await fetch('/api/public/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email || undefined, token: token || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || 'Could not process your request.');
      setMessage(body?.message || 'You have been unsubscribed.');
      setState('done');
    } catch (err: any) {
      setMessage(err?.message || 'Something went wrong. Please email support@taptpay.co.nz.');
      setState('error');
    }
  };

  // Auto-submit when we arrive with an email/token in the link.
  useEffect(() => {
    if (email || token) submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#060D1F' }}>
      <div className="w-full max-w-md bg-white rounded-2xl p-8 text-center shadow-xl">
        <h1 className="text-xl font-semibold text-[#0b1020] mb-2">TaptPay</h1>

        {state === 'working' && <p className="text-sm text-gray-600">Processing your request…</p>}

        {state === 'done' && (
          <>
            <p className="text-base text-[#0b1020] mb-2">{message}</p>
            <p className="text-sm text-gray-500">{email ? <>We won’t email <strong>{email}</strong> again.</> : 'You won’t receive further messages.'}</p>
          </>
        )}

        {state === 'error' && <p className="text-sm text-red-600">{message}</p>}

        {state === 'idle' && (
          <>
            <p className="text-sm text-gray-600 mb-4">
              {email ? <>Unsubscribe <strong>{email}</strong> from TaptPay outreach?</> : 'Confirm you’d like to unsubscribe from TaptPay outreach.'}
            </p>
            <button onClick={submit} className="bg-[#0055FF] text-white rounded-lg px-5 py-2.5 text-sm hover:bg-[#0044cc]" data-testid="button-confirm-unsubscribe">
              Unsubscribe
            </button>
          </>
        )}
      </div>
    </div>
  );
}
