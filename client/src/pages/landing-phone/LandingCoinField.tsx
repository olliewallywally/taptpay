import { useEffect, useMemo, useState, type CSSProperties } from 'react';

type CoinPosition = {
  x: number;
  y: number;
  size: number;
  rotation: number;
  depth: 'near' | 'mid' | 'far';
};

const POSITIONS: CoinPosition[] = [
  { x: 73, y: 8, size: 88, rotation: -18, depth: 'near' },
  { x: 86, y: 18, size: 54, rotation: 24, depth: 'mid' },
  { x: 66, y: 31, size: 42, rotation: -34, depth: 'far' },
  { x: 90, y: 42, size: 96, rotation: 19, depth: 'near' },
  { x: 74, y: 56, size: 62, rotation: -11, depth: 'mid' },
  { x: 57, y: 74, size: 48, rotation: 30, depth: 'far' },
  { x: 82, y: 78, size: 76, rotation: -25, depth: 'near' },
  { x: 15, y: 82, size: 40, rotation: 16, depth: 'far' },
  { x: 37, y: 91, size: 58, rotation: -22, depth: 'mid' },
  { x: 68, y: 93, size: 44, rotation: 37, depth: 'far' },
  { x: 94, y: 91, size: 60, rotation: -10, depth: 'mid' },
  { x: 9, y: 54, size: 36, rotation: 28, depth: 'far' },
  { x: 61, y: 10, size: 52, rotation: -31, depth: 'mid' },
  { x: 96, y: 6, size: 35, rotation: 18, depth: 'far' },
  { x: 49, y: 84, size: 76, rotation: -14, depth: 'near' },
  { x: 24, y: 67, size: 43, rotation: 34, depth: 'far' },
  { x: 79, y: 34, size: 50, rotation: -19, depth: 'mid' },
  { x: 55, y: 58, size: 38, rotation: 20, depth: 'far' },
  { x: 4, y: 23, size: 58, rotation: -27, depth: 'mid' },
  { x: 32, y: 74, size: 65, rotation: 12, depth: 'near' },
  { x: 72, y: 68, size: 34, rotation: -33, depth: 'far' },
  { x: 97, y: 63, size: 78, rotation: 25, depth: 'near' },
  { x: 45, y: 96, size: 36, rotation: -16, depth: 'far' },
  { x: 16, y: 96, size: 50, rotation: 32, depth: 'mid' },
  { x: 88, y: 72, size: 40, rotation: -21, depth: 'far' },
  { x: 63, y: 43, size: 69, rotation: 14, depth: 'near' },
];

function useMobileCoinLayout() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );

  useEffect(() => {
    const update = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return mobile;
}

function Coin({ position, index, reducedMotion }: {
  position: CoinPosition;
  index: number;
  reducedMotion: boolean;
}) {
  const isWordmark = index % 2 === 0;
  const duration = 13 + (index % 5) * 2;
  const delay = -(index % 7) * 1.4;
  const depthOpacity = position.depth === 'near' ? 0.96 : position.depth === 'mid' ? 0.72 : 0.48;
  const style: CSSProperties = {
    left: position.x + '%',
    top: position.y + '%',
    width: position.size,
    height: position.size,
    opacity: depthOpacity,
    filter: position.depth === 'far' ? 'blur(.35px)' : undefined,
    transform: 'translate(-50%,-50%) rotate(' + position.rotation + 'deg)',
    transformOrigin: '50% 50%',
    animation: reducedMotion ? 'none' : 'tpCoinDrift ' + duration + 's ease-in-out ' + delay + 's infinite alternate',
  };

  return (
    <div className={'tp-coin tp-coin-' + position.depth} data-landing-coin style={style}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <radialGradient id={'tp-coin-face-' + index} cx="33%" cy="27%" r="74%">
            <stop offset="0" stopColor="#355bd0" />
            <stop offset=".55" stopColor="#162e97" />
            <stop offset="1" stopColor="#08155f" />
          </radialGradient>
          <linearGradient id={'tp-coin-edge-' + index} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#7ea8ff" />
            <stop offset=".34" stopColor="#294ab7" />
            <stop offset="1" stopColor="#0b1c75" />
          </linearGradient>
        </defs>
        <ellipse cx="50" cy="56" rx="44" ry="42" fill={'url(#tp-coin-edge-' + index + ')'} opacity=".9" />
        <circle cx="50" cy="48" r="43" fill={'url(#tp-coin-face-' + index + ')'} stroke="rgba(184,210,255,.72)" strokeWidth="2.4" />
        <circle cx="50" cy="48" r="36" fill="none" stroke="rgba(178,205,255,.3)" strokeWidth="1.2" />
        <circle cx="41" cy="37" r="13" fill="rgba(255,255,255,.14)" />
        {isWordmark ? (
          <text x="50" y="52" textAnchor="middle" fill="#b9d0ff" fontFamily="Georgia,serif" fontSize="14" fontWeight="700">taptpay.</text>
        ) : (
          <text x="50" y="63" textAnchor="middle" fill="#b9d0ff" fontFamily="Georgia,serif" fontSize="39" fontWeight="700">t.</text>
        )}
      </svg>
    </div>
  );
}

export function LandingCoinField({ density = 1.4, reducedMotion = false }: {
  density?: number;
  reducedMotion?: boolean;
}) {
  const mobile = useMobileCoinLayout();
  const coins = useMemo(() => {
    const base = mobile ? 7 : 13;
    const count = Math.round(base * Math.min(2, Math.max(0.4, density)));
    return POSITIONS.slice(0, count);
  }, [density, mobile]);

  return (
    <div id="tp-coins" className="tp-coins" aria-hidden="true">
      {coins.map((position, index) => (
        <Coin key={position.x + '-' + position.y} position={position} index={index} reducedMotion={reducedMotion} />
      ))}
    </div>
  );
}

export default LandingCoinField;
