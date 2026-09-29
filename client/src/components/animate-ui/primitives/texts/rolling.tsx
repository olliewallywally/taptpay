import * as React from 'react';
import { motion, type Transition } from 'motion/react';

import {
  useIsInView,
  type UseIsInViewOptions,
} from '@/hooks/use-is-in-view';

const formatCharacter = (char: string) => (char === ' ' ? ' ' : char);

type RollingTextProps = Omit<React.ComponentProps<'span'>, 'children'> & {
  text: string;
  transition?: Transition;
  delay?: number;
} & UseIsInViewOptions;

function RollingText({
  ref,
  text,
  inView = false,
  inViewMargin = '0px',
  inViewOnce = true,
  transition = { duration: 0.5, delay: 0.1, ease: 'easeOut' },
  delay = 0,
  ...props
}: RollingTextProps) {
  const { ref: localRef, isInView } = useIsInView(
    ref as React.Ref<HTMLElement>,
    {
      inView,
      inViewOnce,
      inViewMargin,
    },
  );

  const parts = React.useMemo(() => text.split(/(\s+)/), [text]);
  const stepDelay = transition?.delay ?? 0;

  let charIdx = 0;

  return (
    <span ref={localRef} data-slot="rolling-text" {...props}>
      {parts.map((part, wi) => {
        if (/^\s+$/.test(part)) {
          return <span key={`space-${wi}`}>{part}</span>;
        }

        const chars = Array.from(part);
        return (
          <span
            key={`word-${wi}`}
            style={{ display: 'inline-block', whiteSpace: 'nowrap' }}
          >
            {chars.map((char, ci) => {
              const thisIdx = charIdx++;
              const charDelay = delay / 1000 + thisIdx * stepDelay;
              return (
                <span
                  key={`c-${wi}-${ci}`}
                  style={{ display: 'inline-block', perspective: 300 }}
                  aria-hidden="true"
                >
                  {/* A single flap hinged at the bottom, folded flat (rotateX 90 —
                      edge-on to the viewer, so genuinely hidden, not just faded)
                      and rolling up into place. The upstream version paired this
                      with a second flap that started already facing the viewer,
                      so the character was visible before its own reveal ever
                      played — this only ever renders the one flap. */}
                  <motion.span
                    style={{
                      display: 'inline-block',
                      transformOrigin: '50% 100%',
                      backfaceVisibility: 'hidden',
                    }}
                    initial={{ rotateX: 90 }}
                    animate={isInView ? { rotateX: 0 } : undefined}
                    transition={{
                      ...transition,
                      delay: charDelay,
                    }}
                  >
                    {formatCharacter(char)}
                  </motion.span>
                </span>
              );
            })}
          </span>
        );
      })}

      <span className="sr-only">{text}</span>
    </span>
  );
}

export { RollingText, type RollingTextProps };
