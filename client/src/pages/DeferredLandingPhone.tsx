import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { SCREEN_H, SCREEN_W } from './landing-phone/tokens';
import type { LandingPhoneMountProps } from './landing-phone/LandingPhoneMount';

const LazyLandingPhoneMount = lazy(() =>
  import('./landing-phone/LandingPhoneMount').then(({ LandingPhoneMount }) => ({
    default: LandingPhoneMount,
  })),
);

export const INDUSTRY_PHONE = {
  property: { scene: 'rent-weekly', steps: 18 },
  trades: { scene: 'quote-deposit', steps: 13 },
  retail: { scene: 'retail-sale', steps: 16 },
} as const;

export type IndustryKey = keyof typeof INDUSTRY_PHONE;

export const isIndustryKey = (value: unknown): value is IndustryKey =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(INDUSTRY_PHONE, value);

function StaticPhoneShell() {
  return (
    <div
      data-demo-scene="shell"
      role="img"
      aria-label="taptpay app preview"
      style={{
        width: SCREEN_W,
        height: SCREEN_H,
        background: 'linear-gradient(158deg,#0a1656 0%,#040D6D 46%,#0b1a6e 100%)',
      }}
    />
  );
}

class DeferredPhoneBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Keeps the complete phone dependency graph behind an intersection gate.
 * Save-Data visitors load only when the shell is actually visible; everyone
 * else gets a modest prefetch margin so the real screen is ready on arrival.
 */
export function DeferredLandingPhone(props: LandingPhoneMountProps) {
  const host = useRef<HTMLDivElement>(null);
  const [load, setLoad] = useState(false);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const element = host.current;
    if (!element || load) return;
    if (typeof IntersectionObserver === 'undefined') {
      setLoad(true);
      return;
    }

    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const saveData = Boolean(connection?.saveData);
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setLoad(true);
        observer.disconnect();
      },
      { rootMargin: saveData ? '0px' : '600px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [load]);

  useEffect(() => {
    const element = host.current;
    const aperture = element?.parentElement;
    if (!element || !aperture || typeof ResizeObserver === 'undefined') return;

    const fit = () => {
      const { width, height } = aperture.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      setScale(Math.min(width / SCREEN_W, height / SCREEN_H));
    };
    const observer = new ResizeObserver(fit);
    observer.observe(aperture);
    fit();
    return () => observer.disconnect();
  }, []);

  const hostStyle: CSSProperties = {
    width: SCREEN_W,
    height: SCREEN_H,
    position: 'relative',
    transform: 'scale(' + scale + ')',
    ...props.style,
    transformOrigin: 'top left',
  };
  const shell = <StaticPhoneShell />;

  return (
    <div
      ref={host}
      className={props.className}
      data-phone-boundary="deferred"
      style={hostStyle}
    >
      {load ? (
        <DeferredPhoneBoundary fallback={shell}>
          <Suspense fallback={shell}>
            <LazyLandingPhoneMount {...props} className={undefined} style={undefined} />
          </Suspense>
        </DeferredPhoneBoundary>
      ) : (
        shell
      )}
    </div>
  );
}

export default DeferredLandingPhone;
