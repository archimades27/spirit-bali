import { useEffect, useRef, useState } from 'react';
import type { SafeRoomSnapshot } from '../domain';
import { RulesModal } from '../components/RulesModal';
import { GameTable } from '../features/game/GameTable';
import { HomeLobby } from '../features/room/HomeLobby';
import { LocalGameSession, type LocalGameConfig } from '../services/localGameEngine';

export function App() {
  const sessionRef = useRef<LocalGameSession | null>(null);
  const [snapshot, setSnapshot] = useState<SafeRoomSnapshot | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
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
    window.location.hash = '#/';
  }

  // Step bot actions smoothly so user can observe Udeg, bets, and Stop/Draw turns
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
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          SPIRIT <span>/ BALI</span>
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={() => setRulesOpen(true)}>
            Aturan v1.0
          </button>
          {snapshot && (
            <button type="button" className="btn-ghost" onClick={handleExitLobby}>
              Keluar Meja
            </button>
          )}
        </div>
      </header>

      {snapshot && sessionRef.current ? (
        <GameTable
          snapshot={snapshot}
          viewerId={sessionRef.current.humanUserId}
          secondsLeft={secondsLeft}
          modeLabel="Lokal"
          onSetUdeg={handleSetUdeg}
          onPlaceBet={handlePlaceBet}
          onStop={handleStop}
          onDraw={handleDraw}
          onNextRound={handleNextRound}
          onExitLobby={handleExitLobby}
        />
      ) : (
        <HomeLobby
          onStartLocal={handleStartLocal}
          onOpenRules={() => setRulesOpen(true)}
        />
      )}

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
