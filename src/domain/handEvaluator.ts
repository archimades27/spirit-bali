import { normalizeTile, tileKey } from './deck';
import { RULES_V1_0 } from './rules';
import type { EvaluatedHand, GameRules, Tile } from './types';

export function evaluateHand(tiles: readonly Tile[]): EvaluatedHand {
  if (tiles.length < 2 || tiles.length > 3) {
    throw new Error('INVALID_HAND_SIZE');
  }

  const seen = new Set<string>();
  const normalized: Tile[] = [];

  for (const tile of tiles) {
    const canon = normalizeTile(tile);
    const key = tileKey(canon);
    if (seen.has(key)) {
      throw new Error('DUPLICATE_TILE');
    }
    seen.add(key);
    normalized.push(canon);
  }

  const totalPips = normalized.reduce((sum, [a, b]) => sum + a + b, 0);
  const numericScore = totalPips % 10;
  const isTriple = normalized.length === 3 && normalized.every(([a, b]) => a === b);

  return Object.freeze({
    tiles: Object.freeze(normalized),
    numericScore,
    handType: isTriple ? 'TRIPLE' : 'NORMAL',
    isPureNine: normalized.length === 2 && numericScore === 9,
    rank: isTriple ? 10 : numericScore,
  });
}

export function winMultiplier(
  hand: EvaluatedHand,
  rules: GameRules = RULES_V1_0
): 1 | 2 | 3 {
  if (hand.handType === 'TRIPLE') {
    return rules.playerTripleMultiplier;
  }
  if (hand.numericScore === 9) {
    return rules.playerNineMultiplier;
  }
  return rules.playerNormalMultiplier;
}
