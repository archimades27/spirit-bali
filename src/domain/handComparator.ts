import type { EvaluatedHand, SettlementOutcome } from './types';

/**
 * Compares a player's evaluated hand against the dealer's evaluated hand.
 * Rule v1.0:
 * - Triple (rank 10) beats all NORMAL hands (rank 0..9).
 * - Equal ranks (including Triple vs Triple) always win for dealer => player LOSE.
 */
export function compareHands(
  player: EvaluatedHand,
  dealer: EvaluatedHand
): SettlementOutcome {
  return player.rank > dealer.rank ? 'WIN' : 'LOSE';
}
