import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { QuoteViewProps } from './TradesTerminalView';
import { formatNzd as money } from '@/lib/trades-money';
import './mobile-quote-view.css';

type Recipient = { name: string; email: string; address: string };
export type MobileQuoteViewProps = QuoteViewProps & {
  recipient: Recipient;
  onRecipientChange: (value: Recipient) => void;
  onSkipClient: () => void;
  onShare: () => void;
};

export function MobileQuoteView(p: MobileQuoteViewProps) {
  const [step, setStep] = useState(p.created ? 4 : 0);
  const [navigating, setNavigating] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [search, setSearch] = useState('');
  const directoryButton = useRef<HTMLButtonElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const motion = useRef<Animation | null>(null);
  const direction = useRef(1);
  const moving = useRef(false);
  const [custom, setCustom] = useState(p.depositType !== 'percent' || !['10', '20'].includes(p.depositValue));
  const [validation, setValidation] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const selected = p.clients.find(c => c.id === p.clientId);
  const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const go = (next: number) => {
    if (moving.current || next === step) return;
    direction.current = next > step ? 1 : -1;
    const commit = () => { setValidation(''); setDirectoryOpen(false); setStep(next); };
    if (!pageRef.current?.animate || reducedMotion()) { commit(); return; }
    moving.current = true;
    setNavigating(true);
    motion.current?.cancel();
    motion.current = pageRef.current.animate([
      { opacity: 1, transform: 'translateY(0) scale(1)', offset: 0 },
      { opacity: 1, transform: `translateY(${-direction.current * 3}px) scale(1.015)`, offset: .25 },
      { opacity: 0, transform: `translateY(${-direction.current * 14}px) scale(.96)`, offset: 1 },
    ], { duration: 190, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
    void motion.current.finished.then(commit).catch(() => {});
  };
  useLayoutEffect(() => {
    motion.current?.cancel();
    const finish = () => {
      moving.current = false;
      setNavigating(false);
      if (step > 0) pageRef.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    };
    if (!pageRef.current?.animate || reducedMotion()) { finish(); return; }
    motion.current = pageRef.current.animate([
      { opacity: 0, transform: `translateY(${direction.current * 18}px) scale(.96)`, offset: 0 },
      { opacity: 1, transform: `translateY(${-direction.current * 3}px) scale(1.012)`, offset: .72 },
      { opacity: 1, transform: 'translateY(0) scale(1)', offset: 1 },
    ], { duration: 420, easing: 'cubic-bezier(.22,.7,.25,1)' });
    void motion.current.finished.then(finish).catch(() => {});
    return () => { motion.current?.cancel(); };
  }, [step]);
  useEffect(() => { if (p.created && step !== 4) go(4); }, [p.created]);
  const chooseClient = (id: string) => { p.onClientIdChange(id); setDirectoryOpen(false); setSearch(''); directoryButton.current?.focus(); };
  const directoryClients = p.clients.filter(c => !['archived', 'prospect'].includes(c.status) && `${c.firstName} ${c.lastName} ${c.siteAddress || ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  const validLines = p.lines.length > 0 && p.lines.every(l => l.description.trim() && l.description.length <= 200 && Number.isInteger(Number(l.qty)) && Number(l.qty) > 0 && Number(l.qty) <= 100000 && l.unitPrice.trim() && Number.isFinite(Number(l.unitPrice)) && Number(l.unitPrice) >= 0 && Number(l.unitPrice) <= 1000000 && Math.round(Number(l.qty) * Number(l.unitPrice) * 100) <= 100000000) && p.totals.total > 0;
  const validDeposit = !p.depositEnabled || (Number.isFinite(Number(p.depositValue)) && Number(p.depositValue) > 0 && (p.depositType === 'percent' ? Number.isInteger(Number(p.depositValue)) && Number(p.depositValue) <= 100 : Math.round(Number(p.depositValue) * 100) <= p.totals.total));
  const next = () => {
    if (step === 1 && !p.clientId && !form.current?.reportValidity()) return;
    if (step === 2 && !validLines) { setValidation('Complete each item with a description, whole quantity and valid price.'); return; }
    go(step + 1);
  };
  const arrow = (label: string, action = next) => <button type="button" className={`mq-arrow ${label === 'Back' ? 'mq-back' : ''}`} aria-label={label} disabled={navigating || p.isCreating} onClick={action}><svg viewBox="0 0 32 32" width="32" height="32" fill="none" aria-hidden="true"><path d="m12 7 9 9-9 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>;
  const totals = <div className="mq-totals" data-tutorial-id="tq-totals">
    {p.gstRegistered && <><div><span>subtotal (excl. GST)</span><span>{money(p.totals.net)}</span></div><div><span>GST (15%){p.gstMode === 'inclusive' ? ' incl.' : ''}</span><span>{money(p.totals.gst)}</span></div></>}
    <div className="mq-total"><span>total{p.gstRegistered ? ' (incl. GST)' : ''}</span><strong>{money(p.totals.total)}</strong></div>
  </div>;
  return <div className="tp-screen tp-feature mq-screen" data-demo-id="trades-quote" data-quote-step={step === 4 ? 'success' : step}>
    <div className="stagger tp-hero mq-hero">
      <div className="mq-top"><button type="button" className="tp-subhead-btn" aria-label="Close quote" disabled={p.isCreating || navigating} onClick={() => p.created ? p.onExit() : p.onCancel()}>×</button>{step > 0 && step < 4 && <span>{step} / 3</span>}</div>
      <div className="mq-heading" data-tutorial-id={step !== 2 ? "tq-totals" : undefined}><div className="tp-amount" style={{ '--amount-authored': '64px', '--amount-chars': money(p.totals.total).length } as React.CSSProperties}>{money(p.totals.total)}</div><div>{p.created ? 'quote created' : selected ? `${selected.firstName} ${selected.lastName}` : p.recipient.name || 'new quote'}</div></div>
    </div>
    <div className="tp-panel mq-panel"><div className="tp-panel-body mq-body"><div ref={pageRef} className="mq-page" key={step}>
      {step === 4 ? <div className="mq-success" role="status">
        <h1 tabIndex={-1} className="mq-success-title">created</h1>
        <div className="tp-success-check tp-pulse"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
        <p>{p.created.delivered ? 'Sent to the client.' : 'Your quote is ready to share.'}</p>
        <div className="mq-success-actions"><button className="tp-cta-wire" onClick={p.onShare}>share</button><button className="tp-cta-wire" data-demo-id="trades-quote-copy" onClick={p.onCopyLink}>copy link</button></div>
        <input aria-label="Quote link" readOnly value={p.publicUrl} onFocus={e => e.currentTarget.select()} />
        {p.error && <p role="status">{p.error}</p>}
        <button className="mq-text-button" onClick={p.onDownloadPdf}>download PDF</button>
        <button className="tp-cta-wire" data-demo-id="trades-quote-done" onClick={p.onExit}>done</button>
      </div> : step === 0 ? <div className="mq-start"><h1 tabIndex={-1}>build quote</h1>{arrow('Build quote')}</div> : <form ref={form} className="mq-form" key={step} onSubmit={e => { e.preventDefault(); if (navigating || p.created) return; if (step < 3) next(); else if (validLines && validDeposit && !p.isCreating) p.onCreate(); }}>
        <div className="mq-scroll">
          <h1 tabIndex={-1}>{['', 'client details', 'line items', 'deposit & notes'][step]}</h1>
          {step === 1 && <>
            <div className={`mq-directory ${directoryOpen ? 'is-open' : ''}`} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setDirectoryOpen(false); directoryButton.current?.focus(); } }}>
              <button ref={directoryButton} type="button" className="mq-directory-trigger" aria-label="Choose client" aria-expanded={directoryOpen} aria-controls="mq-client-directory" data-demo-id="trades-quote-client" onClick={() => setDirectoryOpen(open => !open)}>
                <span>{selected ? `${selected.firstName} ${selected.lastName}` : 'choose client'}</span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <div className="mq-directory-reveal" aria-hidden={!directoryOpen} {...(!directoryOpen ? { inert: '' } as Record<string, string> : {})}>
                <div className="mq-directory-clip"><div id="mq-client-directory" role="region" aria-label="Client directory" className="mq-directory-content">
                  <input aria-label="Search clients" placeholder="search clients" value={search} onChange={e => setSearch(e.target.value)} />
                  <div className="mq-directory-list">{directoryClients.map(c => <button type="button" key={c.id} aria-pressed={c.id === p.clientId} onClick={() => chooseClient(c.id)}><span className="mq-client-avatar" aria-hidden="true">{c.firstName?.[0]}{c.lastName?.[0]}</span><span><strong>{c.firstName} {c.lastName}</strong><small>{c.siteAddress || c.email || ''}</small></span></button>)}{directoryClients.length === 0 && <p>no clients found</p>}</div>
                  <button type="button" className="mq-text-button" onClick={() => chooseClient('')}>enter details instead</button>
                </div></div>
              </div>
            </div>
            {!p.clientId && <><div className="mq-or">or enter details</div>{(['name', 'email', 'address'] as const).map(field => <label key={field}>{field}{field !== 'name' && ' · optional'}<input aria-label={field} type={field === 'email' ? 'email' : 'text'} autoComplete={field === 'address' ? 'street-address' : field} required={field === 'name'} maxLength={field === 'name' ? 160 : field === 'address' ? 200 : 254} value={p.recipient[field]} onChange={e => p.onRecipientChange({ ...p.recipient, [field]: e.target.value })} /></label>)}</>}
          </>}
          {step === 2 && <>{p.lines.map((line, i) => <div className="mq-line" key={line.id}>
            <label className="mq-description">item {i + 1}<input aria-label={`Item ${i + 1} description`} placeholder="description" maxLength={200} value={line.description} onChange={e => p.onLineChange(line.id, 'description', e.target.value)} /></label>
            <label>quantity<input aria-label={`Item ${i + 1} quantity`} inputMode="numeric" value={line.qty} onChange={e => p.onLineChange(line.id, 'qty', e.target.value.replace(/\D/g, ''))} /></label>
            <label>unit price<input aria-label={`Item ${i + 1} unit price`} inputMode="decimal" placeholder="$0.00" value={line.unitPrice} onChange={e => p.onLineChange(line.id, 'unitPrice', e.target.value.replace(/[^\d.]/g, ''))} /></label>
            <button type="button" className="mq-remove" aria-label={`Remove item ${i + 1}`} disabled={p.lines.length === 1} onClick={() => p.onRemoveLine(line.id)}>×</button>
          </div>)}<button type="button" className="mq-text-button" onClick={p.onAddLine}>+ add line</button></>}
          {step === 3 && <>
            <button type="button" className="mq-toggle" aria-pressed={p.depositEnabled} data-tutorial-id="tq-deposit" onClick={() => p.onDepositEnabledChange(!p.depositEnabled)}><span>require deposit</span><span className="mq-switch" data-on={p.depositEnabled}><span /></span></button>
            {p.depositEnabled && <div className="mq-deposit"><div className="mq-presets">{['10', '20', 'custom'].map(value => <button key={value} type="button" aria-pressed={value === 'custom' ? custom : !custom && p.depositType === 'percent' && p.depositValue === value} onClick={() => { setCustom(value === 'custom'); if (value !== 'custom') { p.onDepositTypeChange('percent'); p.onDepositValueChange(value); } }}>{value === 'custom' ? value : `${value}%`}</button>)}</div>{custom && <div className="mq-custom"><div className="mq-deposit-kind" role="group" aria-label="Deposit type"><button type="button" aria-pressed={p.depositType === 'percent'} onClick={() => p.onDepositTypeChange('percent')}>%</button><button type="button" aria-pressed={p.depositType === 'fixed'} onClick={() => p.onDepositTypeChange('fixed')}>$</button></div><label>value<input aria-label="Deposit value" inputMode="decimal" value={p.depositValue} onChange={e => p.onDepositValueChange(e.target.value.replace(/[^\d.]/g, ''))} /></label></div>}<p>deposit on acceptance <strong>{money(p.totals.deposit)}</strong></p></div>}
            <label className="mq-notes">notes · optional<textarea aria-label="Quote notes" placeholder="quote notes" maxLength={1000} value={p.notes} onChange={e => p.onNotesChange(e.target.value)} /></label>
          </>}
        </div>
        <div className="mq-footer">
          {step === 2 && totals}
          {(validation || p.error) && <p role="alert">{validation || p.error}</p>}
          <div className="mq-navigation">{arrow('Back', () => go(step - 1))}
          {step === 3 ? <><button type="button" className="tp-cta-wire" data-tutorial-id="tq-create" disabled={p.isCreating || navigating} onClick={() => { if (!validDeposit) setValidation('Enter a deposit from 1–100%, or an amount no greater than the total.'); else if (!validLines) setValidation('Go back and complete the line items.'); else p.onCreate(); }}>{p.isCreating ? 'creating…' : 'create quote'}</button></> : <>{arrow('Next')}</>}
          </div>{step === 1 && <button type="button" className="mq-text-button" disabled={navigating} onClick={() => { p.onSkipClient(); go(2); }}>skip</button>}
        </div>
      </form>}
    </div></div></div>
  </div>;
}
