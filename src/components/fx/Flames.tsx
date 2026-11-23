import { useMemo } from 'react';
import { prefersReducedMotion } from '../../services/motion';

interface FlamesProps {
  /** low = a few small tongues, mid = steady fire, high = roaring blaze with embers. */
  readonly intensity?: 'low' | 'mid' | 'high';
  readonly className?: string;
}

const COUNTS = { low: 5, mid: 8, high: 12 } as const;

/**
 * CSS fire: flame tongues rising from the bottom edge of the (position: relative) parent.
 * Purely decorative, pointer-events none.
 */
export function Flames({ intensity = 'mid', className = '' }: FlamesProps) {
  const tongues = useMemo(() => {
    const n = COUNTS[intensity];
    return Array.from({ length: n }, (_, i) => ({
      id: i,
      left: `${(i + 0.5) * (100 / n) + ((i * 37) % 7) - 3}%`,
      height: `${55 + ((i * 53) % 45)}%`,
      delay: `${-((i * 173) % 900)}ms`,
      dur: `${620 + ((i * 97) % 380)}ms`,
    }));
  }, [intensity]);

  const embers = useMemo(
    () =>
      intensity === 'high'
        ? Array.from({ length: 8 }, (_, i) => ({
            id: i,
            left: `${8 + ((i * 41) % 84)}%`,
            delay: `${-((i * 211) % 1400)}ms`,
            drift: `${(i % 2 ? 1 : -1) * (6 + (i % 4) * 5)}px`,
          }))
        : [],
    [intensity]
  );

  if (prefersReducedMotion()) return null;

  return (
    <span className={`fx-flames fx-flames-${intensity} ${className}`} aria-hidden="true">
      {tongues.map((t) => (
        <span
          key={t.id}
          className="fx-flame"
          style={{
            left: t.left,
            height: t.height,
            animationDelay: t.delay,
            animationDuration: t.dur,
          }}
        />
      ))}
      {embers.map((e) => (
        <span
          key={`e-${e.id}`}
          className="fx-ember"
          style={{ left: e.left, animationDelay: e.delay, ['--drift' as string]: e.drift }}
        />
      ))}
    </span>
  );
}
