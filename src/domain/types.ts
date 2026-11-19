export type Tile = readonly [number, number]; // validated 0..6; canonical a <= b

export type GamePhase =
  | 'LOBBY'
  | 'ROUND_SETUP'
  | 'FIRST_DEAL'
  | 'BETTING'
  | 'SECOND_DEAL'
  | 'DRAW_DECISION'
  | 'REVEAL'
  | 'SETTLEMENT'
  | 'NEXT_ROUND'
  | 'FINISHED';

export type HandType = 'NORMAL' | 'TRIPLE';

export interface EvaluatedHand {
  readonly tiles: readonly Tile[];
  readonly numericScore: number; // 0..9
  readonly handType: HandType;
  readonly isPureNine: boolean;
  readonly rank: number; // 0..9 or 10 for Triple
}

export interface GameRules {
  readonly rulesVersion: '1.0';
  readonly maxPlayers: number; // integer 1..5, excludes dealer
  readonly startingBalance: 1000000;
  readonly betStep: 10000;
  readonly maxHandSize: 3;
  readonly dealerWinsTies: true;
  readonly playerNormalMultiplier: 1;
  readonly playerNineMultiplier: 2; // A02 / A03
  readonly playerTripleMultiplier: 3; // A02
  readonly dealerWinMultiplier: 1;
  readonly dealerRotationRounds: 3;
  readonly udegMode: 'FIXED';
  readonly udegShortfallPolicy: 'SKIP';
  readonly timeoutsSec: {
    readonly roundSetup: 60; // A07
    readonly betting: 45; // A07
    readonly drawDecision: 30; // A07
  };
}

export type SettlementOutcome = 'WIN' | 'LOSE'; // ties => LOSE
export type PaymentStatus = 'PAID' | 'COLLECTED' | 'SKIPPED_UDEG';

export interface RoundSettlement {
  readonly roundId: string;
  readonly playerId: string;
  readonly seatOrder: number;
  readonly bet: number;
  readonly outcome: SettlementOutcome;
  readonly multiplier: 1 | 2 | 3;
  readonly claim: number; // winner's entitlement; 0 when LOSE
  readonly paid: number; // dealer -> player only; 0 for LOSE / SKIP
  readonly loss: number; // player -> dealer; bet when LOSE, otherwise 0
  readonly balanceDelta: number; // paid - loss
  readonly paymentStatus: PaymentStatus;
  readonly udegBefore: number;
  readonly udegAfter: number;
}

export interface LedgerEntry {
  readonly id: string;
  readonly roundId: string;
  readonly participantId: string;
  readonly counterpartyId: string;
  readonly signedAmount: number;
  readonly kind: 'PAYOUT' | 'COLLECTION';
  readonly settlementKey: string;
}

export type GameActionType =
  | 'READY'
  | 'START'
  | 'SET_UDEG'
  | 'PLACE_BET'
  | 'STOP'
  | 'DRAW'
  | 'NEXT_ROUND'
  | 'JOIN_ROOM'
  | 'LEAVE_ROOM'
  | 'TIMEOUT_TICK';

export interface GameActionPayload {
  readonly amount?: number;
  readonly ready?: boolean;
  readonly displayName?: string;
  readonly isBot?: boolean;
  readonly nowMs?: number;
}

export interface GameAction {
  readonly roomId: string;
  readonly roundId: string | null; // null only for lobby/room-level actions
  readonly actionId: string; // stable UUID on retries
  readonly expectedVersion: number;
  readonly type: GameActionType;
  readonly payload: GameActionPayload;
}

export type ActionErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'WRONG_PHASE'
  | 'NOT_YOUR_TURN'
  | 'INVALID_BET'
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_UDEG'
  | 'STALE_VERSION'
  | 'ALREADY_DECIDED'
  | 'ACTION_ID_CONFLICT'
  | 'INVALID_STATE';

export type DrawDecision = 'PENDING' | 'STOP' | 'DRAW';
export type ParticipantStatus = 'ACTIVE' | 'WAITING_NEXT_ROUND' | 'LEFT' | 'BANKRUPT';
export type SessionMode = 'ENDLESS' | 'ONE_CYCLE';

export interface RoomMember {
  readonly userId: string;
  readonly displayName: string;
  readonly seat: number; // 0..5 clockwise
  readonly balance: number;
  readonly reservedBet: number;
  readonly ready: boolean;
  readonly status: ParticipantStatus;
  readonly isBot: boolean;
  readonly pendingLeave?: boolean;
}

export interface RoundPlayerState {
  readonly userId: string;
  readonly seat: number;
  readonly seatOrder: number; // 1..N payment order (0 for dealer)
  readonly isDealer: boolean;
  readonly bet: number; // 0 until locked (always 0 for dealer)
  readonly betLocked: boolean;
  readonly decision: DrawDecision;
}

export interface RoundRevealEntry {
  readonly userId: string;
  readonly tiles: readonly Tile[];
  readonly evaluatedHand: EvaluatedHand;
}

export interface RoundState {
  readonly roundId: string;
  readonly sequence: number;
  readonly rulesVersion: '1.0';
  readonly dealerId: string;
  readonly dealerRoundsCompletedBefore: number; // 0..2
  readonly phase: GamePhase;
  readonly deadlineMs: number | null;
  readonly udegLimit: number;
  readonly udegRemaining: number;
  readonly settlementOrder: readonly string[]; // player userIds clockwise after dealer
  readonly drawTurnOrder: readonly string[]; // players clockwise, dealer last (A06)
  readonly activeDrawTurnIndex: number;
  readonly players: Readonly<Record<string, RoundPlayerState>>;
  readonly reveals: Readonly<Record<string, RoundRevealEntry>>;
  readonly settlements: readonly RoundSettlement[];
  readonly dealerDelta: number;
  readonly settledAtMs: number | null;
  readonly cancelledReason: string | null;
}

export interface PrivateRoundData {
  readonly roundId: string;
  readonly orderedDeck: readonly Tile[];
  readonly cursor: number;
  readonly hands: Readonly<Record<string, readonly Tile[]>>;
}

export interface ActionReceipt {
  readonly actionId: string;
  readonly actorId: string;
  readonly payloadHash: string;
  readonly acceptedVersion: number;
  readonly phase: GamePhase;
  readonly accepted: true;
}

export interface AuthoritativeRoomState {
  readonly roomId: string;
  readonly roomCode: string;
  readonly hostId: string;
  readonly rules: GameRules;
  readonly sessionMode: SessionMode;
  readonly randomizeInitialDealer: boolean;
  readonly phase: GamePhase;
  readonly stateVersion: number;
  readonly dealerId: string;
  readonly dealerRoundsCompleted: number; // 0..3
  readonly dealersServed: readonly string[]; // userIds that finished their Bandar turn
  readonly roundSequence: number;
  readonly members: readonly RoomMember[];
  readonly currentRound: RoundState | null;
  readonly privateRound: PrivateRoundData | null;
  readonly receipts: Readonly<Record<string, ActionReceipt>>;
  readonly ledger: readonly LedgerEntry[];
  readonly roundHistory: readonly RoundSummary[];
}

export interface RoundSummary {
  readonly roundId: string;
  readonly sequence: number;
  readonly dealerId: string;
  readonly udegLimit: number;
  readonly udegRemaining: number;
  readonly dealerDelta: number;
  readonly cancelled: boolean;
  readonly settlements: readonly RoundSettlement[];
}

/**
 * Safe projection sent to a specific viewer.
 * NEVER contains full deck or opponent tiles prior to REVEAL (T18).
 */
export interface SafeRoomSnapshot {
  readonly roomId: string;
  readonly roomCode: string;
  readonly hostId: string;
  readonly rules: GameRules;
  readonly sessionMode: SessionMode;
  readonly phase: GamePhase;
  readonly stateVersion: number;
  readonly dealerId: string;
  readonly dealerRoundsCompleted: number;
  readonly dealersServed: readonly string[];
  readonly roundSequence: number;
  readonly members: readonly RoomMember[];
  readonly currentRound: RoundState | null;
  readonly myTiles: readonly Tile[];
  readonly handCounts: Readonly<Record<string, number>>;
  readonly roundHistory: readonly RoundSummary[];
}

export type ActionResult =
  | {
      readonly accepted: true;
      readonly actionId: string;
      readonly stateVersion: number;
      readonly phase: GamePhase;
      readonly replayed: boolean;
      readonly state: AuthoritativeRoomState;
      readonly snapshot: SafeRoomSnapshot;
    }
  | {
      readonly accepted: false;
      readonly actionId: string;
      readonly code: ActionErrorCode;
      readonly currentVersion: number;
      readonly message: string;
    };
