import { useEffect, useState } from 'react';
import type { SafeRoomSnapshot } from '../domain';
import { formatRupiah, formatSignedRupiah } from '../services/format';
import { AnimatedNumber } from './AnimatedNumber';

interface LeaderboardOverlayProps {
  readonly snapshot: SafeRoomSnapshot;
  readonly viewerId: string;
  readonly onOpenLedger: () => void;
  readonly onExitLobby: () => void;
}

const MEDALS = ['🥇', '🥈', '🥉'] as const;

export function LeaderboardOverlay({
  snapshot,
  viewerId,
  onOpenLedger,
  onExitLobby,
}: LeaderboardOverlayProps) {
  const ranked = snapshot.members
    .filter((m) => m.status !== 'LEFT')
    .slice()
    .sort((a, b) => b.balance - a.balance || a.seat - b.seat);

  const champion = ranked[0];
  const startingBalance = snapshot.rules.startingBalance;

  return (
    <div className="leaderboard-overlay" role="region" aria-label="Leaderboard Pemenang">
      <div className="leaderboard-card">
        <div className="leaderboard-head">
          <span className="badge badge-gold">1 PUTARAN BANDAR SELESAI</span>
          <h2>Leaderboard Pemenang</h2>
          {champion && (
            <p className="muted" style={{ margin: 0, fontSize: '13px' }}>
              Juara 1:{' '}
              <strong style={{ color: 'var(--gold)' }}>
                {champion.displayName}
                {champion.userId === viewerId && champion.displayName.toLowerCase() !== 'anda'
                  ? ' (Anda)'
                  : ''}
              </strong>{' '}
              ({formatRupiah(champion.balance)})
            </p>
          )}
        </div>

        <ol className="leaderboard-list">
          {ranked.map((m, idx) => {
            const net = m.balance - startingBalance;
            const isYou = m.userId === viewerId;
            return (
              <li
                key={m.userId}
                className={`leaderboard-row ${idx === 0 ? 'is-champion' : ''} ${isYou ? 'is-you' : ''}`}
                style={{ animationDelay: `${200 + (ranked.length - 1 - idx) * 180}ms` }}
              >
                <span className="lb-rank">{MEDALS[idx] ?? `#${idx + 1}`}</span>
                <div className="lb-name">
                  <strong>
                    {m.displayName}
                    {isYou && m.displayName.toLowerCase() !== 'anda' ? ' (Anda)' : ''}
                  </strong>
                  <span className="muted" style={{ fontSize: '11px' }}>
                    {m.status === 'BANKRUPT' ? 'Saldo habis' : `${snapshot.roundSequence} tangan`}
                  </span>
                </div>
                <div className="lb-score">
                  <LeaderboardBalance start={startingBalance} value={m.balance} />
                  <span className={`mono ${net > 0 ? 'delta-pos' : net < 0 ? 'delta-neg' : 'muted'}`} style={{ fontSize: '11px' }}>
                    {net === 0 ? 'Impas' : formatSignedRupiah(net)}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="thumb-row">
          <button type="button" className="btn-ghost" onClick={onOpenLedger}>
            Rincian Ronde
          </button>
          <button type="button" className="btn-gold" onClick={onExitLobby}>
            Main Lagi
          </button>
        </div>
      </div>
    </div>
  );
}

function LeaderboardBalance({ start, value }: { readonly start: number; readonly value: number }) {
  // Count up from the starting balance once the overlay mounts.
  const [shown, setShown] = useState(start);
  useEffect(() => {
    const t = window.setTimeout(() => setShown(value), 350);
    return () => window.clearTimeout(t);
  }, [value]);
  return <AnimatedNumber className="mono lb-balance" value={shown} format={formatRupiah} durationMs={1400} />;
}
