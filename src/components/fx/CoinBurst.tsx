import { useMemo } from 'react';
import { prefersReducedMotion } from '../../services/motion';

interface CoinBurstProps {
  readonly seed: string;
  readonly count?: number;
  /** 'burst' = fountain from the parent's centre; 'rain' = jackpot shower from the top. */
  readonly mode?: 'burst' | 'rain';
}

/** Spinning gold coins. Plays once on mount; parent must be position: relative. */
export function CoinBurst({ seed, count = 14, mode = 'burst' }: CoinBurstProps) {
  const coins = useMemo(() => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    const rand = () => {
      h = (h * 1664525 + 1013904223) >>> 0;
      return h / 4294967296;
    };
    return Array.from({ length: count }, (_, i) => {
      const angle = (-90 + (rand() - 0.5) * 150) * (Math.PI / 180);
      const power = 70 + rand() * 110;
      return {
        id: i,
        dx: `${Math.cos(angle) * power}px`,
        dy: `${Math.sin(angle) * power}px`,
        left: `${4 + rand() * 92}%`,
        delay: `${Math.round(i * (mode === 'rain' ? 70 : 28) + rand() * 80)}ms`,
        dur: `${(mode === 'rain' ? 1500 : 1100) + Math.round(rand() * 500)}ms`,
        size: `${14 + Math.round(rand() * 10)}px`,
        spin: `${0.35 + rand() * 0.4}s`,
      };
    });
  }, [seed, count, mode]);

  if (prefersReducedMotion()) return null;

  return (
    <span className={`fx-coins fx-coins-${mode}`} aria-hidden="true">
      {coins.map((c) => (
        <span
          key={c.id}
          className="fx-coin"
          style={{
            left: mode === 'rain' ? c.left : undefined,
            width: c.size,
            height: c.size,
            animationDelay: c.delay,
            animationDuration: c.dur,
            ['--dx' as string]: c.dx,
            ['--dy' as string]: c.dy,
          }}
        >
          <span className="fx-coin-face" style={{ animationDuration: c.spin }} />
        </span>
      ))}
    </span>
  );
}
