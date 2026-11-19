import {
  createInitialRoom,
  evaluateHand,
  projectSafeSnapshot,
  reduceGameAction,
  type ActionResult,
  type AuthoritativeRoomState,
  type GameAction,
  type SafeRoomSnapshot,
} from '../domain';

const BOT_NAMES = ['Wayan', 'Made', 'Nyoman', 'Ketut', 'Putu'] as const;

export interface LocalGameConfig {
  readonly playerName: string;
  readonly botCount: number; // 1..5
  readonly humanStartsAsDealer: boolean;
}

function makeActionId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Authoritative local runner that wraps the exact same pure `reduceGameAction`
 * used by the backend specification, plus AI bot decisions.
 */
export class LocalGameSession {
  private state: AuthoritativeRoomState;
  public readonly humanUserId: string;

  constructor(config: LocalGameConfig) {
    const botCount = Math.max(1, Math.min(5, Math.floor(config.botCount)));
    const roomId = `local-${Date.now()}`;
    const roomCode = 'LOKAL';

    if (config.humanStartsAsDealer) {
      this.humanUserId = 'human-1';
      this.state = createInitialRoom({
        roomId,
        roomCode,
        hostId: this.humanUserId,
        hostName: config.playerName || 'Anda',
        maxPlayers: botCount,
      });

      for (let i = 0; i < botCount; i += 1) {
        const res = reduceGameAction(this.state, `bot-${i + 1}`, {
          roomId,
          roundId: null,
          actionId: makeActionId('join'),
          expectedVersion: this.state.stateVersion,
          type: 'JOIN_ROOM',
          payload: { displayName: BOT_NAMES[i] ?? `Bot ${i + 1}`, isBot: true },
        });
        if (res.accepted) this.state = res.state;
      }
    } else {
      // Bot 1 is host/initial dealer, Human sits at seat 1 (first payment order!)
      this.humanUserId = 'human-1';
      this.state = createInitialRoom({
        roomId,
        roomCode,
        hostId: 'bot-1',
        hostName: BOT_NAMES[0],
        hostIsBot: true,
        maxPlayers: botCount,
      });

      const joinHuman = reduceGameAction(this.state, this.humanUserId, {
        roomId,
        roundId: null,
        actionId: makeActionId('join'),
        expectedVersion: this.state.stateVersion,
        type: 'JOIN_ROOM',
        payload: { displayName: config.playerName || 'Anda', isBot: false },
      });
      if (joinHuman.accepted) this.state = joinHuman.state;

      const readyHuman = reduceGameAction(this.state, this.humanUserId, {
        roomId,
        roundId: null,
        actionId: makeActionId('ready'),
        expectedVersion: this.state.stateVersion,
        type: 'READY',
        payload: { ready: true },
      });
      if (readyHuman.accepted) this.state = readyHuman.state;

      for (let i = 1; i < botCount; i += 1) {
        const res = reduceGameAction(this.state, `bot-${i + 1}`, {
          roomId,
          roundId: null,
          actionId: makeActionId('join'),
          expectedVersion: this.state.stateVersion,
          type: 'JOIN_ROOM',
          payload: { displayName: BOT_NAMES[i] ?? `Bot ${i + 1}`, isBot: true },
        });
        if (res.accepted) this.state = res.state;
      }
    }

    // Start immediately into ROUND_SETUP
    const startRes = reduceGameAction(this.state, this.state.hostId, {
      roomId,
      roundId: null,
      actionId: makeActionId('start'),
      expectedVersion: this.state.stateVersion,
      type: 'START',
      payload: {},
    });
    if (startRes.accepted) this.state = startRes.state;
  }

  public getSnapshot(): SafeRoomSnapshot {
    return projectSafeSnapshot(this.state, this.humanUserId);
  }

  public dispatchHumanAction(
    type: GameAction['type'],
    payload: GameAction['payload'] = {}
  ): ActionResult {
    const action: GameAction = {
      roomId: this.state.roomId,
      roundId: this.state.currentRound?.roundId ?? null,
      actionId: makeActionId(type.toLowerCase()),
      expectedVersion: this.state.stateVersion,
      type,
      payload,
    };
    const res = reduceGameAction(this.state, this.humanUserId, action);
    if (res.accepted) {
      this.state = res.state;
    }
    return res;
  }

  public advanceNextRound(): ActionResult {
    const actor =
      this.humanUserId === this.state.hostId || this.humanUserId === this.state.dealerId
        ? this.humanUserId
        : this.state.hostId;
    const action: GameAction = {
      roomId: this.state.roomId,
      roundId: this.state.currentRound?.roundId ?? null,
      actionId: makeActionId('next'),
      expectedVersion: this.state.stateVersion,
      type: 'NEXT_ROUND',
      payload: {},
    };
    const res = reduceGameAction(this.state, actor, action);
    if (res.accepted) {
      this.state = res.state;
    }
    return res;
  }

  public tickTimeoutIfExpired(): boolean {
    const round = this.state.currentRound;
    if (!round || round.deadlineMs === null || Date.now() < round.deadlineMs) {
      return false;
    }
    const res = reduceGameAction(this.state, this.state.hostId, {
      roomId: this.state.roomId,
      roundId: round.roundId,
      actionId: makeActionId('timeout'),
      expectedVersion: this.state.stateVersion,
      type: 'TIMEOUT_TICK',
      payload: { nowMs: Date.now() },
    });
    if (res.accepted) {
      this.state = res.state;
      return true;
    }
    return false;
  }

  /**
   * Executes ONE pending bot turn if it's currently a bot's responsibility.
   * Returns true if a bot acted.
   */
  public stepBot(): boolean {
    const round = this.state.currentRound;
    if (!round) return false;

    // 1. Bot dealer sets Udeg
    if (this.state.phase === 'ROUND_SETUP') {
      const dealer = this.state.members.find((m) => m.userId === round.dealerId);
      if (!dealer || !dealer.isBot) return false;

      const targetUdeg = Math.min(
        dealer.balance,
        Math.max(10_000, Math.floor((dealer.balance * 0.25) / 10_000) * 10_000)
      );
      const udegAmount = Math.min(dealer.balance, Math.max(50_000, targetUdeg));
      const clamped = Math.min(dealer.balance, Math.floor(udegAmount / 10_000) * 10_000);

      const res = reduceGameAction(this.state, dealer.userId, {
        roomId: this.state.roomId,
        roundId: round.roundId,
        actionId: makeActionId('bot-udeg'),
        expectedVersion: this.state.stateVersion,
        type: 'SET_UDEG',
        payload: { amount: Math.max(10_000, clamped) },
      });
      if (res.accepted) {
        this.state = res.state;
        return true;
      }
      return false;
    }

    // 2. Bot players lock their bets
    if (this.state.phase === 'BETTING') {
      for (const uid of round.settlementOrder) {
        const rp = round.players[uid];
        const member = this.state.members.find((m) => m.userId === uid);
        if (!rp || !member || !member.isBot || rp.betLocked) continue;

        const firstTile = this.state.privateRound?.hands[uid]?.[0];
        const pips = firstTile ? firstTile[0] + firstTile[1] : 6;
        const isDouble = firstTile ? firstTile[0] === firstTile[1] : false;
        const desired = isDouble ? 50_000 : pips >= 8 ? 40_000 : pips >= 5 ? 30_000 : 20_000;
        const avail = member.balance - member.reservedBet;
        const bet = Math.max(
          10_000,
          Math.min(avail, Math.floor(desired / 10_000) * 10_000)
        );

        const res = reduceGameAction(this.state, uid, {
          roomId: this.state.roomId,
          roundId: round.roundId,
          actionId: makeActionId('bot-bet'),
          expectedVersion: this.state.stateVersion,
          type: 'PLACE_BET',
          payload: { amount: bet },
        });
        if (res.accepted) {
          this.state = res.state;
          return true;
        }
      }
      return false;
    }

    // 3. Bot Stop/Draw on its active turn
    if (this.state.phase === 'DRAW_DECISION') {
      const activeUid = round.drawTurnOrder[round.activeDrawTurnIndex];
      if (!activeUid) return false;
      const member = this.state.members.find((m) => m.userId === activeUid);
      if (!member || !member.isBot) return false;

      const tiles = this.state.privateRound?.hands[activeUid] ?? [];
      let decision: 'STOP' | 'DRAW' = 'STOP';
      if (tiles.length === 2) {
        const eval2 = evaluateHand(tiles);
        const bothDoubles = tiles.every(([a, b]) => a === b);
        // Smart heuristic: chase Triple if holding 2 doubles, or draw if score <= 5
        if (bothDoubles || eval2.numericScore <= 5) {
          decision = 'DRAW';
        }
      }

      const res = reduceGameAction(this.state, activeUid, {
        roomId: this.state.roomId,
        roundId: round.roundId,
        actionId: makeActionId(`bot-${decision.toLowerCase()}`),
        expectedVersion: this.state.stateVersion,
        type: decision,
        payload: {},
      });
      if (res.accepted) {
        this.state = res.state;
        return true;
      }
      return false;
    }

    return false;
  }
}
