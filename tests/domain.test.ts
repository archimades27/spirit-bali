import { describe, expect, it } from 'vitest';
import fixtureJson from './fixtures/rules-v1.0.json';
import {
  compareHands,
  computeNextDealer,
  createDeck,
  createInitialRoom,
  cryptoShuffle,
  evaluateHand,
  projectSafeSnapshot,
  reduceGameAction,
  RULES_V1_0,
  settleRound,
  tileKey,
  winMultiplier,
  type AuthoritativeRoomState,
  type Tile,
} from '../src/domain';

function setupStartedRoom(playerCount = 2): AuthoritativeRoomState {
  let state = createInitialRoom({
    roomId: 'room-1',
    roomCode: 'BALI01',
    hostId: 'D',
    hostName: 'Bandar',
    maxPlayers: 5,
  });
  for (let i = 1; i <= playerCount; i += 1) {
    const res = reduceGameAction(state, `P${i}`, {
      roomId: 'room-1',
      roundId: null,
      actionId: `join-p${i}`,
      expectedVersion: state.stateVersion,
      type: 'JOIN_ROOM',
      payload: { displayName: `Pemain ${i}`, isBot: true },
    });
    expect(res.accepted).toBe(true);
    if (res.accepted) state = res.state;
  }
  const startRes = reduceGameAction(
    state,
    'D',
    {
      roomId: 'room-1',
      roundId: null,
      actionId: 'start-1',
      expectedVersion: state.stateVersion,
      type: 'START',
      payload: {},
    },
    { nowMs: 1_000_000 }
  );
  expect(startRes.accepted).toBe(true);
  return startRes.accepted ? startRes.state : state;
}

describe('Spirit Bali v1.0 — Hand Evaluation & Comparison (T01–T09, T24, T33)', () => {
  it('matches all canonical hand evaluation fixtures (T01–T05, T24, T33)', () => {
    for (const vec of fixtureJson.handEvaluations) {
      const evaluated = evaluateHand(vec.tiles as unknown as Tile[]);
      expect(evaluated.numericScore, vec.id).toBe(vec.numericScore);
      expect(evaluated.handType, vec.id).toBe(vec.handType);
      expect(evaluated.isPureNine, vec.id).toBe(vec.isPureNine);
      expect(evaluated.rank, vec.id).toBe(vec.rank);
    }
  });

  it('T06: Player Triple beats Dealer normal 9 with multiplier 3', () => {
    const player = evaluateHand([[0, 0], [1, 1], [2, 2]]);
    const dealer = evaluateHand([[6, 6], [3, 4]]);
    expect(compareHands(player, dealer)).toBe('WIN');
    expect(winMultiplier(player)).toBe(3);
  });

  it('T07: Equal normal score (7 vs 7) => player LOSE', () => {
    const player = evaluateHand([[3, 4], [0, 0]]);
    const dealer = evaluateHand([[2, 5], [5, 5]]);
    expect(player.numericScore).toBe(7);
    expect(dealer.numericScore).toBe(7);
    expect(compareHands(player, dealer)).toBe('LOSE');
  });

  it('T08: Triple vs Triple with different numeric scores => dealer wins (LOSE)', () => {
    const player = evaluateHand([[1, 1], [3, 3], [5, 5]]); // numeric 8, Triple
    const dealer = evaluateHand([[0, 0], [2, 2], [4, 4]]); // numeric 2, Triple
    expect(compareHands(player, dealer)).toBe('LOSE');
  });

  it('T09: Dealer Triple beats Player normal => dealer collects only 1x bet', () => {
    const settled = settleRound({
      roundId: 'r-t09',
      dealerId: 'D',
      dealerStartingBalance: 1_000_000,
      dealerTiles: [[1, 1], [3, 3], [5, 5]],
      udegLimit: 200_000,
      playersInOrder: [
        {
          playerId: 'P1',
          seatOrder: 1,
          bet: 30_000,
          startingBalance: 1_000_000,
          tiles: [[2, 3], [0, 1]],
        },
      ],
    });
    expect(settled.settlements[0]?.balanceDelta).toBe(-30_000);
    expect(settled.dealerDelta).toBe(30_000);
  });

  it('T24: 3-card 9 is not pure nine, still pays 2x (A03)', () => {
    const settled = settleRound({
      roundId: 'r-t24',
      dealerId: 'D',
      dealerStartingBalance: 1_000_000,
      dealerTiles: [[4, 4], [0, 0]], // 8
      udegLimit: 200_000,
      playersInOrder: [
        {
          playerId: 'P1',
          seatOrder: 1,
          bet: 50_000,
          startingBalance: 1_000_000,
          tiles: [[0, 1], [0, 2], [0, 6]], // 9 (3 cards)
        },
      ],
    });
    expect(settled.playerHands.P1?.isPureNine).toBe(false);
    expect(settled.settlements[0]?.multiplier).toBe(2);
    expect(settled.settlements[0]?.paid).toBe(100_000);
  });

  it('Tier hierarchy: 666 (rank 12) > TRIPLE (rank 11) > BESAR (>30, rank 10) > Nilai 9 (rank 9)', () => {
    const nine = evaluateHand([[6, 6], [3, 4]]);
    const besar = evaluateHand([[6, 6], [5, 6], [4, 6]]); // total 33 > 30
    const notBesar30 = evaluateHand([[5, 6], [4, 6], [4, 5]]); // total 30 (NOT > 30)
    const triple = evaluateHand([[0, 0], [1, 1], [2, 2]]);
    const sixSixSix = evaluateHand([[0, 6], [1, 5], [2, 4]]);

    expect(notBesar30.handType).toBe('NORMAL');
    expect(besar.handType).toBe('BESAR');
    expect(besar.totalPips).toBe(33);
    expect(sixSixSix.handType).toBe('SIX_SIX_SIX');

    expect(compareHands(besar, nine)).toBe('WIN');
    expect(compareHands(triple, besar)).toBe('WIN');
    expect(compareHands(sixSixSix, triple)).toBe('WIN');
    expect(compareHands(sixSixSix, sixSixSix)).toBe('LOSE'); // tie -> dealer
  });
});

describe('Spirit Bali v1.0 — Settlement & Udeg (T10–T15, T19, T21–T23, T25–T26)', () => {
  it('T10, T11: Player 9 (2x) and Triple (3x) paid when Udeg sufficient', () => {
    const settled = settleRound({
      roundId: 'r-t10-11',
      dealerId: 'D',
      dealerStartingBalance: 1_000_000,
      dealerTiles: [[4, 4], [5, 5]], // 8
      udegLimit: 500_000,
      playersInOrder: [
        {
          playerId: 'P1',
          seatOrder: 1,
          bet: 50_000,
          startingBalance: 1_000_000,
          tiles: [[6, 6], [3, 4]], // 9
        },
        {
          playerId: 'P2',
          seatOrder: 2,
          bet: 30_000,
          startingBalance: 1_000_000,
          tiles: [[0, 0], [1, 1], [2, 2]], // Triple
        },
      ],
    });
    expect(settled.settlements[0]?.balanceDelta).toBe(100_000);
    expect(settled.settlements[1]?.balanceDelta).toBe(90_000);
    expect(settled.dealerDelta).toBe(-190_000);
  });

  it('T12, T13, T19, T25: Canonical 5-player fixture with Udeg Rp200.000', () => {
    // Dealer has score 5: [0,5] + [0,0] = 5
    // P1: Normal win (score 7): [3,4] + [1,2] = 10? Wait: [3,4]+[0,0] dup. Let's pick 100% unique tiles!
    const settled = settleRound({
      roundId: 'r-canonical',
      dealerId: 'D',
      dealerStartingBalance: 1_000_000,
      dealerTiles: [[0, 2], [1, 2]], // total 5 -> score 5
      udegLimit: 200_000,
      playersInOrder: [
        // P1: Normal win (score 7), bet 50k -> claim 50k -> PAID, udeg 150k
        { playerId: 'P1', seatOrder: 1, bet: 50_000, startingBalance: 1_000_000, tiles: [[3, 4], [0, 0]] },
        // P2: 9 win (score 9), bet 60k -> claim 120k -> PAID, udeg 30k
        { playerId: 'P2', seatOrder: 2, bet: 60_000, startingBalance: 1_000_000, tiles: [[4, 5], [5, 5]] },
        // P3: Triple win (rank 10), bet 30k -> claim 90k > 30k -> SKIPPED_UDEG, delta 0, udeg 30k
        { playerId: 'P3', seatOrder: 3, bet: 30_000, startingBalance: 1_000_000, tiles: [[1, 1], [2, 2], [3, 3]] },
        // P4: Lose (score 4), bet 40k -> -40k to dealer, udeg stays 30k (A01)
        { playerId: 'P4', seatOrder: 4, bet: 40_000, startingBalance: 1_000_000, tiles: [[0, 1], [0, 3]] },
        // P5: Normal win (score 8), bet 20k -> claim 20k <= 30k -> PAID, udeg 10k
        { playerId: 'P5', seatOrder: 5, bet: 20_000, startingBalance: 1_000_000, tiles: [[2, 6], [4, 6]] },
      ],
    });

    // Priority payout: Base Udeg 200k + 40k ayahan (P4) = 240k pool.
    // 1. P3 Triple (90k) => PAID (+90k), pool 150k
    // 2. P2 Nilai 9 (120k) => PAID (+120k), pool 30k
    // 3. P1 Normal (50k) => SKIPPED_UDEG (0), pool 30k
    // 4. P5 Normal (20k) => PAID (+20k), pool 10k
    expect(settled.settlements.map((s) => s.balanceDelta)).toEqual([
      0,
      120_000,
      90_000,
      -40_000,
      20_000,
    ]);
    expect(settled.settlements[0]?.outcome).toBe('WIN'); // T25: never converted to LOSE
    expect(settled.settlements[0]?.paymentStatus).toBe('SKIPPED_UDEG');
    expect(settled.settlements[2]?.outcome).toBe('WIN');
    expect(settled.settlements[2]?.multiplier).toBe(3);
    expect(settled.settlements[2]?.paymentStatus).toBe('PAID');
    expect(settled.totalPaid).toBe(230_000);
    expect(settled.totalCollected).toBe(40_000);
    expect(settled.dealerDelta).toBe(-190_000);
    expect(settled.dealerFinalBalance).toBe(810_000);
    expect(settled.udegRemaining).toBe(10_000);
  });

  it('T14, T22, T26: Rejects invalid bets, invalid Udeg, and over-balance bets', () => {
    for (const badBet of [15_000, 0, -10_000, 10_000.5, Number.NaN]) {
      expect(() =>
        settleRound({
          roundId: 'r-bad-bet',
          dealerId: 'D',
          dealerStartingBalance: 1_000_000,
          dealerTiles: [[0, 1], [0, 2]],
          udegLimit: 100_000,
          playersInOrder: [
            { playerId: 'P1', seatOrder: 1, bet: badBet, startingBalance: 1_000_000, tiles: [[0, 3], [0, 4]] },
          ],
        })
      ).toThrow('INVALID_BET');
    }

    for (const badUdeg of [0, -10_000, 1_010_000, 15_000]) {
      expect(() =>
        settleRound({
          roundId: 'r-bad-udeg',
          dealerId: 'D',
          dealerStartingBalance: 1_000_000,
          dealerTiles: [[0, 1], [0, 2]],
          udegLimit: badUdeg,
          playersInOrder: [
            { playerId: 'P1', seatOrder: 1, bet: 10_000, startingBalance: 1_000_000, tiles: [[0, 3], [0, 4]] },
          ],
        })
      ).toThrow('INVALID_UDEG');
    }

    // T26: Balance 20k, bet 30k rejected; bet 20k accepted and can reach 0 without negative
    expect(() =>
      settleRound({
        roundId: 'r-t26-a',
        dealerId: 'D',
        dealerStartingBalance: 1_000_000,
        dealerTiles: [[4, 5], [0, 0]],
        udegLimit: 100_000,
        playersInOrder: [
          { playerId: 'P1', seatOrder: 1, bet: 30_000, startingBalance: 20_000, tiles: [[0, 1], [0, 2]] },
        ],
      })
    ).toThrow('INVALID_BET');

    const ok20 = settleRound({
      roundId: 'r-t26-b',
      dealerId: 'D',
      dealerStartingBalance: 1_000_000,
      dealerTiles: [[4, 5], [0, 0]],
      udegLimit: 100_000,
      playersInOrder: [
        { playerId: 'P1', seatOrder: 1, bet: 20_000, startingBalance: 20_000, tiles: [[0, 1], [0, 2]] },
      ],
    });
    expect(ok20.playerFinalBalances.P1).toBe(0);
  });

  it('T15: Rejects duplicate canonical tiles ([1|3] and [3|1]) within hand or across hands', () => {
    expect(() => evaluateHand([[1, 3], [3, 1]])).toThrow('DUPLICATE_TILE');
    expect(() =>
      settleRound({
        roundId: 'r-dup',
        dealerId: 'D',
        dealerStartingBalance: 1_000_000,
        dealerTiles: [[1, 3], [0, 0]],
        udegLimit: 100_000,
        playersInOrder: [
          { playerId: 'P1', seatOrder: 1, bet: 10_000, startingBalance: 1_000_000, tiles: [[3, 1], [0, 2]] },
        ],
      })
    ).toThrow('DUPLICATE_TILE');
  });

  it('T21 & T23 (Ayahan): Loser bet collected first adds to Udeg pool to pay winner exceeding base Udeg', () => {
    const settled = settleRound({
      roundId: 'r-t21-23-ayahan',
      dealerId: 'D',
      dealerStartingBalance: 1_000_000,
      dealerTiles: [[0, 5], [0, 0]], // 5
      udegLimit: 50_000,
      playersInOrder: [
        // P1 wins 70k (> 50k base Udeg, but <= 50k + 30k ayahan from P2 = 80k!)
        { playerId: 'P1', seatOrder: 1, bet: 70_000, startingBalance: 1_000_000, tiles: [[3, 4], [0, 1]] }, // 8 -> WIN 70k
        // P2 loses 30k -> ayahan +30k collected first into Bandar pool
        { playerId: 'P2', seatOrder: 2, bet: 30_000, startingBalance: 1_000_000, tiles: [[1, 1], [0, 2]] }, // 4 -> LOSE 30k
      ],
    });
    expect(settled.settlements[0]?.paymentStatus).toBe('PAID');
    expect(settled.settlements[0]?.paid).toBe(70_000);
    expect(settled.settlements[0]?.udegAfter).toBe(10_000);
    expect(settled.settlements[1]?.loss).toBe(30_000);
    expect(settled.dealerDelta).toBe(-40_000);
    expect(settled.udegRemaining).toBe(10_000);
  });
});

describe('Spirit Bali v1.0 — A10: Bandar profit capped at Udeg', () => {
  it('Losers beyond the Udeg cap pay nothing (CAPPED_UDEG, no partial)', () => {
    const settled = settleRound({
      roundId: 'r-a10-basic',
      dealerId: 'D',
      dealerStartingBalance: 1_000_000,
      dealerTiles: [[0, 5], [0, 4]], // 9
      udegLimit: 100_000,
      playersInOrder: [
        { playerId: 'P1', seatOrder: 1, bet: 50_000, startingBalance: 1_000_000, tiles: [[1, 1], [0, 2]] },
        { playerId: 'P2', seatOrder: 2, bet: 50_000, startingBalance: 1_000_000, tiles: [[1, 2], [0, 3]] },
        { playerId: 'P3', seatOrder: 3, bet: 50_000, startingBalance: 1_000_000, tiles: [[1, 3], [2, 2]] },
      ],
    });
    expect(settled.settlements.map((s) => s.balanceDelta)).toEqual([-50_000, -50_000, 0]);
    expect(settled.settlements[2]?.outcome).toBe('LOSE');
    expect(settled.settlements[2]?.paymentStatus).toBe('CAPPED_UDEG');
    expect(settled.dealerDelta).toBe(100_000);
  });

  it('A loser that does not fit is skipped, smaller later losers still pay', () => {
    const settled = settleRound({
      roundId: 'r-a10-fit',
      dealerId: 'D',
      dealerStartingBalance: 1_000_000,
      dealerTiles: [[0, 5], [0, 4]], // 9
      udegLimit: 100_000,
      playersInOrder: [
        { playerId: 'P1', seatOrder: 1, bet: 90_000, startingBalance: 1_000_000, tiles: [[1, 1], [0, 2]] },
        { playerId: 'P2', seatOrder: 2, bet: 50_000, startingBalance: 1_000_000, tiles: [[1, 2], [0, 3]] },
        { playerId: 'P3', seatOrder: 3, bet: 10_000, startingBalance: 1_000_000, tiles: [[1, 3], [2, 2]] },
      ],
    });
    expect(settled.settlements.map((s) => s.paymentStatus)).toEqual([
      'COLLECTED',
      'CAPPED_UDEG',
      'COLLECTED',
    ]);
    expect(settled.dealerDelta).toBe(100_000);
  });

  it('Cap is on net profit: payouts to winners raise how much ayahan the Bandar may collect', () => {
    const settled = settleRound({
      roundId: 'r-a10-net',
      dealerId: 'D',
      dealerStartingBalance: 1_000_000,
      dealerTiles: [[0, 5], [0, 0]], // 5
      udegLimit: 100_000,
      playersInOrder: [
        { playerId: 'P1', seatOrder: 1, bet: 50_000, startingBalance: 1_000_000, tiles: [[3, 4], [0, 1]] }, // 8 WIN 50k
        { playerId: 'P2', seatOrder: 2, bet: 80_000, startingBalance: 1_000_000, tiles: [[1, 1], [0, 2]] }, // 4 LOSE
        { playerId: 'P3', seatOrder: 3, bet: 70_000, startingBalance: 1_000_000, tiles: [[1, 3], [0, 6]] }, // 0 LOSE
      ],
    });
    // Allowed collection = 100k + 50k paid = 150k: P2 80k fits, P3 70k would make 150k -> fits exactly.
    expect(settled.settlements.map((s) => s.balanceDelta)).toEqual([50_000, -80_000, -70_000]);
    expect(settled.dealerDelta).toBe(100_000);
  });

  it('Bandar net delta always stays within [-Udeg, +Udeg] over random rounds', () => {
    const base = createDeck();
    for (let i = 0; i < 1000; i += 1) {
      const deck = cryptoShuffle(base);
      let idx = 0;
      const take = (n: number): Tile[] => {
        const res = deck.slice(idx, idx + n);
        idx += n;
        return res;
      };
      const udegLimit = ((i % 10) + 1) * 10_000;
      const res = settleRound({
        roundId: `a10-prop-${i}`,
        dealerId: 'D',
        dealerStartingBalance: 1_000_000,
        dealerTiles: take(2),
        udegLimit,
        playersInOrder: [1, 2, 3, 4, 5].map((seat) => ({
          playerId: `P${seat}`,
          seatOrder: seat,
          bet: (((i * seat) % 12) + 1) * 10_000,
          startingBalance: 1_000_000,
          tiles: take(2),
        })),
      });
      expect(res.dealerDelta).toBeLessThanOrEqual(udegLimit);
      expect(res.dealerDelta).toBeGreaterThanOrEqual(-udegLimit);
      for (const s of res.settlements) {
        if (s.paymentStatus === 'CAPPED_UDEG') {
          expect(s.balanceDelta).toBe(0);
        }
      }
    }
  });
});

describe('Spirit Bali v1.0 — State Machine, Security, Rotation, Idempotency (T16–T20, T27–T36)', () => {
  it('T16 & T32: Rotates dealer only after exactly 3 completed rounds, never on pure 9', () => {
    const members = [
      { userId: 'D', displayName: 'D', seat: 0, balance: 1_000_000, reservedBet: 0, ready: true, status: 'ACTIVE' as const, isBot: false },
      { userId: 'P1', displayName: 'P1', seat: 1, balance: 1_000_000, reservedBet: 0, ready: true, status: 'ACTIVE' as const, isBot: true },
      { userId: 'P2', displayName: 'P2', seat: 2, balance: 1_000_000, reservedBet: 0, ready: true, status: 'ACTIVE' as const, isBot: true },
    ];

    const r1 = computeNextDealer({ members, currentDealerId: 'D', dealerRoundsCompleted: 0, roundCancelled: false });
    expect(r1.nextDealerId).toBe('D');
    expect(r1.nextDealerRoundsCompleted).toBe(1);
    expect(r1.rotated).toBe(false);

    const r2 = computeNextDealer({ members, currentDealerId: 'D', dealerRoundsCompleted: 1, roundCancelled: false });
    expect(r2.nextDealerId).toBe('D');
    expect(r2.nextDealerRoundsCompleted).toBe(2);

    const r3 = computeNextDealer({ members, currentDealerId: 'D', dealerRoundsCompleted: 2, roundCancelled: false });
    expect(r3.nextDealerId).toBe('P1');
    expect(r3.nextDealerRoundsCompleted).toBe(0);
    expect(r3.rotated).toBe(true);
  });

  it('T17, T18, T20, T27, T29, T30, T34, T35: Full round lifecycle with idempotency, privacy, concurrency, mid-round join', () => {
    let state = setupStartedRoom(2);
    const roundId = state.currentRound!.roundId;

    // Set Udeg
    const udegRes = reduceGameAction(state, 'D', {
      roomId: 'room-1',
      roundId,
      actionId: 'udeg-1',
      expectedVersion: state.stateVersion,
      type: 'SET_UDEG',
      payload: { amount: 200_000 },
    });
    expect(udegRes.accepted).toBe(true);
    if (!udegRes.accepted) return;
    state = udegRes.state;
    expect(state.phase).toBe('BETTING');

    // T18: Private hands are never exposed to other users before REVEAL
    const snapP1 = projectSafeSnapshot(state, 'P1');
    const snapP2 = projectSafeSnapshot(state, 'P2');
    expect(snapP1.myTiles.length).toBe(1);
    expect(snapP2.myTiles.length).toBe(1);
    expect(tileKey(snapP1.myTiles[0]!)).not.toBe(tileKey(snapP2.myTiles[0]!));
    expect(Object.keys(snapP1.currentRound!.reveals).length).toBe(0);
    expect('privateRound' in snapP1).toBe(false);

    // T27: DRAW during BETTING rejected
    const badPhase = reduceGameAction(state, 'P1', {
      roomId: 'room-1',
      roundId,
      actionId: 'bad-draw',
      expectedVersion: state.stateVersion,
      type: 'DRAW',
      payload: {},
    });
    expect(badPhase.accepted).toBe(false);
    if (!badPhase.accepted) expect(badPhase.code).toBe('WRONG_PHASE');

    // T35: New player joining mid-round waits until next round
    const midJoin = reduceGameAction(state, 'P3', {
      roomId: 'room-1',
      roundId: null,
      actionId: 'join-p3',
      expectedVersion: state.stateVersion,
      type: 'JOIN_ROOM',
      payload: { displayName: 'Pemain 3' },
    });
    expect(midJoin.accepted).toBe(true);
    if (!midJoin.accepted) return;
    state = midJoin.state;
    expect(state.members.find((m) => m.userId === 'P3')?.status).toBe('WAITING_NEXT_ROUND');
    expect(state.currentRound?.players.P3).toBeUndefined();

    // P1 places bet (T29: reservedBet updated, book balance untouched)
    const betVer = state.stateVersion;
    const bet1 = reduceGameAction(state, 'P1', {
      roomId: 'room-1',
      roundId,
      actionId: 'bet-p1',
      expectedVersion: betVer,
      type: 'PLACE_BET',
      payload: { amount: 50_000 },
    });
    expect(bet1.accepted).toBe(true);
    if (!bet1.accepted) return;
    state = bet1.state;
    const p1Member = state.members.find((m) => m.userId === 'P1')!;
    expect(p1Member.balance).toBe(1_000_000);
    expect(p1Member.reservedBet).toBe(50_000);

    // T17 & T34: Replaying same actionId with OLD expectedVersion returns accepted replay
    const replay = reduceGameAction(state, 'P1', {
      roomId: 'room-1',
      roundId,
      actionId: 'bet-p1',
      expectedVersion: betVer, // stale version, but same actionId!
      type: 'PLACE_BET',
      payload: { amount: 50_000 },
    });
    expect(replay.accepted).toBe(true);
    if (replay.accepted) expect(replay.replayed).toBe(true);

    // T17: Same actionId with different payload => ACTION_ID_CONFLICT
    const conflict = reduceGameAction(state, 'P1', {
      roomId: 'room-1',
      roundId,
      actionId: 'bet-p1',
      expectedVersion: betVer,
      type: 'PLACE_BET',
      payload: { amount: 60_000 },
    });
    expect(conflict.accepted).toBe(false);
    if (!conflict.accepted) expect(conflict.code).toBe('ACTION_ID_CONFLICT');

    // P2 places bet -> transitions to DRAW_DECISION with 2 tiles each
    const bet2 = reduceGameAction(state, 'P2', {
      roomId: 'room-1',
      roundId,
      actionId: 'bet-p2',
      expectedVersion: state.stateVersion,
      type: 'PLACE_BET',
      payload: { amount: 40_000 },
    });
    expect(bet2.accepted).toBe(true);
    if (!bet2.accepted) return;
    state = bet2.state;
    expect(state.phase).toBe('DRAW_DECISION');
    expect(projectSafeSnapshot(state, 'P1').myTiles.length).toBe(2);

    // T20: Concurrent Draw/Stop with same expectedVersion => first succeeds, second fails STALE_VERSION
    const drawVer = state.stateVersion;
    const draw1 = reduceGameAction(state, 'P1', {
      roomId: 'room-1',
      roundId,
      actionId: 'draw-p1-a',
      expectedVersion: drawVer,
      type: 'DRAW',
      payload: {},
    });
    expect(draw1.accepted).toBe(true);
    if (!draw1.accepted) return;
    state = draw1.state;
    expect(projectSafeSnapshot(state, 'P1').myTiles.length).toBe(3);

    const drawRace = reduceGameAction(state, 'P1', {
      roomId: 'room-1',
      roundId,
      actionId: 'draw-p1-b',
      expectedVersion: drawVer,
      type: 'STOP',
      payload: {},
    });
    expect(drawRace.accepted).toBe(false);
    if (!drawRace.accepted) expect(drawRace.code).toBe('STALE_VERSION');

    // P2 stops, Dealer stops -> atomic reveal & settlement -> NEXT_ROUND
    const p2Stop = reduceGameAction(state, 'P2', {
      roomId: 'room-1',
      roundId,
      actionId: 'stop-p2',
      expectedVersion: state.stateVersion,
      type: 'STOP',
      payload: {},
    });
    expect(p2Stop.accepted).toBe(true);
    if (!p2Stop.accepted) return;
    state = p2Stop.state;

    const dStop = reduceGameAction(state, 'D', {
      roomId: 'room-1',
      roundId,
      actionId: 'stop-d',
      expectedVersion: state.stateVersion,
      type: 'STOP',
      payload: {},
    });
    expect(dStop.accepted).toBe(true);
    if (!dStop.accepted) return;
    state = dStop.state;

    expect(state.phase).toBe('NEXT_ROUND');
    // All reserves released (T29)
    expect(state.members.every((m) => m.reservedBet === 0)).toBe(true);
    // Zero-sum balance invariant across whole room (4 members including P3 waiting x 1M = 4M)
    const totalRoomBalance = state.members.reduce((s, m) => s + m.balance, 0);
    expect(totalRoomBalance).toBe(4 * RULES_V1_0.startingBalance);

    // T30: Reconnect snapshot matches settled ledger
    const reconnectSnap = projectSafeSnapshot(state, 'P1');
    expect(reconnectSnap.currentRound?.settlements.length).toBe(2);
    expect(Object.keys(reconnectSnap.currentRound?.reveals ?? {}).length).toBe(3);
  });

  it('T31 & T36: Timeout in BETTING cancels round, releases reserves, does not increment rotation', () => {
    let state = setupStartedRoom(2);
    const roundId = state.currentRound!.roundId;

    const udegRes = reduceGameAction(
      state,
      'D',
      {
        roomId: 'room-1',
        roundId,
        actionId: 'udeg-t36',
        expectedVersion: state.stateVersion,
        type: 'SET_UDEG',
        payload: { amount: 100_000 },
      },
      { nowMs: 2_000_000 }
    );
    expect(udegRes.accepted).toBe(true);
    if (!udegRes.accepted) return;
    state = udegRes.state;

    // P1 locks bet, P2 times out
    const bet1 = reduceGameAction(
      state,
      'P1',
      {
        roomId: 'room-1',
        roundId,
        actionId: 'bet-t36',
        expectedVersion: state.stateVersion,
        type: 'PLACE_BET',
        payload: { amount: 50_000 },
      },
      { nowMs: 2_010_000 }
    );
    expect(bet1.accepted).toBe(true);
    if (!bet1.accepted) return;
    state = bet1.state;

    const tick = reduceGameAction(
      state,
      'D',
      {
        roomId: 'room-1',
        roundId,
        actionId: 'timeout-t36',
        expectedVersion: state.stateVersion,
        type: 'TIMEOUT_TICK',
        payload: { nowMs: 2_060_000 },
      },
      { nowMs: 2_060_000 }
    );
    expect(tick.accepted).toBe(true);
    if (!tick.accepted) return;
    state = tick.state;

    expect(state.phase).toBe('NEXT_ROUND');
    expect(state.currentRound?.cancelledReason).toBe('TIMEOUT_BETTING');
    expect(state.dealerRoundsCompleted).toBe(0); // T36: rotation counter unchanged
    expect(state.members.every((m) => m.reservedBet === 0 && m.balance === 1_000_000)).toBe(true);
  });

  it('ONE_CYCLE mode finishes immediately after every participant completes their Bandar turn', () => {
    let state = createInitialRoom({
      roomId: 'room-cycle',
      roomCode: 'CYCLE1',
      hostId: 'A',
      hostName: 'A',
      maxPlayers: 1,
      sessionMode: 'ONE_CYCLE',
      randomizeInitialDealer: true,
    });
    const joinB = reduceGameAction(state, 'B', {
      roomId: 'room-cycle',
      roundId: null,
      actionId: 'join-b',
      expectedVersion: state.stateVersion,
      type: 'JOIN_ROOM',
      payload: { displayName: 'B', isBot: true },
    });
    expect(joinB.accepted).toBe(true);
    if (joinB.accepted) state = joinB.state;

    const start = reduceGameAction(state, 'A', {
      roomId: 'room-cycle',
      roundId: null,
      actionId: 'start-cycle',
      expectedVersion: state.stateVersion,
      type: 'START',
      payload: {},
    });
    expect(start.accepted).toBe(true);
    if (start.accepted) state = start.state;

    // 2 participants x 3 rounds per Bandar = 6 rounds total => FINISHED!
    for (let r = 1; r <= 6; r += 1) {
      expect(state.phase).toBe('ROUND_SETUP');
      const roundId = state.currentRound!.roundId;
      const dealerId = state.currentRound!.dealerId;
      const playerId = state.currentRound!.settlementOrder[0]!;

      const udeg = reduceGameAction(state, dealerId, {
        roomId: 'room-cycle',
        roundId,
        actionId: `u-${r}`,
        expectedVersion: state.stateVersion,
        type: 'SET_UDEG',
        payload: { amount: 50_000 },
      });
      expect(udeg.accepted).toBe(true);
      if (udeg.accepted) state = udeg.state;

      const bet = reduceGameAction(state, playerId, {
        roomId: 'room-cycle',
        roundId,
        actionId: `b-${r}`,
        expectedVersion: state.stateVersion,
        type: 'PLACE_BET',
        payload: { amount: 10_000 },
      });
      expect(bet.accepted).toBe(true);
      if (bet.accepted) state = bet.state;

      const stopP = reduceGameAction(state, playerId, {
        roomId: 'room-cycle',
        roundId,
        actionId: `sp-${r}`,
        expectedVersion: state.stateVersion,
        type: 'STOP',
        payload: {},
      });
      expect(stopP.accepted).toBe(true);
      if (stopP.accepted) state = stopP.state;

      const stopD = reduceGameAction(state, dealerId, {
        roomId: 'room-cycle',
        roundId,
        actionId: `sd-${r}`,
        expectedVersion: state.stateVersion,
        type: 'STOP',
        payload: {},
      });
      expect(stopD.accepted).toBe(true);
      if (stopD.accepted) state = stopD.state;

      if (r < 6) {
        expect(state.phase).toBe('NEXT_ROUND');
        const next = reduceGameAction(state, 'A', {
          roomId: 'room-cycle',
          roundId,
          actionId: `nx-${r}`,
          expectedVersion: state.stateVersion,
          type: 'NEXT_ROUND',
          payload: {},
        });
        expect(next.accepted).toBe(true);
        if (next.accepted) state = next.state;
      }
    }

    expect(state.phase).toBe('FINISHED');
    expect(state.dealersServed.length).toBe(2);
  });
});

describe('Spirit Bali v1.0 — Property-based Invariants', () => {
  it('2,000 cryptographic shuffles always yield 28 unique canonical tiles 0..6', () => {
    const base = createDeck();
    expect(base.length).toBe(28);
    for (let i = 0; i < 2000; i += 1) {
      const shuffled = cryptoShuffle(base);
      expect(shuffled.length).toBe(28);
      const keys = new Set(shuffled.map(tileKey));
      expect(keys.size).toBe(28);
    }
  });

  it('1,000 random 6-participant settlements satisfy zero-sum, non-negative balances, Udeg bounds, no partial payout', () => {
    const base = createDeck();
    for (let i = 0; i < 1000; i += 1) {
      const deck = cryptoShuffle(base);
      let idx = 0;
      const take = (n: number): Tile[] => {
        const res = deck.slice(idx, idx + n);
        idx += n;
        return res;
      };
      const dealerTiles = take(i % 2 === 0 ? 2 : 3);
      const udegLimit = ((i % 25) + 1) * 10_000;
      const playersInOrder = [1, 2, 3, 4, 5].map((seat) => ({
        playerId: `P${seat}`,
        seatOrder: seat,
        bet: (((i + seat) % 8) + 1) * 10_000,
        startingBalance: 1_000_000,
        tiles: take((i + seat) % 2 === 0 ? 2 : 3),
      }));

      // settleRound calls verifySettlementInvariants internally
      const res = settleRound({
        roundId: `prop-${i}`,
        dealerId: 'D',
        dealerStartingBalance: 1_000_000,
        dealerTiles,
        udegLimit,
        playersInOrder,
      });

      const sumDelta =
        res.dealerDelta + res.settlements.reduce((s, r) => s + r.balanceDelta, 0);
      expect(sumDelta).toBe(0);
      const maxPool = udegLimit + res.totalCollected;
      expect(res.udegRemaining).toBeGreaterThanOrEqual(0);
      expect(res.udegRemaining).toBeLessThanOrEqual(maxPool);
      expect(res.totalPaid).toBeLessThanOrEqual(maxPool);
    }
  });
});
