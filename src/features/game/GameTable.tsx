import { evaluateHand, type SafeRoomSnapshot } from '../../domain';
import { BetPanel } from '../../components/BetPanel';
import { PaperDomino } from '../../components/PaperDomino';
import { PlayerSeat } from '../../components/PlayerSeat';
import { StatusBar } from '../../components/StatusBar';
import { UdegMeter } from '../../components/UdegMeter';
import { formatRupiah, formatSignedRupiah } from '../../services/format';
import { ResultSheet } from './ResultSheet';

interface GameTableProps {
  readonly snapshot: SafeRoomSnapshot;
  readonly viewerId: string;
  readonly secondsLeft: number | null;
  readonly modeLabel: string;
  readonly onSetUdeg: (amount: number) => string | null;
  readonly onPlaceBet: (amount: number) => string | null;
  readonly onStop: () => void;
  readonly onDraw: () => void;
  readonly onNextRound: () => void;
  readonly onExitLobby: () => void;
}

export function GameTable({
  snapshot,
  viewerId,
  secondsLeft,
  modeLabel,
  onSetUdeg,
  onPlaceBet,
  onStop,
  onDraw,
  onNextRound,
  onExitLobby,
}: GameTableProps) {
  const round = snapshot.currentRound;
  const dealerId = round?.dealerId ?? snapshot.dealerId;
  const dealerMember = snapshot.members.find((m) => m.userId === dealerId);
  const viewerMember = snapshot.members.find((m) => m.userId === viewerId);

  const isViewerDealer = viewerId === dealerId;
  const viewerRoundPlayer = round?.players[viewerId];
  const activeDrawUid =
    round && snapshot.phase === 'DRAW_DECISION'
      ? round.drawTurnOrder[round.activeDrawTurnIndex]
      : null;
  const isViewerDrawTurn = activeDrawUid === viewerId;

  const dealerReveal = round?.reveals[dealerId];
  const dealerTileCount = snapshot.handCounts[dealerId] ?? 0;

  // Non-dealer members ordered by payment order when in round, else clockwise seat
  const otherSeats = snapshot.members
    .filter((m) => m.userId !== dealerId && m.status !== 'LEFT')
    .sort((a, b) => {
      const orderA = round?.players[a.userId]?.seatOrder ?? 99;
      const orderB = round?.players[b.userId]?.seatOrder ?? 99;
      return orderA - orderB || a.seat - b.seat;
    });

  // Live evaluation of viewer's own tiles (only when 2 or 3 tiles)
  const myEval =
    snapshot.myTiles.length >= 2 && snapshot.myTiles.length <= 3
      ? evaluateHand(snapshot.myTiles)
      : null;

  const dealerRoundNumber = Math.min(
    snapshot.rules.dealerRotationRounds,
    (round ? round.dealerRoundsCompletedBefore : snapshot.dealerRoundsCompleted) + 1
  );

  const availableViewerBalance = viewerMember
    ? viewerMember.balance - viewerMember.reservedBet
    : 0;

  return (
    <div className="game-layout">
      <div className="table-column">
        <StatusBar snapshot={snapshot} secondsLeft={secondsLeft} modeLabel={modeLabel} />

        <div className="table-arena">
          {/* Top: Bandar / Cong Zone */}
          <div className="dealer-zone">
            <span className="badge badge-gold">
              BANDAR / CONG · RONDE {dealerRoundNumber} DARI {snapshot.rules.dealerRotationRounds}
            </span>

            {dealerMember && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: '16px' }}>
                  {dealerMember.displayName}
                  {isViewerDealer ? ' (Anda)' : ''}
                </div>
                <div className="muted" style={{ fontSize: '13px' }}>
                  Saldo: {formatRupiah(dealerMember.balance)}
                  {activeDrawUid === dealerId && (
                    <span className="badge badge-mint" style={{ marginLeft: '8px' }}>
                      Giliran Draw
                    </span>
                  )}
                </div>
              </div>
            )}

            <UdegMeter
              limit={round?.udegLimit ?? 0}
              remaining={round?.udegRemaining ?? 0}
            />

            <div className="hand-row" aria-label="Kartu Bandar">
              {dealerReveal
                ? dealerReveal.tiles.map((t, i) => <PaperDomino key={i} tile={t} size="sm" />)
                : isViewerDealer && snapshot.myTiles.length > 0
                  ? snapshot.myTiles.map((t, i) => <PaperDomino key={i} tile={t} size="sm" />)
                  : Array.from({ length: dealerTileCount }).map((_, i) => (
                      <PaperDomino key={i} faceDown size="sm" />
                    ))}
            </div>

            {dealerReveal && (
              <span className="badge badge-gold">
                {dealerReveal.evaluatedHand.handType === 'TRIPLE'
                  ? `TRIPLE (Skor ${dealerReveal.evaluatedHand.numericScore})`
                  : `Nilai Bandar: ${dealerReveal.evaluatedHand.numericScore}${dealerReveal.evaluatedHand.isPureNine ? ' · 9 Murni' : ''}`}
              </span>
            )}
          </div>

          {/* Middle: Clockwise Player Seats with Payment Order */}
          <div className="seats-grid">
            {otherSeats.map((m) => {
              const rp = round?.players[m.userId];
              const rev = round?.reveals[m.userId];
              const settle = round?.settlements.find((s) => s.playerId === m.userId);
              return (
                <PlayerSeat
                  key={m.userId}
                  member={m}
                  roundPlayer={rp}
                  isYou={m.userId === viewerId}
                  isTurn={activeDrawUid === m.userId}
                  tileCount={snapshot.handCounts[m.userId] ?? 0}
                  visibleTiles={m.userId === viewerId ? snapshot.myTiles : undefined}
                  reveal={rev}
                  settlement={settle}
                />
              );
            })}
          </div>
        </div>

        {/* Bottom: Local Player Dock & Actions */}
        <section className="player-dock" aria-label="Kontrol pemain">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <strong>{viewerMember?.displayName ?? 'Anda'}</strong>{' '}
              <span className={`badge ${isViewerDealer ? 'badge-gold' : 'badge-mint'}`}>
                {isViewerDealer ? 'Bandar / Cong' : `Pemain #${viewerRoundPlayer?.seatOrder ?? '-'}`}
              </span>
            </div>
            <div style={{ fontSize: '14px' }}>
              Saldo: <strong>{formatRupiah(viewerMember?.balance ?? 0)}</strong>
              {viewerMember && viewerMember.reservedBet > 0 && (
                <span className="muted"> (Cadangan bet {formatRupiah(viewerMember.reservedBet)})</span>
              )}
            </div>
          </div>

          {/* Viewer's own private hand */}
          {snapshot.myTiles.length > 0 && (
            <div style={{ display: 'grid', justifyItems: 'center', gap: '8px' }}>
              <div className="hand-row">
                {snapshot.myTiles.map((tile, idx) => (
                  <PaperDomino key={idx} tile={tile} />
                ))}
              </div>
              {myEval ? (
                <span className={`badge ${myEval.handType === 'TRIPLE' ? 'badge-gold' : 'badge-mint'}`}>
                  {myEval.handType === 'TRIPLE'
                    ? `TRIPLE · Peringkat 10 (Skor ${myEval.numericScore})`
                    : `Nilai Anda: ${myEval.numericScore}${myEval.isPureNine ? ' · 9 Murni (2×)' : myEval.numericScore === 9 ? ' · Nilai 9 (2×)' : ''}`}
                </span>
              ) : (
                <span className="muted" style={{ fontSize: '13px' }}>
                  Kartu pertama Anda (total titik: {snapshot.myTiles[0]![0] + snapshot.myTiles[0]![1]})
                </span>
              )}
            </div>
          )}

          {/* Phase-specific Controls */}
          {snapshot.phase === 'ROUND_SETUP' && isViewerDealer && (
            <BetPanel
              mode="UDEG"
              maxAmount={availableViewerBalance}
              onSubmit={onSetUdeg}
            />
          )}

          {snapshot.phase === 'ROUND_SETUP' && !isViewerDealer && (
            <div className="callout callout-gold">
              Menunggu Bandar (<strong>{dealerMember?.displayName}</strong>) menetapkan Udeg ronde ini...
            </div>
          )}

          {snapshot.phase === 'BETTING' && !isViewerDealer && viewerRoundPlayer && !viewerRoundPlayer.betLocked && (
            <BetPanel
              mode="BET"
              maxAmount={availableViewerBalance}
              onSubmit={onPlaceBet}
            />
          )}

          {snapshot.phase === 'BETTING' && (isViewerDealer || viewerRoundPlayer?.betLocked) && (
            <div className="callout">
              {isViewerDealer
                ? 'Menunggu para pemain mengunci taruhan mereka...'
                : `Taruhan Anda (${formatRupiah(viewerRoundPlayer?.bet ?? 0)}) sudah terkunci. Menunggu pemain lain...`}
            </div>
          )}

          {snapshot.phase === 'DRAW_DECISION' && isViewerDrawTurn && (
            <div style={{ display: 'grid', gap: '10px' }}>
              <div className="callout">
                <strong>Giliran Anda.</strong> Pilih tetap 2 kartu atau ambil tepat 1 kartu ketiga.
              </div>
              <div className="action-row">
                <button type="button" className="btn-ghost" onClick={onStop} style={{ flex: '1 1 180px' }}>
                  Stop — tetap 2 kartu
                </button>
                <button type="button" className="btn-primary" onClick={onDraw} style={{ flex: '1 1 180px' }}>
                  Ambil kartu ketiga
                </button>
              </div>
            </div>
          )}

          {snapshot.phase === 'DRAW_DECISION' && !isViewerDrawTurn && (
            <div className="callout">
              Menunggu keputusan Stop/Draw dari{' '}
              <strong>
                {snapshot.members.find((m) => m.userId === activeDrawUid)?.displayName ?? '...'}
              </strong>
              ...
            </div>
          )}

          {snapshot.phase === 'NEXT_ROUND' && (
            <div className="action-row">
              <button type="button" className="btn-primary" onClick={onNextRound} style={{ flex: '1 1 220px' }}>
                Lanjut ke Ronde #{snapshot.roundSequence + 1}
              </button>
              <button type="button" className="btn-ghost" onClick={onExitLobby}>
                Kembali ke Lobi
              </button>
            </div>
          )}

          {snapshot.phase === 'FINISHED' && (
            <div style={{ display: 'grid', gap: '10px' }}>
              <div className="callout callout-gold">
                <strong>Sesi Selesai.</strong> Peserta eligible bersaldo ≥ Rp10.000 kurang dari 2 orang (A04).
              </div>
              <button type="button" className="btn-primary" onClick={onExitLobby}>
                Buat Meja Baru
              </button>
            </div>
          )}
        </section>

        {/* Settlement Sheet on NEXT_ROUND / FINISHED */}
        {round && (snapshot.phase === 'NEXT_ROUND' || snapshot.phase === 'FINISHED') && (
          <ResultSheet round={round} members={snapshot.members} />
        )}
      </div>

      {/* Desktop Side Ledger / Mobile Stacked Summary */}
      <aside className="side-ledger" aria-label="Buku besar dan riwayat ronde">
        <div>
          <h3 style={{ margin: '0 0 8px', fontSize: '15px' }}>Saldo & Rotasi Bandar</h3>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: '12px' }}>
            Bandar berikutnya: <strong>{snapshot.members.find((m) => m.userId === snapshot.dealerId)?.displayName}</strong>{' '}
            ({snapshot.dealerRoundsCompleted}/{snapshot.rules.dealerRotationRounds} ronde selesai)
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Peserta</th>
                  <th>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.members
                  .filter((m) => m.status !== 'LEFT')
                  .map((m) => (
                    <tr key={m.userId}>
                      <td>
                        {m.displayName}
                        {m.userId === dealerId && (
                          <span className="badge badge-gold" style={{ marginLeft: '6px', padding: '1px 6px', fontSize: '10px' }}>
                            Bandar
                          </span>
                        )}
                      </td>
                      <td className="mono">{formatRupiah(m.balance)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 style={{ margin: '0 0 8px', fontSize: '15px' }}>Riwayat Ronde ({snapshot.roundHistory.length})</h3>
          {snapshot.roundHistory.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: '13px' }}>
              Belum ada ronde yang selesai.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: '8px', maxHeight: '360px', overflowY: 'auto' }}>
              {snapshot.roundHistory.map((h) => {
                const skips = h.settlements.filter((s) => s.paymentStatus === 'SKIPPED_UDEG').length;
                return (
                  <div
                    key={h.roundId}
                    style={{
                      background: 'var(--soft)',
                      border: '1px solid var(--line)',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      fontSize: '12px',
                      display: 'grid',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong>Ronde #{h.sequence}</strong>
                      <span className={h.dealerDelta >= 0 ? 'delta-pos' : 'delta-neg'}>
                        {h.cancelled ? 'Dibatalkan' : `Bandar ${formatSignedRupiah(h.dealerDelta)}`}
                      </span>
                    </div>
                    <div className="muted">
                      Udeg sisa {formatRupiah(h.udegRemaining)} / {formatRupiah(h.udegLimit)}
                      {skips > 0 ? ` · ${skips} skip` : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
