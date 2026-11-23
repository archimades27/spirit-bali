import { useEffect, useRef, type ReactNode } from 'react';
import { feedback } from '../services/feedback';

interface TimerRingProps {
  readonly secondsLeft: number | null;
  readonly totalSeconds: number;
  readonly children: ReactNode;
}

/**
 * Wraps the main CTA with a countdown border. Turns red and pulses at <= 10s,
 * and ticks (sound + haptic) every second at <= 5s.
 */
export function TimerRing({ secondsLeft, totalSeconds, children }: TimerRingProps) {
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    if (secondsLeft === null || secondsLeft > 5 || secondsLeft <= 0) return;
    if (lastTick.current === secondsLeft) return;
    lastTick.current = secondsLeft;
    feedback.tick();
  }, [secondsLeft]);

  if (secondsLeft === null) {
    return <div className="timer-ring is-idle">{children}</div>;
  }

  const pct = Math.max(0, Math.min(100, (secondsLeft / Math.max(1, totalSeconds)) * 100));
  const urgency = secondsLeft <= 5 ? 'is-critical' : secondsLeft <= 10 ? 'is-urgent' : '';

  return (
    <div
      className={`timer-ring ${urgency}`}
      style={{ ['--pct' as string]: `${pct}%` }}
    >
      {children}
      <span className="timer-ring-label mono" aria-label={`Sisa waktu ${secondsLeft} detik`}>
        {secondsLeft}d
      </span>
    </div>
  );
}
