import { useEffect, useRef, useState } from "react";

/* ═══ Wireframe liquid button ═══
   The confirm-button template: rests as a wireframe pill (outline + accent
   text), and on press fills solid from the bottom with a liquid rise — a
   sloshing wave rides the surface while an async action is pending, then the
   fill tops out. If the button is still mounted afterwards (e.g. the action
   errored instead of navigating away) it drains back to the wireframe state.

   Use this for every confirm-type action. Colors are props so it works on any
   vertical's palette — defaults are the property navy/sky pair.

     <WireframeLiquidButton onClick={onSend} busy={sending} style={{ minWidth: 220 }}>
       {sending ? 'sending…' : 'send rent request'}
     </WireframeLiquidButton>
*/
export function WireframeLiquidButton({
  children,
  onClick,
  disabled = false,
  busy = false,           // true while the confirmed action is pending — keeps the liquid sloshing
  accent = '#58ABFF',     // wireframe border + resting text + liquid color
  filledTextColor = '#040D6D', // label color once the liquid is behind it
  className,
  style,
  type = 'button',
  ...rest
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  accent?: string;
  filledTextColor?: string;
  className?: string;
  style?: React.CSSProperties;
  type?: 'button' | 'submit';
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type' | 'style' | 'className'>) {
  const [fired, setFired] = useState(false);
  const wasBusy = useRef(false);

  if (busy) wasBusy.current = true;

  // Drain back to wireframe when nothing is pending anymore: quickly after a
  // finished async action, or after a held beat for a synchronous confirm.
  useEffect(() => {
    if (!fired || busy) return;
    const t = setTimeout(() => { setFired(false); wasBusy.current = false; }, wasBusy.current ? 350 : 900);
    return () => clearTimeout(t);
  }, [fired, busy]);

  const active = fired || busy;

  const handleClick = () => {
    if (disabled || busy) return;
    setFired(true);
    onClick?.();
  };

  return (
    <>
      <style>{WLB_CSS}</style>
      <button
        type={type}
        disabled={disabled}
        onClick={handleClick}
        className={`wlb${active ? ' wlb-on' : ''}${busy ? ' wlb-busy' : ''}${className ? ' ' + className : ''}`}
        style={{ '--wlb-accent': accent, '--wlb-fill-text': filledTextColor, ...style } as React.CSSProperties}
        {...rest}
      >
        <span className="wlb-liquid" aria-hidden="true">
          <svg className="wlb-wave" viewBox="0 0 240 12" preserveAspectRatio="none">
            <path d="M0 7 Q 15 0 30 7 T 60 7 T 90 7 T 120 7 T 150 7 T 180 7 T 210 7 T 240 7 V 12 H 0 Z" fill="var(--wlb-accent)" />
          </svg>
        </span>
        <span className="wlb-label">{children}</span>
      </button>
    </>
  );
}

const WLB_CSS = `
.wlb { position: relative; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; padding: 14px 36px; border-radius: 999px; background: transparent; border: 1.5px solid var(--wlb-accent); color: var(--wlb-accent); font-family: 'Outfit', system-ui; font-weight: 600; font-size: 15px; white-space: nowrap; cursor: pointer; box-sizing: border-box; transition: color 0.28s ease 0.12s, transform 120ms, opacity 120ms; -webkit-tap-highlight-color: transparent; }
.wlb:active { transform: scale(0.96); }
.wlb:disabled { opacity: 0.65; cursor: default; }
.wlb-on { color: var(--wlb-fill-text); }
/* The liquid — rises from the bottom edge; overshoots the border so no seam shows. */
.wlb-liquid { position: absolute; left: -2px; right: -2px; bottom: -2px; height: 0; background: var(--wlb-accent); transition: height 0.6s cubic-bezier(0.22,1,0.36,1); pointer-events: none; }
.wlb-on .wlb-liquid { height: calc(100% + 4px); }
/* While pending, hold the level below the rim so the wave keeps sloshing. */
.wlb-busy .wlb-liquid { height: 80%; }
/* Wave surface — twice the button width, slid sideways forever for the liquid feel.
   Once the fill tops out it rises above the pill and the overflow clips it away. */
.wlb-wave { position: absolute; bottom: 100%; left: 0; width: 200%; height: 9px; display: block; margin-bottom: -1px; animation: wlbSlosh 1.5s linear infinite; }
.wlb-label { position: relative; z-index: 1; }
@keyframes wlbSlosh { from { transform: translateX(0); } to { transform: translateX(-50%); } }
`;

export default WireframeLiquidButton;
