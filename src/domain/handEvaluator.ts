import { normalizeTile, tileKey } from './deck';
import { RULES_V1_0 } from './rules';
import type { EvaluatedHand, GameRules, HandType, Tile } from './types';

/**
 * Hand Tier Hierarchy (lowest to highest):
 * 1. NORMAL (angka 0–9): rank 0..9 (totalPips % 10)
 * 2. BESAR (akumulasi totalPips > 30): rank 10
 * 3. TRIPLE (3 kartu balak berbeda): rank 11
 * 4. SIX_SIX_SIX (666 — 3 kartu masing-masing bernilai 6): rank 12
 */
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

  const isSixSixSix =
    normalized.length === 3 && normalized.every(([a, b]) => a + b === 6);
  const isTriple =
    normalized.length === 3 && normalized.every(([a, b]) => a === b);
  const isBesar = totalPips > 30;

  let handType: HandType = 'NORMAL';
  let rank = numericScore;

  if (isSixSixSix) {
    handType = 'SIX_SIX_SIX';
    rank = 12;
  } else if (isTriple) {
    handType = 'TRIPLE';
    rank = 11;
  } else if (isBesar) {
    handType = 'BESAR';
    rank = 10;
  }

  return Object.freeze({
    tiles: Object.freeze(normalized),
    totalPips,
    numericScore,
    handType,
    isPureNine: handType === 'NORMAL' && normalized.length === 2 && numericScore === 9,
    rank,
  });
}

export function formatHandLabel(hand: EvaluatedHand): string {
  switch (hand.handType) {
    case 'SIX_SIX_SIX':
      return '666';
    case 'TRIPLE':
      return `TRIPLE (${hand.numericScore})`;
    case 'BESAR':
      return `BESAR (${hand.totalPips})`;
    default:
      return `Nilai ${hand.numericScore}${hand.isPureNine ? ' · 9 Murni' : ''}`;
  }
}

export function winMultiplier(
  hand: EvaluatedHand,
  rules: GameRules = RULES_V1_0
): 1 | 2 | 3 {
  if (hand.handType === 'SIX_SIX_SIX' || hand.handType === 'TRIPLE') {
    return rules.playerTripleMultiplier;
  }
  if (hand.handType === 'BESAR' || hand.numericScore === 9) {
    return rules.playerNineMultiplier;
  }
  return rules.playerNormalMultiplier;
}
