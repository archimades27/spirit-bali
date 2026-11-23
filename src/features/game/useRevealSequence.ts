import { useCallback, useEffect, useRef, useState } from 'react';
import { feedback } from '../../services/feedback';
import { prefersReducedMotion } from '../../services/motion';

const INTRO_MS = 450;
const PER_SEAT_MS = 380;
const DEALER_SUSPENSE_MS = 900;
const RESULT_DELAY_MS = 450;

export interface RevealSequence {
  /** True when this seat's cards should be shown face up. */
  readonly isSeatRevealed: (userId: string) => boolean;
  readonly dealerRevealed: boolean;
  /** True once results (deltas, celebration, balances) may be shown. */
  readonly done: boolean;
  /** True while the sequence is running (for the dim overlay / skip button). */
  readonly running: boolean;
  readonly skip: () => void;
}

/**
 * Client-side staged reveal. The engine settles a round atomically; this hook replays
 * the reveal one seat at a time (clockwise), dealer last, before results appear.
 */
export function useRevealSequence(
  roundId: string | null,
  settled: boolean,
  seatOrderIds: readonly string[]
): RevealSequence {
  const [state, setState] = useState<{ roundId: string | null; step: number }>({
    roundId: null,
    step: 0,
  });
  const seatsRef = useRef(seatOrderIds);
  seatsRef.current = seatOrderIds;

  const total = seatOrderIds.length;
  // steps: 0 = intro, 1..total = seats revealed, total+1 = dealer revealed, total+2 = done
  const doneStep = total + 2;

  const active = settled && roundId !== null;
  const isCurrent = state.roundId === roundId;
  const step = !active ? doneStep : isCurrent ? state.step : 0;

  useEffect(() => {
    if (!active) return;
    if (state.roundId !== roundId) {
      setState({ roundId, step: prefersReducedMotion() ? doneStep : 0 });
      return;
    }
    if (state.step >= doneStep) return;

    const delay =
      state.step === 0
        ? INTRO_MS
        : state.step < total
          ? PER_SEAT_MS
          : state.step === total
            ? DEALER_SUSPENSE_MS
            : RESULT_DELAY_MS;

    const timer = window.setTimeout(() => {
      const next = state.step + 1;
      if (next <= total) {
        feedback.flip();
      } else if (next === total + 1) {
        feedback.dealerFlip();
      }
      setState({ roundId, step: next });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [active, roundId, state, total, doneStep]);

  const isSeatRevealed = useCallback(
    (userId: string) => {
      const idx = seatsRef.current.indexOf(userId);
      if (idx === -1) return step >= total + 1;
      return step >= idx + 1;
    },
    [step, total]
  );

  const skip = useCallback(() => {
    if (roundId) setState({ roundId, step: doneStep });
  }, [roundId, doneStep]);

  return {
    isSeatRevealed,
    dealerRevealed: step >= total + 1,
    done: step >= doneStep,
    running: active && step < doneStep,
    skip,
  };
}
