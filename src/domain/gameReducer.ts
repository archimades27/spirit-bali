import { createDeck, cryptoShuffle, dealFromDeck } from './deck';
import { computeNextDealer, computeSettlementOrder } from './dealerRotation';
import { createRulesV1 } from './rules';
import {
  isValidUdegAmount,
  settleRound,
} from './settlementEngine';
import type {
  ActionResult,
  AuthoritativeRoomState,
  GameAction,
  GameRules,
  PrivateRoundData,
  RoomMember,
  RoundPlayerState,
  RoundRevealEntry,
  RoundState,
  SafeRoomSnapshot,
  Tile,
} from './types';

export interface CreateRoomInput {
  readonly roomId: string;
  readonly roomCode: string;
  readonly hostId: string;
  readonly hostName: string;
  readonly hostIsBot?: boolean;
  readonly maxPlayers?: number;
  readonly sessionMode?: 'ENDLESS' | 'ONE_CYCLE';
  readonly randomizeInitialDealer?: boolean;
}

export interface ReducerOptions {
  readonly nowMs?: number;
  readonly deckShuffler?: (deck: readonly Tile[]) => readonly Tile[];
  readonly roundIdFactory?: (sequence: number) => string;
}

function stablePayloadHash(action: GameAction): string {
  const normalized = {
    roomId: action.roomId,
    roundId: action.roundId,
    type: action.type,
    payload: {
      amount: action.payload.amount ?? null,
      ready: action.payload.ready ?? null,
      displayName: action.payload.displayName ?? null,
      isBot: action.payload.isBot ?? null,
    },
  };
  return JSON.stringify(normalized);
}

export function createInitialRoom(input: CreateRoomInput): AuthoritativeRoomState {
  const rules: GameRules = createRulesV1(input.maxPlayers ?? 5);
  const hostMember: RoomMember = Object.freeze({
    userId: input.hostId,
    displayName: input.hostName.trim().slice(0, 24) || 'Host',
    seat: 0,
    balance: rules.startingBalance,
    reservedBet: 0,
    ready: true,
    status: 'ACTIVE',
    isBot: Boolean(input.hostIsBot),
  });

  return Object.freeze({
    roomId: input.roomId,
    roomCode: input.roomCode,
    hostId: input.hostId,
    rules,
    sessionMode: input.sessionMode ?? 'ENDLESS',
    randomizeInitialDealer: Boolean(input.randomizeInitialDealer),
    phase: 'LOBBY',
    stateVersion: 1,
    dealerId: input.hostId,
    dealerRoundsCompleted: 0,
    dealersServed: Object.freeze([]),
    roundSequence: 0,
    members: Object.freeze([hostMember]),
    currentRound: null,
    privateRound: null,
    receipts: Object.freeze({}),
    ledger: Object.freeze([]),
    roundHistory: Object.freeze([]),
  });
}

/**
 * Produces a viewer-safe snapshot.
 * Private tiles of other participants and the remaining deck are NEVER exposed before REVEAL (T18).
 */
export function projectSafeSnapshot(
  state: AuthoritativeRoomState,
  viewerId: string
): SafeRoomSnapshot {
  const isMember = state.members.some((m) => m.userId === viewerId && m.status !== 'LEFT');
  const myTiles: readonly Tile[] =
    isMember && state.privateRound ? (state.privateRound.hands[viewerId] ?? []) : [];

  const handCounts: Record<string, number> = {};
  if (state.privateRound) {
    for (const [uid, tiles] of Object.entries(state.privateRound.hands)) {
      handCounts[uid] = tiles.length;
    }
  }

  return Object.freeze({
    roomId: state.roomId,
    roomCode: state.roomCode,
    hostId: state.hostId,
    rules: state.rules,
    sessionMode: state.sessionMode,
    phase: state.phase,
    stateVersion: state.stateVersion,
    dealerId: state.dealerId,
    dealerRoundsCompleted: state.dealerRoundsCompleted,
    dealersServed: state.dealersServed,
    roundSequence: state.roundSequence,
    members: state.members,
    currentRound: state.currentRound,
    myTiles,
    handCounts: Object.freeze(handCounts),
    roundHistory: state.roundHistory,
  });
}

function reject(
  action: GameAction,
  state: AuthoritativeRoomState,
  code: Extract<ActionResult, { accepted: false }>['code'],
  message: string
): ActionResult {
  return Object.freeze({
    accepted: false,
    actionId: action.actionId,
    code,
    currentVersion: state.stateVersion,
    message,
  });
}

function accept(
  action: GameAction,
  actorId: string,
  nextState: AuthoritativeRoomState,
  replayed = false
): ActionResult {
  const receiptKey = `${actorId}:${action.actionId}`;
  const stateWithReceipt: AuthoritativeRoomState = replayed
    ? nextState
    : Object.freeze({
        ...nextState,
        receipts: Object.freeze({
          ...nextState.receipts,
          [receiptKey]: Object.freeze({
            actionId: action.actionId,
            actorId,
            payloadHash: stablePayloadHash(action),
            acceptedVersion: nextState.stateVersion,
            phase: nextState.phase,
            accepted: true,
          }),
        }),
      });

  return Object.freeze({
    accepted: true,
    actionId: action.actionId,
    stateVersion: stateWithReceipt.stateVersion,
    phase: stateWithReceipt.phase,
    replayed,
    state: stateWithReceipt,
    snapshot: projectSafeSnapshot(stateWithReceipt, actorId),
  });
}

function createRoundSetupState(
  state: AuthoritativeRoomState,
  dealerId: string,
  dealerRoundsCompleted: number,
  nowMs: number,
  roundIdFactory: (seq: number) => string
): AuthoritativeRoomState {
  // Apply boundary transitions: pending leaves & bankruptcies & waiting joiners (T35, A04, A08)
  const updatedMembers = state.members.map((m) => {
    if (m.pendingLeave) {
      return Object.freeze({ ...m, status: 'LEFT' as const, pendingLeave: false, reservedBet: 0 });
    }
    if (m.status === 'LEFT') return m;
    if (m.balance < state.rules.betStep) {
      return Object.freeze({ ...m, status: 'BANKRUPT' as const, reservedBet: 0 });
    }
    return Object.freeze({ ...m, status: 'ACTIVE' as const, reservedBet: 0 });
  });

  const settlementOrder = computeSettlementOrder(
    updatedMembers,
    dealerId,
    state.rules.betStep
  );

  const dealerEligible = updatedMembers.some(
    (m) => m.userId === dealerId && m.status === 'ACTIVE' && m.balance >= state.rules.betStep
  );

  if (!dealerEligible || settlementOrder.length < 1) {
    return Object.freeze({
      ...state,
      phase: 'FINISHED',
      stateVersion: state.stateVersion + 1,
      dealerId,
      dealerRoundsCompleted,
      members: Object.freeze(updatedMembers),
      currentRound: null,
      privateRound: null,
    });
  }

  const nextSeq = state.roundSequence + 1;
  const roundId = roundIdFactory(nextSeq);
  const players: Record<string, RoundPlayerState> = {};
  const dealerMember = updatedMembers.find((m) => m.userId === dealerId)!;

  players[dealerId] = Object.freeze({
    userId: dealerId,
    seat: dealerMember.seat,
    seatOrder: 0,
    isDealer: true,
    bet: 0,
    betLocked: true,
    decision: 'PENDING',
  });

  settlementOrder.forEach((uid, idx) => {
    const member = updatedMembers.find((m) => m.userId === uid)!;
    players[uid] = Object.freeze({
      userId: uid,
      seat: member.seat,
      seatOrder: idx + 1,
      isDealer: false,
      bet: 0,
      betLocked: false,
      decision: 'PENDING',
    });
  });

  // A06: Draw order is clockwise players, dealer last
  const drawTurnOrder = Object.freeze([...settlementOrder, dealerId]);

  const round: RoundState = Object.freeze({
    roundId,
    sequence: nextSeq,
    rulesVersion: '1.0',
    dealerId,
    dealerRoundsCompletedBefore: dealerRoundsCompleted,
    phase: 'ROUND_SETUP',
    deadlineMs: nowMs + state.rules.timeoutsSec.roundSetup * 1000,
    udegLimit: 0,
    udegRemaining: 0,
    settlementOrder,
    drawTurnOrder,
    activeDrawTurnIndex: 0,
    players: Object.freeze(players),
    reveals: Object.freeze({}),
    settlements: Object.freeze([]),
    dealerDelta: 0,
    settledAtMs: null,
    cancelledReason: null,
  });

  return Object.freeze({
    ...state,
    phase: 'ROUND_SETUP',
    stateVersion: state.stateVersion + 1,
    dealerId,
    dealerRoundsCompleted,
    roundSequence: nextSeq,
    members: Object.freeze(updatedMembers),
    currentRound: round,
    privateRound: null,
  });
}

function finalizeRevealAndSettlement(
  state: AuthoritativeRoomState,
  round: RoundState,
  privateRound: PrivateRoundData,
  nowMs: number
): AuthoritativeRoomState {
  const dealerMember = state.members.find((m) => m.userId === round.dealerId)!;
  const dealerTiles = privateRound.hands[round.dealerId]!;

  const playersInOrder = round.settlementOrder.map((uid, idx) => {
    const member = state.members.find((m) => m.userId === uid)!;
    const rp = round.players[uid]!;
    return {
      playerId: uid,
      seatOrder: idx + 1,
      bet: rp.bet,
      startingBalance: member.balance,
      tiles: privateRound.hands[uid]!,
    };
  });

  const settled = settleRound({
    roundId: round.roundId,
    dealerId: round.dealerId,
    dealerStartingBalance: dealerMember.balance,
    dealerTiles,
    udegLimit: round.udegLimit,
    playersInOrder,
    rules: state.rules,
  });

  const reveals: Record<string, RoundRevealEntry> = {
    [round.dealerId]: Object.freeze({
      userId: round.dealerId,
      tiles: dealerTiles,
      evaluatedHand: settled.dealerHand,
    }),
  };

  for (const uid of round.settlementOrder) {
    reveals[uid] = Object.freeze({
      userId: uid,
      tiles: privateRound.hands[uid]!,
      evaluatedHand: settled.playerHands[uid]!,
    });
  }

  // Apply final balances & release reservedBet atomically (T29)
  const nextMembers = state.members.map((m) => {
    if (m.userId === round.dealerId) {
      return Object.freeze({
        ...m,
        balance: settled.dealerFinalBalance,
        reservedBet: 0,
      });
    }
    const finalBal = settled.playerFinalBalances[m.userId];
    if (finalBal !== undefined) {
      return Object.freeze({
        ...m,
        balance: finalBal,
        reservedBet: 0,
      });
    }
    return m;
  });

  const rotation = computeNextDealer({
    members: nextMembers,
    currentDealerId: round.dealerId,
    dealerRoundsCompleted: state.dealerRoundsCompleted,
    roundCancelled: false,
    rules: state.rules,
  });

  // Track completed Bandar turns for ONE_CYCLE mode (all participants serve as Bandar once)
  const dealerFinishedTurn =
    rotation.rotated ||
    state.dealerRoundsCompleted + 1 >= state.rules.dealerRotationRounds ||
    rotation.shouldFinish;

  const nextDealersServed =
    dealerFinishedTurn && !state.dealersServed.includes(round.dealerId)
      ? Object.freeze([...state.dealersServed, round.dealerId])
      : state.dealersServed;

  const eligibleAfter = nextMembers.filter(
    (m) => m.status !== 'LEFT' && !m.pendingLeave && m.balance >= state.rules.betStep
  );
  const allEligibleServed =
    state.sessionMode === 'ONE_CYCLE' &&
    eligibleAfter.every((m) => nextDealersServed.includes(m.userId));

  const nextPhase =
    rotation.shouldFinish || allEligibleServed ? 'FINISHED' : 'NEXT_ROUND';

  const completedRound: RoundState = Object.freeze({
    ...round,
    phase: nextPhase,
    deadlineMs: null,
    udegRemaining: settled.udegRemaining,
    reveals: Object.freeze(reveals),
    settlements: settled.settlements,
    dealerDelta: settled.dealerDelta,
    settledAtMs: nowMs,
  });

  const summary = Object.freeze({
    roundId: round.roundId,
    sequence: round.sequence,
    dealerId: round.dealerId,
    udegLimit: round.udegLimit,
    udegRemaining: settled.udegRemaining,
    dealerDelta: settled.dealerDelta,
    cancelled: false,
    settlements: settled.settlements,
  });

  return Object.freeze({
    ...state,
    phase: nextPhase,
    stateVersion: state.stateVersion + 1,
    dealerId: rotation.nextDealerId ?? state.dealerId,
    dealerRoundsCompleted: rotation.nextDealerRoundsCompleted,
    dealersServed: nextDealersServed,
    members: Object.freeze(nextMembers),
    currentRound: completedRound,
    privateRound,
    ledger: Object.freeze([...state.ledger, ...settled.ledgerEntries]),
    roundHistory: Object.freeze([summary, ...state.roundHistory]),
  });
}

function cancelRoundBeforeReveal(
  state: AuthoritativeRoomState,
  reason: string,
  nowMs: number
): AuthoritativeRoomState {
  const round = state.currentRound!;
  // Release all reserved bets; balances untouched (T36)
  const releasedMembers = state.members.map((m) =>
    m.reservedBet > 0 ? Object.freeze({ ...m, reservedBet: 0 }) : m
  );

  // Rotation counter does NOT increment on cancelled round (T36)
  const rotation = computeNextDealer({
    members: releasedMembers,
    currentDealerId: round.dealerId,
    dealerRoundsCompleted: state.dealerRoundsCompleted,
    roundCancelled: true,
    rules: state.rules,
  });

  const nextPhase = rotation.shouldFinish ? 'FINISHED' : 'NEXT_ROUND';

  const cancelledRound: RoundState = Object.freeze({
    ...round,
    phase: nextPhase,
    deadlineMs: null,
    settledAtMs: nowMs,
    cancelledReason: reason,
  });

  const summary = Object.freeze({
    roundId: round.roundId,
    sequence: round.sequence,
    dealerId: round.dealerId,
    udegLimit: round.udegLimit,
    udegRemaining: round.udegLimit,
    dealerDelta: 0,
    cancelled: true,
    settlements: Object.freeze([]),
  });

  return Object.freeze({
    ...state,
    phase: nextPhase,
    stateVersion: state.stateVersion + 1,
    dealerId: rotation.nextDealerId ?? state.dealerId,
    dealerRoundsCompleted: rotation.nextDealerRoundsCompleted,
    members: Object.freeze(releasedMembers),
    currentRound: cancelledRound,
    privateRound: null,
    roundHistory: Object.freeze([summary, ...state.roundHistory]),
  });
}

export function reduceGameAction(
  state: AuthoritativeRoomState,
  actorId: string,
  action: GameAction,
  options: ReducerOptions = {}
): ActionResult {
  if (!actorId) {
    return reject(action, state, 'UNAUTHENTICATED', 'Identitas pengguna diperlukan.');
  }
  if (action.roomId !== state.roomId) {
    return reject(action, state, 'FORBIDDEN', 'Room tidak cocok.');
  }

  // 1. Check idempotency receipt BEFORE expectedVersion (T17, T34)
  const receiptKey = `${actorId}:${action.actionId}`;
  const existingReceipt = state.receipts[receiptKey];
  if (existingReceipt) {
    const incomingHash = stablePayloadHash(action);
    if (existingReceipt.payloadHash !== incomingHash) {
      return reject(
        action,
        state,
        'ACTION_ID_CONFLICT',
        'actionId sudah dipakai dengan payload berbeda.'
      );
    }
    return accept(action, actorId, state, true);
  }

  // 2. Check optimistic concurrency version (T20)
  if (action.expectedVersion !== state.stateVersion) {
    return reject(
      action,
      state,
      'STALE_VERSION',
      `Versi state berubah (server v${state.stateVersion}, dikirim v${action.expectedVersion}).`
    );
  }

  const nowMs = options.nowMs ?? action.payload.nowMs ?? Date.now();
  const shuffler = options.deckShuffler ?? ((d: readonly Tile[]) => cryptoShuffle(d));
  const roundIdFactory =
    options.roundIdFactory ?? ((seq: number) => `${state.roomId}-r${seq}`);

  // 3. JOIN_ROOM (allowed in LOBBY or mid-round as WAITING_NEXT_ROUND per T35)
  if (action.type === 'JOIN_ROOM') {
    if (state.phase === 'FINISHED') {
      return reject(action, state, 'WRONG_PHASE', 'Sesi sudah berakhir.');
    }
    const existing = state.members.find((m) => m.userId === actorId && m.status !== 'LEFT');
    if (existing) {
      return reject(action, state, 'ALREADY_DECIDED', 'Sudah tergabung di room.');
    }
    const activeSeats = state.members.filter((m) => m.status !== 'LEFT');
    const maxTotal = state.rules.maxPlayers + 1; // dealer + maxPlayers
    if (activeSeats.length >= maxTotal) {
      return reject(action, state, 'FORBIDDEN', 'Meja sudah penuh.');
    }
    const usedSeats = new Set(activeSeats.map((m) => m.seat));
    let nextSeat = 0;
    while (usedSeats.has(nextSeat)) nextSeat += 1;

    const newMember: RoomMember = Object.freeze({
      userId: actorId,
      displayName: (action.payload.displayName ?? `Pemain ${nextSeat + 1}`).trim().slice(0, 24),
      seat: nextSeat,
      balance: state.rules.startingBalance,
      reservedBet: 0,
      ready: Boolean(action.payload.isBot),
      status: state.phase === 'LOBBY' ? 'ACTIVE' : 'WAITING_NEXT_ROUND',
      isBot: Boolean(action.payload.isBot),
    });

    const nextState: AuthoritativeRoomState = Object.freeze({
      ...state,
      stateVersion: state.stateVersion + 1,
      members: Object.freeze([...state.members, newMember]),
    });
    return accept(action, actorId, nextState);
  }

  // Must be an active room member for all other actions (except TIMEOUT_TICK by host/system)
  const member = state.members.find((m) => m.userId === actorId && m.status !== 'LEFT');
  if (!member && action.type !== 'TIMEOUT_TICK') {
    return reject(action, state, 'FORBIDDEN', 'Bukan anggota room.');
  }

  // 4. LEAVE_ROOM (immediate in LOBBY, queued to round boundary mid-round per A08)
  if (action.type === 'LEAVE_ROOM') {
    const nextMembers = state.members.map((m) => {
      if (m.userId !== actorId) return m;
      if (state.phase === 'LOBBY' || state.phase === 'NEXT_ROUND' || state.phase === 'FINISHED') {
        return Object.freeze({ ...m, status: 'LEFT' as const, pendingLeave: false });
      }
      return Object.freeze({ ...m, pendingLeave: true });
    });
    const nextState: AuthoritativeRoomState = Object.freeze({
      ...state,
      stateVersion: state.stateVersion + 1,
      members: Object.freeze(nextMembers),
    });
    return accept(action, actorId, nextState);
  }

  // 5. READY (LOBBY only)
  if (action.type === 'READY') {
    if (state.phase !== 'LOBBY') {
      return reject(action, state, 'WRONG_PHASE', 'READY hanya berlaku di LOBBY.');
    }
    const nextReady = action.payload.ready ?? !member!.ready;
    const nextMembers = state.members.map((m) =>
      m.userId === actorId ? Object.freeze({ ...m, ready: nextReady }) : m
    );
    const nextState: AuthoritativeRoomState = Object.freeze({
      ...state,
      stateVersion: state.stateVersion + 1,
      members: Object.freeze(nextMembers),
    });
    return accept(action, actorId, nextState);
  }

  // 6. START (LOBBY -> ROUND_SETUP)
  if (action.type === 'START') {
    if (state.phase !== 'LOBBY') {
      return reject(action, state, 'WRONG_PHASE', 'Permainan sudah dimulai.');
    }
    if (actorId !== state.hostId) {
      return reject(action, state, 'FORBIDDEN', 'Hanya host yang dapat memulai permainan.');
    }
    const activeMembers = state.members.filter((m) => m.status === 'ACTIVE');
    if (activeMembers.length < 2) {
      return reject(action, state, 'INVALID_STATE', 'Minimal 2 peserta untuk memulai.');
    }
    if (!activeMembers.every((m) => m.ready)) {
      return reject(action, state, 'INVALID_STATE', 'Semua peserta harus siap terlebih dahulu.');
    }

    let initialDealerId = state.hostId;
    if (state.randomizeInitialDealer) {
      const buf = new Uint32Array(1);
      globalThis.crypto.getRandomValues(buf);
      const picked = activeMembers[buf[0]! % activeMembers.length];
      if (picked) {
        initialDealerId = picked.userId;
      }
    }

    const nextState = createRoundSetupState(
      state,
      initialDealerId,
      0,
      nowMs,
      roundIdFactory
    );
    return accept(action, actorId, nextState);
  }

  // 7. SET_UDEG (ROUND_SETUP -> FIRST_DEAL -> BETTING)
  if (action.type === 'SET_UDEG') {
    if (state.phase !== 'ROUND_SETUP' || !state.currentRound) {
      return reject(action, state, 'WRONG_PHASE', 'Udeg hanya ditetapkan saat ROUND_SETUP.');
    }
    if (action.roundId !== state.currentRound.roundId) {
      return reject(action, state, 'WRONG_PHASE', 'roundId tidak cocok.');
    }
    if (actorId !== state.currentRound.dealerId) {
      return reject(action, state, 'FORBIDDEN', 'Hanya bandar yang menetapkan Udeg.');
    }

    const amount = action.payload.amount;
    if (
      amount === undefined ||
      !isValidUdegAmount(amount, member!.balance, state.rules)
    ) {
      return reject(
        action,
        state,
        'INVALID_UDEG',
        'Udeg harus kelipatan Rp10.000, minimal Rp10.000, dan tidak melebihi saldo bandar.'
      );
    }

    // Backend shuffles 28 tiles & deals 1st card to dealer + all active players (FIRST_DEAL -> BETTING)
    const shuffled = shuffler(createDeck());
    const dealOrder = [state.currentRound.dealerId, ...state.currentRound.settlementOrder];
    let cursor = 0;
    const hands: Record<string, readonly Tile[]> = {};
    for (const uid of dealOrder) {
      const { dealt, nextCursor } = dealFromDeck(shuffled, cursor, 1);
      hands[uid] = dealt;
      cursor = nextCursor;
    }

    const privateRound: PrivateRoundData = Object.freeze({
      roundId: state.currentRound.roundId,
      orderedDeck: shuffled,
      cursor,
      hands: Object.freeze(hands),
    });

    const nextRound: RoundState = Object.freeze({
      ...state.currentRound,
      phase: 'BETTING',
      udegLimit: amount,
      udegRemaining: amount,
      deadlineMs: nowMs + state.rules.timeoutsSec.betting * 1000,
    });

    const nextState: AuthoritativeRoomState = Object.freeze({
      ...state,
      phase: 'BETTING',
      stateVersion: state.stateVersion + 1,
      currentRound: nextRound,
      privateRound,
    });
    return accept(action, actorId, nextState);
  }

  // 8. PLACE_BET (BETTING -> SECOND_DEAL -> DRAW_DECISION once all players locked)
  if (action.type === 'PLACE_BET') {
    if (state.phase !== 'BETTING' || !state.currentRound || !state.privateRound) {
      return reject(action, state, 'WRONG_PHASE', 'Taruhan hanya bisa dipasang pada fase BETTING.');
    }
    if (action.roundId !== state.currentRound.roundId) {
      return reject(action, state, 'WRONG_PHASE', 'roundId tidak cocok.');
    }
    const rp = state.currentRound.players[actorId];
    if (!rp || rp.isDealer) {
      return reject(action, state, 'FORBIDDEN', 'Bandar tidak memasang taruhan melawan dirinya sendiri.');
    }
    if (rp.betLocked) {
      return reject(action, state, 'ALREADY_DECIDED', 'Taruhan sudah dikunci.');
    }

    const amount = action.payload.amount;
    if (amount === undefined || !Number.isSafeInteger(amount) || amount < state.rules.betStep || amount % state.rules.betStep !== 0) {
      return reject(action, state, 'INVALID_BET', 'Taruhan harus bilangan bulat positif kelipatan Rp10.000.');
    }

    const availableBalance = member!.balance - member!.reservedBet;
    if (amount > availableBalance) {
      return reject(action, state, 'INSUFFICIENT_BALANCE', 'Saldo tersedia tidak mencukupi.');
    }

    // Reserve bet without debiting book balance (T29)
    const nextMembers = state.members.map((m) =>
      m.userId === actorId
        ? Object.freeze({ ...m, reservedBet: m.reservedBet + amount })
        : m
    );

    const nextPlayers: Record<string, RoundPlayerState> = {
      ...state.currentRound.players,
      [actorId]: Object.freeze({
        ...rp,
        bet: amount,
        betLocked: true,
      }),
    };

    const allLocked = state.currentRound.settlementOrder.every(
      (uid) => nextPlayers[uid]!.betLocked
    );

    if (!allLocked) {
      const nextRound: RoundState = Object.freeze({
        ...state.currentRound,
        players: Object.freeze(nextPlayers),
      });
      const nextState: AuthoritativeRoomState = Object.freeze({
        ...state,
        stateVersion: state.stateVersion + 1,
        members: Object.freeze(nextMembers),
        currentRound: nextRound,
      });
      return accept(action, actorId, nextState);
    }

    // All bets locked -> SECOND_DEAL -> DRAW_DECISION
    const dealOrder = [state.currentRound.dealerId, ...state.currentRound.settlementOrder];
    let cursor = state.privateRound.cursor;
    const nextHands: Record<string, readonly Tile[]> = { ...state.privateRound.hands };
    for (const uid of dealOrder) {
      const { dealt, nextCursor } = dealFromDeck(state.privateRound.orderedDeck, cursor, 1);
      nextHands[uid] = Object.freeze([...(nextHands[uid] ?? []), ...dealt]);
      cursor = nextCursor;
    }

    const nextPrivateRound: PrivateRoundData = Object.freeze({
      ...state.privateRound,
      cursor,
      hands: Object.freeze(nextHands),
    });

    const nextRound: RoundState = Object.freeze({
      ...state.currentRound,
      phase: 'DRAW_DECISION',
      deadlineMs: nowMs + state.rules.timeoutsSec.drawDecision * 1000,
      activeDrawTurnIndex: 0,
      players: Object.freeze(nextPlayers),
    });

    const nextState: AuthoritativeRoomState = Object.freeze({
      ...state,
      phase: 'DRAW_DECISION',
      stateVersion: state.stateVersion + 1,
      members: Object.freeze(nextMembers),
      currentRound: nextRound,
      privateRound: nextPrivateRound,
    });
    return accept(action, actorId, nextState);
  }

  // 9. STOP / DRAW (DRAW_DECISION -> REVEAL -> SETTLEMENT -> NEXT_ROUND/FINISHED)
  if (action.type === 'STOP' || action.type === 'DRAW') {
    if (state.phase !== 'DRAW_DECISION' || !state.currentRound || !state.privateRound) {
      return reject(action, state, 'WRONG_PHASE', 'Keputusan Stop/Draw hanya saat DRAW_DECISION.');
    }
    if (action.roundId !== state.currentRound.roundId) {
      return reject(action, state, 'WRONG_PHASE', 'roundId tidak cocok.');
    }
    const rp = state.currentRound.players[actorId];
    if (!rp) {
      return reject(action, state, 'FORBIDDEN', 'Anda tidak bermain pada ronde ini.');
    }
    if (rp.decision !== 'PENDING') {
      return reject(action, state, 'ALREADY_DECIDED', 'Keputusan Anda sudah final.');
    }
    const activeTurnUser = state.currentRound.drawTurnOrder[state.currentRound.activeDrawTurnIndex];
    if (activeTurnUser !== actorId) {
      return reject(action, state, 'NOT_YOUR_TURN', 'Belum giliran Anda untuk Stop/Draw.');
    }

    let nextPrivateRound = state.privateRound;
    if (action.type === 'DRAW') {
      const currentHand = state.privateRound.hands[actorId] ?? [];
      if (currentHand.length >= state.rules.maxHandSize) {
        return reject(action, state, 'ALREADY_DECIDED', 'Maksimal 3 kartu.');
      }
      const { dealt, nextCursor } = dealFromDeck(
        state.privateRound.orderedDeck,
        state.privateRound.cursor,
        1
      );
      nextPrivateRound = Object.freeze({
        ...state.privateRound,
        cursor: nextCursor,
        hands: Object.freeze({
          ...state.privateRound.hands,
          [actorId]: Object.freeze([...currentHand, ...dealt]),
        }),
      });
    }

    const nextPlayers: Record<string, RoundPlayerState> = {
      ...state.currentRound.players,
      [actorId]: Object.freeze({
        ...rp,
        decision: action.type,
      }),
    };

    const nextTurnIndex = state.currentRound.activeDrawTurnIndex + 1;
    const allDecided = nextTurnIndex >= state.currentRound.drawTurnOrder.length;

    const updatedRound: RoundState = Object.freeze({
      ...state.currentRound,
      activeDrawTurnIndex: nextTurnIndex,
      deadlineMs: allDecided
        ? null
        : nowMs + state.rules.timeoutsSec.drawDecision * 1000,
      players: Object.freeze(nextPlayers),
    });

    if (!allDecided) {
      const nextState: AuthoritativeRoomState = Object.freeze({
        ...state,
        stateVersion: state.stateVersion + 1,
        currentRound: updatedRound,
        privateRound: nextPrivateRound,
      });
      return accept(action, actorId, nextState);
    }

    // All participants decided -> REVEAL + SETTLEMENT atomically -> NEXT_ROUND / FINISHED
    const settledState = finalizeRevealAndSettlement(
      state,
      updatedRound,
      nextPrivateRound,
      nowMs
    );
    return accept(action, actorId, settledState);
  }

  // 10. NEXT_ROUND (host or dealer advances from NEXT_ROUND -> ROUND_SETUP)
  if (action.type === 'NEXT_ROUND') {
    if (state.phase !== 'NEXT_ROUND') {
      return reject(action, state, 'WRONG_PHASE', 'Belum berada pada fase NEXT_ROUND.');
    }
    if (actorId !== state.hostId && actorId !== state.dealerId) {
      return reject(action, state, 'FORBIDDEN', 'Hanya host atau bandar yang dapat melanjutkan ronde.');
    }
    const nextState = createRoundSetupState(
      state,
      state.dealerId,
      state.dealerRoundsCompleted,
      nowMs,
      roundIdFactory
    );
    return accept(action, actorId, nextState);
  }

  // 11. TIMEOUT_TICK (A07: Draw timeout => STOP; Setup/Betting timeout => cancel round without auto-bet)
  if (action.type === 'TIMEOUT_TICK') {
    if (!state.currentRound || state.currentRound.deadlineMs === null) {
      return reject(action, state, 'WRONG_PHASE', 'Tidak ada deadline aktif.');
    }
    if (nowMs < state.currentRound.deadlineMs) {
      return reject(action, state, 'INVALID_STATE', 'Deadline belum terlewati.');
    }

    if (state.phase === 'ROUND_SETUP' || state.phase === 'BETTING') {
      const cancelled = cancelRoundBeforeReveal(
        state,
        state.phase === 'ROUND_SETUP' ? 'TIMEOUT_UDEG' : 'TIMEOUT_BETTING',
        nowMs
      );
      return accept(action, actorId, cancelled);
    }

    if (state.phase === 'DRAW_DECISION' && state.privateRound) {
      const activeUserId =
        state.currentRound.drawTurnOrder[state.currentRound.activeDrawTurnIndex]!;
      const rp = state.currentRound.players[activeUserId]!;
      const nextPlayers: Record<string, RoundPlayerState> = {
        ...state.currentRound.players,
        [activeUserId]: Object.freeze({ ...rp, decision: 'STOP' }),
      };
      const nextTurnIndex = state.currentRound.activeDrawTurnIndex + 1;
      const allDecided = nextTurnIndex >= state.currentRound.drawTurnOrder.length;
      const updatedRound: RoundState = Object.freeze({
        ...state.currentRound,
        activeDrawTurnIndex: nextTurnIndex,
        deadlineMs: allDecided
          ? null
          : nowMs + state.rules.timeoutsSec.drawDecision * 1000,
        players: Object.freeze(nextPlayers),
      });

      if (!allDecided) {
        const nextState: AuthoritativeRoomState = Object.freeze({
          ...state,
          stateVersion: state.stateVersion + 1,
          currentRound: updatedRound,
        });
        return accept(action, actorId, nextState);
      }

      const settledState = finalizeRevealAndSettlement(
        state,
        updatedRound,
        state.privateRound,
        nowMs
      );
      return accept(action, actorId, settledState);
    }

    return reject(action, state, 'WRONG_PHASE', 'Timeout tidak berlaku pada fase ini.');
  }

  return reject(action, state, 'INVALID_STATE', 'Aksi tidak dikenal.');
}
