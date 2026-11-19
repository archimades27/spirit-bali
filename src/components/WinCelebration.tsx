import { formatSignedRupiah } from '../services/format';

interface WinCelebrationProps {
  readonly roundKey: string;
  readonly title: string;
  readonly delta: number;
  readonly multiplier?: 1 | 2 | 3;
}

const CONFETTI_PIECES = Array.from({ length: 22 }, (_, i) => ({
  id: i,
  left: `${6 + ((i * 19) % 88)}%`,
  delay: `${(i % 6) * 65}ms`,
  duration: `${1350 + (i % 5) * 180}ms`,
  drift: `${(i % 2 === 0 ? 1 : -1) * (14 + (i % 4) * 10)}px`,
  color: i % 3 === 0 ? '#f7da47' : i % 3 === 1 ? '#65e0c2' : '#ff6b7a',
  size: i % 4 === 0 ? 9 : 7,
}));

export function WinCelebration({
  roundKey,
  title,
  delta,
  multiplier,
}: WinCelebrationProps) {
  return (
    <div key={roundKey} className="win-celebration-overlay" aria-hidden="true">
      <div className="confetti-layer">
        {CONFETTI_PIECES.map((p) => (
          <span
            key={p.id}
            className="confetti-piece"
            style={{
              left: p.left,
              width: `${p.size}px`,
              height: `${Math.round(p.size * 1.4)}px`,
              backgroundColor: p.color,
              animationDelay: p.delay,
              animationDuration: p.duration,
              ['--drift' as string]: p.drift,
            }}
          />
        ))}
      </div>

      <div className={`win-toast ${multiplier === 3 ? 'is-triple' : ''}`}>
        <span className="win-toast-kicker">{title}</span>
        <strong className="win-toast-amount">{formatSignedRupiah(delta)}</strong>
      </div>
    </div>
  );
}
