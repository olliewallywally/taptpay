import { useEffect, useRef, useState, type CSSProperties } from "react";
import { RollingText } from "@/components/animate-ui/primitives/texts/rolling";
import { CountingNumber } from "@/components/animate-ui/primitives/texts/counting-number";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

type RollingHeroNumberProps = {
  value: number;
  format: (value: number) => string;
  style?: CSSProperties;
  className?: string;
};

/* RollingText has no concept of a changing value — it only knows how to
   flip a string in once. So a mount flips the number in from nothing, then
   this hands off permanently to CountingNumber, which springs from the last
   value to whatever the new one is on every change after that (up or down,
   its own effect reacts to the `number` prop). The handoff needs no timer:
   CountingNumber's `fromNumber` seeds it at exactly the value RollingText
   just revealed, so the swap between the two primitives is invisible. */
export function RollingHeroNumber({ value, format, style, className }: RollingHeroNumberProps) {
  const [phase, setPhase] = useState<"reveal" | "counting">("reveal");
  const revealedValue = useRef(value);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (phase === "reveal" && value !== revealedValue.current) {
      setPhase("counting");
    }
  }, [phase, value]);

  if (reducedMotion) {
    return <span className={className} style={style}>{format(value)}</span>;
  }

  if (phase === "reveal") {
    return (
      <RollingText
        text={format(revealedValue.current)}
        className={className}
        style={style}
      />
    );
  }

  return (
    <CountingNumber
      number={value}
      fromNumber={revealedValue.current}
      format={format}
      className={className}
      style={style}
    />
  );
}
