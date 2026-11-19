import { useEffect, useRef, useState } from 'react';
import type { GamePhase, SafeRoomSnapshot } from '../domain';
import { LedgerModal } from '../components/LedgerModal';
import { RulesModal } from '../components/RulesModal';
import { GameTable } from '../features/game/GameTable';
import { HomeLobby } from '../features/room/HomeLobby';
import { LocalGameSession, type LocalGameConfig } from '../services/localGameEngine';
import {
  generateRoomCode,
  OnlineRoomSession,
  type ConnectionState,
} from '../services/onlineGameService';

const PHASE_SHORT: Readonly<Record<GamePhase, string>> = {
  LOBBY: 'Lobi',
  ROUND_SETUP: 'Set Udeg',
  FIRST_DEAL: 'Bagi 1',
  BETTING: 'Betting',
  SECOND_DEAL: 'Bagi 2',
  DRAW_DECISION: 'Stop/Draw',
  REVEAL: 'Buka',
  SETTLEMENT: 'Settle',
  NEXT_ROUND: 'Hasil',
  FINISHED: 'Selesai',
};

function parseInitialJoinCode(): string {
  const match = window.location.hash.match(/^#\/join\/([A-Za-z0-9]{4,8})$/);
  return match?.[1]?.toUpperCase() ?? '';
}

export function App() {
  const localRef = useRef<LocalGameSession | null>(null);
  const onlineRef = useRef<OnlineRoomSession | null>(null);

  const [mode, setMode] = useState<'none' | 'local' | 'online'>('none');
  const [snapshot, setSnapshot] = useState<SafeRoomSnapshot | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState | null>(null);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [initialJoinCode] = useState(parseInitialJoinCode);

  function syncLocalSnapshot() {
    if (localRef.current) {
      setSnapshot(localRef.current.getSnapshot());
    }
  }

  function cleanupSessions() {
    localRef.current = null;
    if (onlineRef.current) {
      onlineRef.current.disconnect();
      onlineRef.current = null;
    }
    setMode('none');
    setSnapshot(null);
    setConnectionState(null);
    setOnlineError(null);
    setSecondsLeft(null);
    setLedgerOpen(false);
    window.location.hash = '#/';
  }

  function handleStartLocal(config: LocalGameConfig) {
    cleanupSessions();
    const session = new LocalGameSession(config);
    localRef.current = session;
    setMode('local');
    window.location.hash = '#/table';
    setSnapshot(session.getSnapshot());
  }

  function handleCreateOnline(params: { playerName: string; maxPlayers: number }) {
    cleanupSessions();
    const roomCode = generateRoomCode();
    const session = new OnlineRoomSession({
      roomCode,
      displayName: params.playerName,
      isHost: true,
      maxPlayers: params.maxPlayers,
      callbacks: {
        onSnapshot: (snap) => setSnapshot(snap),
        onConnectionChange: (st) => setConnectionState(st),
        onError: (err) => setOnlineError(err),
      },
    });
    onlineRef.current = session;
    setMode('online');
    window.location.hash = `#/room/${roomCode}`;
    void session.connect();
  }

  function handleJoinOnline(params: { playerName: string; roomCode: string }) {
    cleanupSessions();
    const code = params.roomCode.toUpperCase();
    const session = new OnlineRoomSession({
      roomCode: code,
      displayName: params.playerName,
      isHost: false,
      callbacks: {
        onSnapshot: (snap) => {
          setOnlineError(null);
          setSnapshot(snap);
        },
        onConnectionChange: (st) => setConnectionState(st),
        onError: (err) => setOnlineError(err),
      },
    });
    onlineRef.current = session;
    setMode('online');
    window.location.hash = `#/room/${code}`;
    void session.connect();
  }

  // Cleanup online socket on unmount
  useEffect(() => {
    return () => {
      onlineRef.current?.disconnect();
    };
  }, []);

  // Step bot actions smoothly (local mode or online host with bots)
  useEffect(() => {
    if (!snapshot) return;
    if (
      snapshot.phase !== 'ROUND_SETUP' &&
      snapshot.phase !== 'BETTING' &&
      snapshot.phase !== 'DRAW_DECISION'
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (mode === 'local' && localRef.current?.stepBot()) {
        syncLocalSnapshot();
      } else if (mode === 'online' && onlineRef.current?.isHost) {
        onlineRef.current.stepBot();
      }
    }, 520);

    return () => window.clearTimeout(timer);
  }, [snapshot, mode]);

  // Countdown timer & authoritative timeout tick (A07)
  useEffect(() => {
    const deadlineMs = snapshot?.currentRound?.deadlineMs ?? null;
    if (!deadlineMs) {
      setSecondsLeft(null);
      return;
    }

    const update = () => {
      const diff = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
      setSecondsLeft(diff);
      if (diff === 0) {
        if (mode === 'local' && localRef.current?.tickTimeoutIfExpired()) {
          syncLocalSnapshot();
        } else if (mode === 'online' && onlineRef.current?.isHost) {
          onlineRef.current.tickTimeoutIfExpired();
        }
      }
    };

    update();
    const interval = window.setInterval(update, 500);
    return () => window.clearInterval(interval);
  }, [snapshot?.currentRound?.deadlineMs, snapshot?.stateVersion, mode]);

  function handleSetUdeg(amount: number): string | null {
    if (mode === 'local' && localRef.current) {
      const res = localRef.current.dispatchHumanAction('SET_UDEG', { amount });
      if (!res.accepted) return res.message;
      syncLocalSnapshot();
      return null;
    }
    if (mode === 'online' && onlineRef.current) {
      return onlineRef.current.dispatchAction('SET_UDEG', { amount });
    }
    return 'Sesi tidak aktif.';
  }

  function handlePlaceBet(amount: number): string | null {
    if (mode === 'local' && localRef.current) {
      const res = localRef.current.dispatchHumanAction('PLACE_BET', { amount });
      if (!res.accepted) return res.message;
      syncLocalSnapshot();
      return null;
    }
    if (mode === 'online' && onlineRef.current) {
      return onlineRef.current.dispatchAction('PLACE_BET', { amount });
    }
    return 'Sesi tidak aktif.';
  }

  function handleStop() {
    if (mode === 'local' && localRef.current) {
      const res = localRef.current.dispatchHumanAction('STOP');
      if (res.accepted) syncLocalSnapshot();
    } else if (mode === 'online' && onlineRef.current) {
      onlineRef.current.dispatchAction('STOP');
    }
  }

  function handleDraw() {
    if (mode === 'local' && localRef.current) {
      const res = localRef.current.dispatchHumanAction('DRAW');
      if (res.accepted) syncLocalSnapshot();
    } else if (mode === 'online' && onlineRef.current) {
      onlineRef.current.dispatchAction('DRAW');
    }
  }

  function handleNextRound() {
    if (mode === 'local' && localRef.current) {
      const res = localRef.current.advanceNextRound();
      if (res.accepted) syncLocalSnapshot();
    } else if (mode === 'online' && onlineRef.current) {
      onlineRef.current.dispatchAction('NEXT_ROUND');
    }
  }

  const viewerId =
    mode === 'local'
      ? (localRef.current?.humanUserId ?? '')
      : mode === 'online'
        ? (onlineRef.current?.userId ?? '')
        : '';

  const inActiveTable = Boolean(snapshot && snapshot.phase !== 'LOBBY');

  return (
    <div className="portrait-stage">
      <div className="portrait-shell">
        {/* ZONA 1: Single-Row Compact Top HUD */}
        <header className="hud-bar">
          <div className="hud-left">
            <div className="brand-mini">
              SPIRIT<span>/BALI</span>
            </div>
            {inActiveTable && snapshot && (
              <>
                <span className="badge badge-mint">
                  R#{snapshot.roundSequence} · {PHASE_SHORT[snapshot.phase]}
                </span>
                {secondsLeft !== null && (
                  <span className={`badge ${secondsLeft <= 10 ? 'badge-red' : ''}`}>
                    {secondsLeft}d
                  </span>
                )}
              </>
            )}
            {mode === 'online' && snapshot && (
              <span className={`badge ${connectionState === 'connected' ? 'badge-gold' : 'badge-red'}`}>
                {snapshot.roomCode}
              </span>
            )}
          </div>

          <div className="hud-actions">
            {inActiveTable && (
              <button
                type="button"
                className="hud-btn"
                onClick={() => setLedgerOpen(true)}
                aria-label="Buka ledger dan riwayat"
              >
                Riwayat
              </button>
            )}
            <button
              type="button"
              className="hud-btn"
              onClick={() => setRulesOpen(true)}
              aria-label="Aturan permainan"
            >
              ?
            </button>
            {(inActiveTable || mode === 'online') && (
              <button
                type="button"
                className="hud-btn btn-ghost"
                onClick={cleanupSessions}
                aria-label="Keluar meja"
              >
                ✕
              </button>
            )}
          </div>
        </header>

        {inActiveTable && snapshot ? (
          <GameTable
            snapshot={snapshot}
            viewerId={viewerId}
            onSetUdeg={handleSetUdeg}
            onPlaceBet={handlePlaceBet}
            onStop={handleStop}
            onDraw={handleDraw}
            onNextRound={handleNextRound}
            onOpenLedger={() => setLedgerOpen(true)}
            onExitLobby={cleanupSessions}
          />
        ) : (
          <HomeLobby
            initialJoinCode={initialJoinCode}
            onlineSnapshot={mode === 'online' ? snapshot : null}
            onlineUserId={onlineRef.current?.userId ?? null}
            onlineIsHost={Boolean(onlineRef.current?.isHost)}
            connectionState={connectionState}
            onlineError={onlineError}
            onStartLocal={handleStartLocal}
            onCreateOnline={handleCreateOnline}
            onJoinOnline={handleJoinOnline}
            onOnlineAddBot={() => onlineRef.current?.addBot()}
            onOnlineToggleReady={() => onlineRef.current?.dispatchAction('READY')}
            onOnlineStart={() => onlineRef.current?.dispatchAction('START')}
            onOnlineLeave={cleanupSessions}
            onOpenRules={() => setRulesOpen(true)}
          />
        )}

        <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
        <LedgerModal
          open={ledgerOpen}
          snapshot={snapshot}
          onClose={() => setLedgerOpen(false)}
        />
      </div>
    </div>
  );
}
