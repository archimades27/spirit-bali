import { useEffect, useRef, useState } from 'react';
import type { GamePhase, SafeRoomSnapshot } from '../domain';
import { LedgerModal } from '../components/LedgerModal';
import { RulesModal } from '../components/RulesModal';
import { GameTable } from '../features/game/GameTable';
import { HomeLobby } from '../features/room/HomeLobby';
import { LocalGameSession, type LocalGameConfig } from '../services/localGameEngine';

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

export function App() {
  const sessionRef = useRef<LocalGameSession | null>(null);
  const [snapshot, setSnapshot] = useState<SafeRoomSnapshot | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  function syncSnapshot() {
    if (sessionRef.current) {
      setSnapshot(sessionRef.current.getSnapshot());
    }
  }

  function handleStartLocal(config: LocalGameConfig) {
    const session = new LocalGameSession(config);
    sessionRef.current = session;
    window.location.hash = '#/table';
    setSnapshot(session.getSnapshot());
  }

  function handleExitLobby() {
    sessionRef.current = null;
    setSnapshot(null);
    setSecondsLeft(null);
    setLedgerOpen(false);
    window.location.hash = '#/';
  }

  // Step bot actions smoothly so user can watch Udeg, bets, and Stop/Draw turns
  useEffect(() => {
    if (!snapshot || !sessionRef.current) return;
    if (
      snapshot.phase !== 'ROUND_SETUP' &&
      snapshot.phase !== 'BETTING' &&
      snapshot.phase !== 'DRAW_DECISION'
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (sessionRef.current?.stepBot()) {
        syncSnapshot();
      }
    }, 520);

    return () => window.clearTimeout(timer);
  }, [snapshot]);

  // Countdown timer & authoritative timeout tick (A07)
  useEffect(() => {
    const deadlineMs = snapshot?.currentRound?.deadlineMs ?? null;
    if (!deadlineMs || !sessionRef.current) {
      setSecondsLeft(null);
      return;
    }

    const update = () => {
      const diff = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
      setSecondsLeft(diff);
      if (diff === 0 && sessionRef.current?.tickTimeoutIfExpired()) {
        syncSnapshot();
      }
    };

    update();
    const interval = window.setInterval(update, 500);
    return () => window.clearInterval(interval);
  }, [snapshot?.currentRound?.deadlineMs, snapshot?.stateVersion]);

  function handleSetUdeg(amount: number): string | null {
    const res = sessionRef.current?.dispatchHumanAction('SET_UDEG', { amount });
    if (!res) return 'Sesi tidak aktif.';
    if (!res.accepted) return res.message;
    syncSnapshot();
    return null;
  }

  function handlePlaceBet(amount: number): string | null {
    const res = sessionRef.current?.dispatchHumanAction('PLACE_BET', { amount });
    if (!res) return 'Sesi tidak aktif.';
    if (!res.accepted) return res.message;
    syncSnapshot();
    return null;
  }

  function handleStop() {
    const res = sessionRef.current?.dispatchHumanAction('STOP');
    if (res?.accepted) syncSnapshot();
  }

  function handleDraw() {
    const res = sessionRef.current?.dispatchHumanAction('DRAW');
    if (res?.accepted) syncSnapshot();
  }

  function handleNextRound() {
    const res = sessionRef.current?.advanceNextRound();
    if (res?.accepted) syncSnapshot();
  }

  return (
    <div className="portrait-stage">
      <div className="portrait-shell">
        {/* ZONA 1: Single-Row Compact Top HUD */}
        <header className="hud-bar">
          <div className="hud-left">
            <div className="brand-mini">
              SPIRIT<span>/BALI</span>
            </div>
            {snapshot && (
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
          </div>

          <div className="hud-actions">
            {snapshot && (
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
            {snapshot && (
              <button
                type="button"
                className="hud-btn btn-ghost"
                onClick={handleExitLobby}
                aria-label="Keluar meja"
              >
                ✕
              </button>
            )}
          </div>
        </header>

        {snapshot && sessionRef.current ? (
          <GameTable
            snapshot={snapshot}
            viewerId={sessionRef.current.humanUserId}
            onSetUdeg={handleSetUdeg}
            onPlaceBet={handlePlaceBet}
            onStop={handleStop}
            onDraw={handleDraw}
            onNextRound={handleNextRound}
            onOpenLedger={() => setLedgerOpen(true)}
            onExitLobby={handleExitLobby}
          />
        ) : (
          <HomeLobby
            onStartLocal={handleStartLocal}
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
