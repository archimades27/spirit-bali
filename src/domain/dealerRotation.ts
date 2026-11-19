import { RULES_V1_0 } from './rules';
import type { GameRules, RoomMember } from './types';

export interface RotationResult {
  readonly nextDealerId: string | null;
  readonly nextDealerRoundsCompleted: number;
  readonly rotated: boolean;
  readonly shouldFinish: boolean;
}

/**
 * Returns active/eligible non-dealer player IDs ordered clockwise starting right after dealer.
 */
export function computeSettlementOrder(
  members: readonly RoomMember[],
  dealerId: string,
  betStep: number = RULES_V1_0.betStep
): readonly string[] {
  const sorted = [...members].sort((a, b) => a.seat - b.seat);
  const dealer = sorted.find((m) => m.userId === dealerId);
  if (!dealer) return [];

  const eligible = sorted.filter(
    (m) =>
      m.userId !== dealerId &&
      m.status !== 'LEFT' &&
      !m.pendingLeave &&
      m.balance >= betStep
  );

  const afterDealer = eligible.filter((m) => m.seat > dealer.seat);
  const beforeDealer = eligible.filter((m) => m.seat < dealer.seat);

  return Object.freeze([...afterDealer, ...beforeDealer].map((m) => m.userId));
}

/**
 * Computes next dealer & completed round count after a round finishes or cancels.
 * Rules v1.0:
 * - Rotate after exactly `dealerRotationRounds` (3) completed rounds; reset count to 0.
 * - Pure 9 NEVER triggers rotation (T32).
 * - Cancelled round does NOT increment completed count (T36).
 * - Assumption A04: if fewer than 2 eligible participants (balance >= betStep) remain, session finishes.
 *   If current dealer becomes ineligible (balance < betStep or left), rotate to next eligible seat clockwise.
 */
export function computeNextDealer(params: {
  readonly members: readonly RoomMember[];
  readonly currentDealerId: string;
  readonly dealerRoundsCompleted: number;
  readonly roundCancelled: boolean;
  readonly rules?: GameRules;
}): RotationResult {
  const rules = params.rules ?? RULES_V1_0;
  const sorted = [...params.members].sort((a, b) => a.seat - b.seat);
  const eligible = sorted.filter(
    (m) => m.status !== 'LEFT' && !m.pendingLeave && m.balance >= rules.betStep
  );

  if (eligible.length < 2) {
    return Object.freeze({
      nextDealerId: null,
      nextDealerRoundsCompleted: 0,
      rotated: false,
      shouldFinish: true,
    });
  }

  const currentDealerMember = sorted.find((m) => m.userId === params.currentDealerId);
  const currentDealerEligible = eligible.some((m) => m.userId === params.currentDealerId);

  if (params.roundCancelled) {
    if (currentDealerEligible) {
      return Object.freeze({
        nextDealerId: params.currentDealerId,
        nextDealerRoundsCompleted: params.dealerRoundsCompleted,
        rotated: false,
        shouldFinish: false,
      });
    }
    const nextSeat = findNextEligibleClockwise(eligible, currentDealerMember?.seat ?? -1);
    return Object.freeze({
      nextDealerId: nextSeat.userId,
      nextDealerRoundsCompleted: 0,
      rotated: true,
      shouldFinish: false,
    });
  }

  const completed = params.dealerRoundsCompleted + 1;
  const mustRotateByCount = completed >= rules.dealerRotationRounds;

  if (!mustRotateByCount && currentDealerEligible) {
    return Object.freeze({
      nextDealerId: params.currentDealerId,
      nextDealerRoundsCompleted: completed,
      rotated: false,
      shouldFinish: false,
    });
  }

  const nextSeat = findNextEligibleClockwise(eligible, currentDealerMember?.seat ?? -1);
  return Object.freeze({
    nextDealerId: nextSeat.userId,
    nextDealerRoundsCompleted: 0,
    rotated: nextSeat.userId !== params.currentDealerId,
    shouldFinish: false,
  });
}

function findNextEligibleClockwise(
  eligibleSorted: readonly RoomMember[],
  fromSeat: number
): RoomMember {
  const after = eligibleSorted.find((m) => m.seat > fromSeat);
  return after ?? eligibleSorted[0]!;
}
