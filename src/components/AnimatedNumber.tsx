import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../services/motion';

interface AnimatedNumberProps {
  readonly value: number;
  readonly format: (n: number) => string;
  readonly durationMs?: number;
  readonly className?: string;
  /** Flash mint/red with an arrow when the value changes. */
  readonly showTrend?: boolean;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function AnimatedNumber({
  value,
  format,
  durationMs = 1000,
  className,
  showTrend = false,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const [trend, setTrend] = useState<'up' | 'down' | null>(null);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    fromRef.current = value;

    if (prefersReducedMotion()) {
      setDisplay(value);
      return;
    }

    setTrend(value > from ? 'up' : 'down');
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setDisplay(Math.round(from + (value - from) * easeOutCubic(t)));
      if (t < 1) {
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);
    const clear = window.setTimeout(() => setTrend(null), durationMs + 900);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(clear);
      setDisplay(value);
    };
  }, [value, durationMs]);

  return (
    <span className={`${className ?? ''} ${showTrend && trend ? `num-trend-${trend}` : ''}`}>
      {format(display)}
      {showTrend && trend && (
        <span className="num-trend-arrow" aria-hidden="true">
          {trend === 'up' ? '▲' : '▼'}
        </span>
      )}
    </span>
  );
}
