import type { GamePhase, SafeRoomSnapshot } from '../domain';
import { formatRupiah } from '../services/format';

const PHASE_LABELS: Readonly<Record<GamePhase, string>> = {
  LOBBY: 'Lobi',
  ROUND_SETUP: 'Set Udeg Bandar',
  FIRST_DEAL: 'Bagi Kartu 1',
  BETTING: 'Pasang Taruhan',
  SECOND_DEAL: 'Bagi Kartu 2',
  DRAW_DECISION: 'Stop / Draw',
  REVEAL: 'Buka Kartu',
  SETTLEMENT: 'Settlement',
  NEXT_ROUND: 'Hasil Ronde',
  FINISHED: 'Sesi Selesai',
};

interface StatusBarProps {
  readonly snapshot: SafeRoomSnapshot;
  readonly secondsLeft: number | null;
  readonly modeLabel: string;
}

export function StatusBar({ snapshot, secondsLeft, modeLabel }: StatusBarProps) {
  const round = snapshot.currentRound;
  const activeTurnUid =
    round && snapshot.phase === 'DRAW_DECISION'
      ? round.drawTurnOrder[round.activeDrawTurnIndex]
      : null;
  const activeTurnName = activeTurnUid
    ? snapshot.members.find((m) => m.userId === activeTurnUid)?.displayName
    : null;

  return (
    <div className="status-bar" role="status" aria-live="polite">
      <div className="status-group">
        <span className="badge badge-mint">{PHASE_LABELS[snapshot.phase]}</span>
        <span className="badge">Ronde #{snapshot.roundSequence}</span>
        {activeTurnName && (
          <span className="badge badge-gold">Giliran: {activeTurnName}</span>
        )}
      </div>

      <div className="status-group">
        {round && round.udegLimit > 0 && (
          <span className="badge badge-gold">
            Udeg: {formatRupiah(round.udegRemaining)}
          </span>
        )}
        {secondsLeft !== null && (
          <span className={`badge ${secondsLeft <= 10 ? 'badge-red' : ''}`}>
            ⏱ {secondsLeft}d
          </span>
        )}
        <span className="badge mono">
          {modeLabel} · v{snapshot.stateVersion}
        </span>
      </div>
    </div>
  );
}
