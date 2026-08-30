import * as React from 'react';
import { useMotionValue, useSpring, type SpringOptions } from 'motion/react';

import {
  useIsInView,
  type UseIsInViewOptions,
} from '@/hooks/use-is-in-view';

type CountingNumberProps = Omit<React.ComponentProps<'span'>, 'children'> & {
  number: number;
  fromNumber?: number;
  padStart?: boolean;
  decimalSeparator?: string;
  decimalPlaces?: number;
  transition?: SpringOptions;
  delay?: number;
  initiallyStable?: boolean;
  /* Owns the whole display string (e.g. a currency symbol + thousands
     separator) instead of this component's own decimal/padStart handling.
     Called on every spring tick, so it must be cheap and pure. */
  format?: (value: number) => string;
} & UseIsInViewOptions;

function CountingNumber({
  ref,
  number,
  fromNumber = 0,
  padStart = false,
  inView = false,
  inViewMargin = '0px',
  inViewOnce = true,
  decimalSeparator = '.',
  transition = { stiffness: 90, damping: 50 },
  decimalPlaces = 0,
  delay = 0,
  initiallyStable = false,
  format,
  ...props
}: CountingNumberProps) {
  const { ref: localRef, isInView } = useIsInView(
    ref as React.Ref<HTMLElement>,
    {
      inView,
      inViewOnce,
      inViewMargin,
    },
  );

  const numberStr = number.toString();
  const decimals =
    typeof decimalPlaces === 'number'
      ? decimalPlaces
      : numberStr.includes('.')
        ? (numberStr.split('.')[1]?.length ?? 0)
        : 0;

  const finalIntLength = Math.floor(Math.abs(number)).toString().length;

  const formatValue = React.useCallback(
    (val: number) => {
      if (format) return format(val);
      let out = decimals > 0 ? val.toFixed(decimals) : Math.round(val).toString();
      if (decimals > 0) out = out.replace('.', decimalSeparator);
      if (padStart) {
        const [intPart, fracPart] = out.split(decimalSeparator);
        const paddedInt = (intPart ?? '').padStart(finalIntLength, '0');
        out = fracPart ? `${paddedInt}${decimalSeparator}${fracPart}` : paddedInt;
      }
      return out;
    },
    [format, decimals, decimalSeparator, padStart, finalIntLength],
  );

  const motionVal = useMotionValue(initiallyStable ? number : fromNumber);
  const springVal = useSpring(motionVal, transition);

  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (isInView) motionVal.set(number);
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [isInView, number, motionVal, delay]);

  React.useEffect(() => {
    const unsubscribe = springVal.on('change', (latest) => {
      if (localRef.current) {
        localRef.current.textContent = formatValue(latest);
      }
    });
    return () => unsubscribe();
  }, [springVal, formatValue, localRef]);

  /* Shown until the first spring tick lands. `fromNumber` (not a hardcoded
     zero) so a hybrid reveal->count handoff can seed a real starting value
     with no visible jump between the two primitives. */
  const initialText = formatValue(initiallyStable ? number : fromNumber);

  return (
    <span ref={localRef} data-slot="counting-number" {...props}>
      {initialText}
    </span>
  );
}

export { CountingNumber, type CountingNumberProps };
