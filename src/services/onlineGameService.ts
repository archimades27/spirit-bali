import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  createInitialRoom,
  evaluateHand,
  projectSafeSnapshot,
  reduceGameAction,
  type AuthoritativeRoomState,
  type GameAction,
  type GameActionPayload,
  type SafeRoomSnapshot,
} from '../domain';
import { getSupabaseClient } from './supabaseClient';

const BOT_NAMES = ['Wayan', 'Made', 'Nyoman', 'Ketut', 'Putu'] as const;

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

interface BroadcastEnvelope {
  readonly kind: 'JOIN_REQ' | 'ACTION_REQ' | 'RESYNC_REQ' | 'SNAPSHOT' | 'ACTION_ERR';
  readonly senderId: string;
  readonly targetId?: string;
  readonly displayName?: string;
  readonly action?: GameAction;
  readonly snapshot?: SafeRoomSnapshot;
  readonly error?: string;
}

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => chars[b % chars.length]).join('');
}

export interface OnlineSessionCallbacks {
  readonly onSnapshot: (snapshot: SafeRoomSnapshot) => void;
  readonly onConnectionChange: (state: ConnectionState) => void;
  readonly onError: (message: string) => void;
}

/**
 * Online Multiplayer Session over Supabase Realtime Broadcast.
 * - Host holds authoritative `AuthoritativeRoomState` and runs `reduceGameAction`.
 * - Every broadcast sends viewer-specific `projectSafeSnapshot(state, memberId)` so
 *   opponent tiles and the deck are never exposed prior to REVEAL.
 */
export class OnlineRoomSession {
  public readonly userId: string;
  public readonly roomCode: string;
  public readonly isHost: boolean;

  private channel: RealtimeChannel | null = null;
  private hostState: AuthoritativeRoomState | null = null;
  private latestSnapshot: SafeRoomSnapshot | null = null;
  private readonly displayName: string;
  private readonly callbacks: OnlineSessionCallbacks;
  private botCounter = 0;

  constructor(params: {
    readonly roomCode: string;
    readonly displayName: string;
    readonly isHost: boolean;
    readonly maxPlayers?: number;
    readonly callbacks: OnlineSessionCallbacks;
  }) {
    this.userId = makeId('usr');
    this.roomCode = params.roomCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    this.displayName = params.displayName.trim().slice(0, 24) || 'Pemain';
    this.isHost = params.isHost;
    this.callbacks = params.callbacks;

    if (this.isHost) {
      this.hostState = createInitialRoom({
        roomId: `sb-${this.roomCode}`,
        roomCode: this.roomCode,
        hostId: this.userId,
        hostName: this.displayName,
        maxPlayers: params.maxPlayers ?? 5,
        sessionMode: 'ONE_CYCLE',
        randomizeInitialDealer: true,
      });
      this.latestSnapshot = projectSafeSnapshot(this.hostState, this.userId);
    }
  }

  public async connect(): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      this.callbacks.onError('Supabase belum dikonfigurasi.');
      return;
    }

    this.callbacks.onConnectionChange('connecting');
    const channel = supabase.channel(`spirit-bali-room-${this.roomCode}`, {
      config: {
        broadcast: { self: false, ack: false },
      },
    });
    this.channel = channel;

    channel.on('broadcast', { event: 'spirit' }, ({ payload }) => {
      this.handleMessage(payload as BroadcastEnvelope);
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        this.callbacks.onConnectionChange('connected');
        if (this.isHost && this.hostState) {
          this.latestSnapshot = projectSafeSnapshot(this.hostState, this.userId);
          this.callbacks.onSnapshot(this.latestSnapshot);
        } else {
          this.send({
            kind: 'JOIN_REQ',
            senderId: this.userId,
            displayName: this.displayName,
          });
        }
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this.callbacks.onConnectionChange('disconnected');
      }
    });
  }

  public disconnect(): void {
    if (this.channel) {
      const supabase = getSupabaseClient();
      if (supabase) {
        void supabase.removeChannel(this.channel);
      }
      this.channel = null;
    }
  }

  public getSnapshot(): SafeRoomSnapshot | null {
    return this.latestSnapshot;
  }

  public addBot(): void {
    if (!this.isHost || !this.hostState || this.hostState.phase !== 'LOBBY') return;
    this.botCounter += 1;
    const botId = `bot-${this.botCounter}`;
    const name = BOT_NAMES[(this.botCounter - 1) % BOT_NAMES.length] ?? `Bot ${this.botCounter}`;
    this.applyHostAction(botId, {
      roomId: this.hostState.roomId,
      roundId: null,
      actionId: makeId('add-bot'),
      expectedVersion: this.hostState.stateVersion,
      type: 'JOIN_ROOM',
      payload: { displayName: `${name} (Bot)`, isBot: true },
    });
  }

  public dispatchAction(
    type: GameAction['type'],
    payload: GameActionPayload = {}
  ): string | null {
    const snap = this.latestSnapshot;
    if (!snap) return 'Belum terhubung ke room.';

    const action: GameAction = {
      roomId: snap.roomId,
      roundId: snap.currentRound?.roundId ?? null,
      actionId: makeId(type.toLowerCase()),
      expectedVersion: snap.stateVersion,
      type,
      payload,
    };

    if (this.isHost) {
      return this.applyHostAction(this.userId, action);
    }

    this.send({
      kind: 'ACTION_REQ',
      senderId: this.userId,
      action,
    });
    return null;
  }

  public requestResync(): void {
    if (!this.isHost) {
      this.send({ kind: 'RESYNC_REQ', senderId: this.userId });
    }
  }

  public stepBot(): boolean {
    if (!this.isHost || !this.hostState) return false;
    const state = this.hostState;
    const round = state.currentRound;
    if (!round) return false;

    if (state.phase === 'ROUND_SETUP') {
      const dealer = state.members.find((m) => m.userId === round.dealerId);
      if (!dealer || !dealer.isBot) return false;
      const ratios = [0.2, 0.25, 0.3] as const;
      const ratio = ratios[round.sequence % ratios.length] ?? 0.25;
      const raw = Math.floor((dealer.balance * ratio) / 10_000) * 10_000;
      const udegAmount = Math.max(10_000, Math.min(dealer.balance, raw));
      return (
        this.applyHostAction(dealer.userId, {
          roomId: state.roomId,
          roundId: round.roundId,
          actionId: makeId('bot-udeg'),
          expectedVersion: state.stateVersion,
          type: 'SET_UDEG',
          payload: { amount: udegAmount },
        }) === null
      );
    }

    if (state.phase === 'BETTING') {
      for (const uid of round.settlementOrder) {
        const rp = round.players[uid];
        const member = state.members.find((m) => m.userId === uid);
        if (!rp || !member || !member.isBot || rp.betLocked) continue;

        const firstTile = state.privateRound?.hands[uid]?.[0];
        const pips = firstTile ? firstTile[0] + firstTile[1] : 6;
        const isDouble = firstTile ? firstTile[0] === firstTile[1] : false;
        const desired = isDouble ? 50_000 : pips >= 8 ? 40_000 : pips >= 5 ? 30_000 : 20_000;
        const avail = member.balance - member.reservedBet;
        const bet = Math.max(10_000, Math.min(avail, Math.floor(desired / 10_000) * 10_000));

        return (
          this.applyHostAction(uid, {
            roomId: state.roomId,
            roundId: round.roundId,
            actionId: makeId('bot-bet'),
            expectedVersion: state.stateVersion,
            type: 'PLACE_BET',
            payload: { amount: bet },
          }) === null
        );
      }
      return false;
    }

    if (state.phase === 'DRAW_DECISION') {
      const activeUid = round.drawTurnOrder[round.activeDrawTurnIndex];
      if (!activeUid) return false;
      const member = state.members.find((m) => m.userId === activeUid);
      if (!member || !member.isBot) return false;

      const tiles = state.privateRound?.hands[activeUid] ?? [];
      let decision: 'STOP' | 'DRAW' = 'STOP';
      if (tiles.length === 2) {
        const eval2 = evaluateHand(tiles);
        const bothDoubles = tiles.every(([a, b]) => a === b);
        if (bothDoubles || eval2.numericScore <= 5) {
          decision = 'DRAW';
        }
      }

      return (
        this.applyHostAction(activeUid, {
          roomId: state.roomId,
          roundId: round.roundId,
          actionId: makeId(`bot-${decision.toLowerCase()}`),
          expectedVersion: state.stateVersion,
          type: decision,
          payload: {},
        }) === null
      );
    }

    return false;
  }

  public tickTimeoutIfExpired(): boolean {
    if (!this.isHost || !this.hostState) return false;
    const round = this.hostState.currentRound;
    if (!round || round.deadlineMs === null || Date.now() < round.deadlineMs) return false;
    return (
      this.applyHostAction(this.userId, {
        roomId: this.hostState.roomId,
        roundId: round.roundId,
        actionId: makeId('timeout'),
        expectedVersion: this.hostState.stateVersion,
        type: 'TIMEOUT_TICK',
        payload: { nowMs: Date.now() },
      }) === null
    );
  }

  private handleMessage(msg: BroadcastEnvelope): void {
    if (this.isHost && this.hostState) {
      if (msg.kind === 'JOIN_REQ') {
        const already = this.hostState.members.some(
          (m) => m.userId === msg.senderId && m.status !== 'LEFT'
        );
        if (already) {
          this.broadcastSnapshots();
          return;
        }
        const err = this.applyHostAction(msg.senderId, {
          roomId: this.hostState.roomId,
          roundId: null,
          actionId: makeId('join'),
          expectedVersion: this.hostState.stateVersion,
          type: 'JOIN_ROOM',
          payload: { displayName: msg.displayName ?? 'Pemain', isBot: false },
        });
        if (err) {
          this.send({
            kind: 'ACTION_ERR',
            senderId: this.userId,
            targetId: msg.senderId,
            error: err,
          });
        }
        return;
      }

      if (msg.kind === 'RESYNC_REQ') {
        this.send({
          kind: 'SNAPSHOT',
          senderId: this.userId,
          targetId: msg.senderId,
          snapshot: projectSafeSnapshot(this.hostState, msg.senderId),
        });
        return;
      }

      if (msg.kind === 'ACTION_REQ' && msg.action) {
        const err = this.applyHostAction(msg.senderId, msg.action);
        if (err) {
          this.send({
            kind: 'ACTION_ERR',
            senderId: this.userId,
            targetId: msg.senderId,
            error: err,
          });
        }
        return;
      }
    } else {
      // Guest client receives viewer-targeted safe snapshot
      if (msg.kind === 'SNAPSHOT' && msg.targetId === this.userId && msg.snapshot) {
        if (
          !this.latestSnapshot ||
          msg.snapshot.stateVersion >= this.latestSnapshot.stateVersion
        ) {
          this.latestSnapshot = msg.snapshot;
          this.callbacks.onSnapshot(msg.snapshot);
        }
      } else if (msg.kind === 'ACTION_ERR' && msg.targetId === this.userId && msg.error) {
        this.callbacks.onError(msg.error);
      }
    }
  }

  private applyHostAction(actorId: string, action: GameAction): string | null {
    if (!this.hostState) return 'Room belum siap.';
    const res = reduceGameAction(this.hostState, actorId, action);
    if (!res.accepted) {
      return res.message;
    }
    this.hostState = res.state;

    // Auto-set Udeg immediately if new round starts with a Bot Bandar
    if (this.hostState.phase === 'ROUND_SETUP' && this.hostState.currentRound) {
      const dealer = this.hostState.members.find(
        (m) => m.userId === this.hostState!.currentRound!.dealerId
      );
      if (dealer?.isBot) {
        const ratios = [0.2, 0.25, 0.3] as const;
        const ratio = ratios[this.hostState.currentRound.sequence % ratios.length] ?? 0.25;
        const raw = Math.floor((dealer.balance * ratio) / 10_000) * 10_000;
        const udegAmount = Math.max(10_000, Math.min(dealer.balance, raw));
        const udegRes = reduceGameAction(this.hostState, dealer.userId, {
          roomId: this.hostState.roomId,
          roundId: this.hostState.currentRound.roundId,
          actionId: makeId('bot-udeg'),
          expectedVersion: this.hostState.stateVersion,
          type: 'SET_UDEG',
          payload: { amount: udegAmount },
        });
        if (udegRes.accepted) {
          this.hostState = udegRes.state;
        }
      }
    }

    this.broadcastSnapshots();
    return null;
  }

  private broadcastSnapshots(): void {
    if (!this.hostState) return;
    const hostSnap = projectSafeSnapshot(this.hostState, this.userId);
    this.latestSnapshot = hostSnap;
    this.callbacks.onSnapshot(hostSnap);

    for (const m of this.hostState.members) {
      if (m.userId === this.userId || m.isBot || m.status === 'LEFT') continue;
      this.send({
        kind: 'SNAPSHOT',
        senderId: this.userId,
        targetId: m.userId,
        snapshot: projectSafeSnapshot(this.hostState, m.userId),
      });
    }
  }

  private send(envelope: BroadcastEnvelope): void {
    if (!this.channel) return;
    void this.channel.send({
      type: 'broadcast',
      event: 'spirit',
      payload: envelope,
    });
  }
}
