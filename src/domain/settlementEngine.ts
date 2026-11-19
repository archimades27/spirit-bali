import { validateUniqueTiles } from './deck';
import { compareHands } from './handComparator';
import { evaluateHand, winMultiplier } from './handEvaluator';
import { RULES_V1_0 } from './rules';
import type {
  EvaluatedHand,
  GameRules,
  LedgerEntry,
  RoundSettlement,
  SettlementOutcome,
  Tile,
} from './types';

export interface SettlementPlayerInput {
  readonly playerId: string;
  readonly seatOrder: number;
  readonly bet: number;
  readonly startingBalance: number;
  readonly tiles: readonly Tile[];
}

export interface SettlementInput {
  readonly roundId: string;
  readonly dealerId: string;
  readonly dealerStartingBalance: number;
  readonly dealerTiles: readonly Tile[];
  readonly udegLimit: number;
  readonly playersInOrder: readonly SettlementPlayerInput[];
  readonly rules?: GameRules;
}

export interface SettlementOutput {
  readonly roundId: string;
  readonly dealerHand: EvaluatedHand;
  readonly playerHands: Readonly<Record<string, EvaluatedHand>>;
  readonly settlements: readonly RoundSettlement[];
  readonly ledgerEntries: readonly LedgerEntry[];
  readonly totalPaid: number;
  readonly totalCollected: number;
  readonly dealerDelta: number;
  readonly dealerFinalBalance: number;
  readonly playerFinalBalances: Readonly<Record<string, number>>;
  readonly udegRemaining: number;
}

export function isValidBetAmount(
  amount: number,
  availableBalance: number,
  rules: GameRules = RULES_V1_0
): boolean {
  return (
    Number.isSafeInteger(amount) &&
    amount >= rules.betStep &&
    amount % rules.betStep === 0 &&
    amount <= availableBalance
  );
}

export function isValidUdegAmount(
  amount: number,
  dealerBalance: number,
  rules: GameRules = RULES_V1_0
): boolean {
  return (
    Number.isSafeInteger(amount) &&
    amount >= rules.betStep &&
    amount % rules.betStep === 0 &&
    amount <= dealerBalance
  );
}

export function settleRound(input: SettlementInput): SettlementOutput {
  const rules = input.rules ?? RULES_V1_0;

  if (!isValidUdegAmount(input.udegLimit, input.dealerStartingBalance, rules)) {
    throw new Error('INVALID_UDEG');
  }

  // Validate no duplicate tiles across dealer and all players (T15)
  const allTiles: Tile[] = [...input.dealerTiles];
  for (const p of input.playersInOrder) {
    allTiles.push(...p.tiles);
  }
  validateUniqueTiles(allTiles);

  const dealerHand = evaluateHand(input.dealerTiles);
  const playerHands: Record<string, EvaluatedHand> = {};
  const outcomes: Record<string, SettlementOutcome> = {};
  const ledgerEntries: LedgerEntry[] = [];
  const playerFinalBalances: Record<string, number> = {};

  // Pass 1: Evaluate all hands and collect ayahan (losses/ties) into the Bandar's payout pool first.
  let totalCollected = 0;
  let dealerDelta = 0;

  for (const p of input.playersInOrder) {
    if (!isValidBetAmount(p.bet, p.startingBalance, rules)) {
      throw new Error('INVALID_BET');
    }
    const hand = evaluateHand(p.tiles);
    playerHands[p.playerId] = hand;
    const outcome = compareHands(hand, dealerHand);
    outcomes[p.playerId] = outcome;

    if (outcome === 'LOSE') {
      const loss = p.bet * rules.dealerWinMultiplier;
      totalCollected += loss;
      dealerDelta += loss;
      playerFinalBalances[p.playerId] = p.startingBalance - loss;

      const baseKey = `${input.roundId}:${p.playerId}:COLLECTION`;
      ledgerEntries.push(
        Object.freeze({
          id: `${baseKey}:P`,
          roundId: input.roundId,
          participantId: p.playerId,
          counterpartyId: input.dealerId,
          signedAmount: -loss,
          kind: 'COLLECTION',
          settlementKey: `${baseKey}:P`,
        }),
        Object.freeze({
          id: `${baseKey}:D`,
          roundId: input.roundId,
          participantId: input.dealerId,
          counterpartyId: p.playerId,
          signedAmount: loss,
          kind: 'COLLECTION',
          settlementKey: `${baseKey}:D`,
        })
      );
    }
  }

function payoutTier(hand: EvaluatedHand): 0 | 1 | 2 | 3 | 4 {
  if (hand.handType === 'SIX_SIX_SIX') return 0;
  if (hand.handType === 'TRIPLE') return 1;
  if (hand.handType === 'BESAR') return 2;
  if (hand.numericScore === 9) return 3;
  return 4;
}

  // Pass 2: Pay winners in priority order (Triple -> Nilai 9 -> Normal, tie-broken by clockwise seatOrder)
  // from (udegLimit + totalCollected ayahan).
  let udegRemaining = input.udegLimit + totalCollected;
  let totalPaid = 0;
  const settlementByPlayer: Record<string, RoundSettlement> = {};

  const winnersInPriority = input.playersInOrder
    .filter((p) => outcomes[p.playerId] === 'WIN')
    .sort((a, b) => {
      const tierDiff =
        payoutTier(playerHands[a.playerId]!) - payoutTier(playerHands[b.playerId]!);
      return tierDiff !== 0 ? tierDiff : a.seatOrder - b.seatOrder;
    });

  for (const p of winnersInPriority) {
    const hand = playerHands[p.playerId]!;
    const udegBefore = udegRemaining;
    const multiplier = winMultiplier(hand, rules);
    const claim = p.bet * multiplier;

    if (claim <= udegRemaining) {
      udegRemaining -= claim;
      totalPaid += claim;
      dealerDelta -= claim;
      playerFinalBalances[p.playerId] = p.startingBalance + claim;

      settlementByPlayer[p.playerId] = Object.freeze({
        roundId: input.roundId,
        playerId: p.playerId,
        seatOrder: p.seatOrder,
        bet: p.bet,
        outcome: 'WIN',
        multiplier,
        claim,
        paid: claim,
        loss: 0,
        balanceDelta: claim,
        paymentStatus: 'PAID',
        udegBefore,
        udegAfter: udegRemaining,
      });

      const baseKey = `${input.roundId}:${p.playerId}:PAYOUT`;
      ledgerEntries.push(
        Object.freeze({
          id: `${baseKey}:P`,
          roundId: input.roundId,
          participantId: p.playerId,
          counterpartyId: input.dealerId,
          signedAmount: claim,
          kind: 'PAYOUT',
          settlementKey: `${baseKey}:P`,
        }),
        Object.freeze({
          id: `${baseKey}:D`,
          roundId: input.roundId,
          participantId: input.dealerId,
          counterpartyId: p.playerId,
          signedAmount: -claim,
          kind: 'PAYOUT',
          settlementKey: `${baseKey}:D`,
        })
      );
    } else {
      // WIN but (udegLimit + ayahan) remaining is insufficient => SKIPPED_UDEG (never converted to LOSE)
      playerFinalBalances[p.playerId] = p.startingBalance;

      settlementByPlayer[p.playerId] = Object.freeze({
        roundId: input.roundId,
        playerId: p.playerId,
        seatOrder: p.seatOrder,
        bet: p.bet,
        outcome: 'WIN',
        multiplier,
        claim,
        paid: 0,
        loss: 0,
        balanceDelta: 0,
        paymentStatus: 'SKIPPED_UDEG',
        udegBefore,
        udegAfter: udegRemaining,
      });
    }
  }

  for (const p of input.playersInOrder) {
    if (outcomes[p.playerId] === 'LOSE') {
      const loss = p.bet * rules.dealerWinMultiplier;
      settlementByPlayer[p.playerId] = Object.freeze({
        roundId: input.roundId,
        playerId: p.playerId,
        seatOrder: p.seatOrder,
        bet: p.bet,
        outcome: 'LOSE',
        multiplier: 1,
        claim: 0,
        paid: 0,
        loss,
        balanceDelta: -loss,
        paymentStatus: 'COLLECTED',
        udegBefore: udegRemaining,
        udegAfter: udegRemaining,
      });
    }
  }

  const settlements: RoundSettlement[] = input.playersInOrder.map(
    (p) => settlementByPlayer[p.playerId]!
  );

  const dealerFinalBalance = input.dealerStartingBalance + dealerDelta;

  const result: SettlementOutput = Object.freeze({
    roundId: input.roundId,
    dealerHand,
    playerHands: Object.freeze(playerHands),
    settlements: Object.freeze(settlements),
    ledgerEntries: Object.freeze(ledgerEntries),
    totalPaid,
    totalCollected,
    dealerDelta,
    dealerFinalBalance,
    playerFinalBalances: Object.freeze(playerFinalBalances),
    udegRemaining,
  });

  verifySettlementInvariants(result, input);
  return result;
}

export function verifySettlementInvariants(
  result: SettlementOutput,
  input: SettlementInput
): void {
  const playerDeltaSum = result.settlements.reduce((s, r) => s + r.balanceDelta, 0);
  if (playerDeltaSum + result.dealerDelta !== 0) {
    throw new Error('INVARIANT_ZERO_SUM_VIOLATED');
  }

  const ledgerSum = result.ledgerEntries.reduce((s, e) => s + e.signedAmount, 0);
  if (ledgerSum !== 0) {
    throw new Error('INVARIANT_LEDGER_ZERO_SUM_VIOLATED');
  }

  if (result.dealerFinalBalance < 0) {
    throw new Error('INVARIANT_NEGATIVE_DEALER_BALANCE');
  }

  for (const bal of Object.values(result.playerFinalBalances)) {
    if (bal < 0) {
      throw new Error('INVARIANT_NEGATIVE_PLAYER_BALANCE');
    }
  }

  const maxPayoutPool = input.udegLimit + result.totalCollected;
  if (result.udegRemaining < 0 || result.udegRemaining > maxPayoutPool) {
    throw new Error('INVARIANT_UDEG_RANGE_VIOLATED');
  }

  if (result.totalPaid > maxPayoutPool) {
    throw new Error('INVARIANT_TOTAL_PAID_EXCEEDS_UDEG');
  }

  for (const s of result.settlements) {
    if (s.paid !== 0 && s.paid !== s.claim) {
      throw new Error('INVARIANT_PARTIAL_PAYOUT_FORBIDDEN');
    }
  }
}
