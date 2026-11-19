import { evaluateHand, type SafeRoomSnapshot } from '../../domain';
import { BetPanel, getBetIntensity } from '../../components/BetPanel';
import { LeaderboardOverlay } from '../../components/LeaderboardOverlay';
import { PaperDomino } from '../../components/PaperDomino';
import { WinCelebration } from '../../components/WinCelebration';
import { formatRupiah, formatShortK, formatSignedRupiah } from '../../services/format';

interface GameTableProps {
  readonly snapshot: SafeRoomSnapshot;
  readonly viewerId: string;
  readonly onSetUdeg: (amount: number) => string | null;
  readonly onPlaceBet: (amount: number) => string | null;
  readonly onStop: () => void;
  readonly onDraw: () => void;
  readonly onNextRound: () => void;
  readonly onOpenLedger: () => void;
  readonly onExitLobby: () => void;
}

export function GameTable({
  snapshot,
  viewerId,
  onSetUdeg,
  onPlaceBet,
  onStop,
  onDraw,
  onNextRound,
  onOpenLedger,
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

  // Opponents shown around the vertical oval (exclude viewer & exclude dealer since dealer is at top and viewer is at bottom!)
  const opponents = snapshot.members
    .filter((m) => m.userId !== dealerId && m.userId !== viewerId && m.status !== 'LEFT')
    .sort((a, b) => {
      const orderA = round?.players[a.userId]?.seatOrder ?? 99;
      const orderB = round?.players[b.userId]?.seatOrder ?? 99;
      return orderA - orderB || a.seat - b.seat;
    });

  // If viewer IS dealer, all non-dealer seats are opponents around the oval
  const ringSeats = isViewerDealer
    ? snapshot.members
        .filter((m) => m.userId !== dealerId && m.status !== 'LEFT')
        .sort((a, b) => {
          const orderA = round?.players[a.userId]?.seatOrder ?? 99;
          const orderB = round?.players[b.userId]?.seatOrder ?? 99;
          return orderA - orderB || a.seat - b.seat;
        })
    : opponents;

  const myEval =
    snapshot.myTiles.length >= 2 && snapshot.myTiles.length <= 3
      ? evaluateHand(snapshot.myTiles)
      : null;

  const dealerRoundNumber = Math.min(
    snapshot.rules.dealerRotationRounds,
    (round ? round.dealerRoundsCompletedBefore : snapshot.dealerRoundsCompleted) + 1
  );

  const udegLimit = round?.udegLimit ?? 0;
  const udegRemaining = round?.udegRemaining ?? 0;
  const udegPct = udegLimit > 0 ? Math.max(0, Math.min(100, Math.round((udegRemaining / udegLimit) * 100))) : 0;

  const availableViewerBalance = viewerMember
    ? viewerMember.balance - viewerMember.reservedBet
    : 0;

  const viewerSettlement = round?.settlements.find((s) => s.playerId === viewerId);
  const skipCount = round?.settlements.filter((s) => s.paymentStatus === 'SKIPPED_UDEG').length ?? 0;

  const isSettledPhase =
    Boolean(round) &&
    !round?.cancelledReason &&
    (snapshot.phase === 'NEXT_ROUND' || snapshot.phase === 'FINISHED');

  const viewerWonAsDealer = isSettledPhase && isViewerDealer && (round?.dealerDelta ?? 0) > 0;
  const viewerWonAsPlayer =
    isSettledPhase &&
    !isViewerDealer &&
    viewerSettlement?.outcome === 'WIN' &&
    viewerSettlement.balanceDelta > 0;

  const winBanner = viewerWonAsDealer
    ? {
        title: 'BANDAR MENANG!',
        delta: round!.dealerDelta,
        multiplier: 1 as const,
      }
    : viewerWonAsPlayer && viewerSettlement
      ? {
          title:
            viewerSettlement.multiplier === 3
              ? 'TRIPLE · 3× MENANG!'
              : viewerSettlement.multiplier === 2
                ? 'NILAI 9 · 2× MENANG!'
                : 'ANDA MENANG!',
          delta: viewerSettlement.balanceDelta,
          multiplier: viewerSettlement.multiplier,
        }
      : null;

  const totalCycleSeats = snapshot.members.filter((m) => m.status !== 'LEFT').length;
  const currentCyclePos = Math.min(totalCycleSeats, snapshot.dealersServed.length + 1);

  return (
    <div className="portrait-game">
      {snapshot.phase === 'FINISHED' && (
        <LeaderboardOverlay
          snapshot={snapshot}
          viewerId={viewerId}
          onOpenLedger={onOpenLedger}
          onExitLobby={onExitLobby}
        />
      )}

      {/* ZONA 2: Vertical Oval Felt Table */}
      <section className="table-zone" aria-label="Meja Spirit Bali">
        {winBanner && round && snapshot.phase !== 'FINISHED' && (
          <WinCelebration
            roundKey={round.roundId}
            title={winBanner.title}
            delta={winBanner.delta}
            multiplier={winBanner.multiplier}
          />
        )}
        {/* Top of Oval: Bandar / Cong */}
        <div className="dealer-top">
          <div className="dealer-bar">
            <span className="badge badge-gold">
              ★ BANDAR {snapshot.sessionMode === 'ONE_CYCLE' ? `${currentCyclePos}/${totalCycleSeats} · ` : ''}R{dealerRoundNumber}/{snapshot.rules.dealerRotationRounds}
            </span>
            <strong style={{ fontSize: '13px' }}>
              {dealerMember?.displayName}
              {isViewerDealer && dealerMember?.displayName.toLowerCase() !== 'anda' ? ' (Anda)' : ''}
            </strong>
            <span className="muted mono" style={{ fontSize: '11px' }}>
              {formatRupiah(dealerMember?.balance ?? 0)}
            </span>
          </div>

          <div className="udeg-strip" aria-label="Status Udeg">
            <span className="muted">Udeg</span>
            <div className="udeg-mini-bar" aria-hidden="true">
              <div className="udeg-mini-fill" style={{ width: `${udegPct}%` }} />
            </div>
            <strong style={{ color: 'var(--gold)' }} className="mono">
              {udegLimit > 0 ? `${formatShortK(udegRemaining)}/${formatShortK(udegLimit)}` : 'Set...'}
            </strong>
          </div>

          {!isViewerDealer && (
            <div className="hand-row" style={{ gap: '5px', minHeight: '56px' }}>
              {dealerReveal
                ? dealerReveal.tiles.map((t, i) => <PaperDomino key={i} tile={t} size="xs" />)
                : Array.from({ length: dealerTileCount }).map((_, i) => (
                    <PaperDomino key={i} faceDown size="xs" />
                  ))}
              {dealerReveal && (
                <span className="badge badge-gold" style={{ marginLeft: '4px' }}>
                  {dealerReveal.evaluatedHand.handType === 'TRIPLE'
                    ? 'TRIPLE'
                    : `Nilai ${dealerReveal.evaluatedHand.numericScore}`}
                </span>
              )}
              {activeDrawUid === dealerId && (
                <span className="badge badge-mint">Giliran</span>
              )}
            </div>
          )}
        </div>

        {/* Middle of Oval: Clockwise Opponent Seats */}
        <div className={`opponents-ring ${ringSeats.length === 1 ? 'count-1' : ''}`}>
          {ringSeats.map((m, idx) => {
            const rp = round?.players[m.userId];
            const rev = round?.reveals[m.userId];
            const settle = round?.settlements.find((s) => s.playerId === m.userId);
            const tileCount = snapshot.handCounts[m.userId] ?? 0;
            const isOddLast = ringSeats.length % 2 === 1 && idx === ringSeats.length - 1 && ringSeats.length > 1;

            return (
              <article
                key={m.userId}
                className={`opp-seat ${activeDrawUid === m.userId ? 'is-turn' : ''} ${isOddLast ? 'span-center' : ''}`}
              >
                <div className="opp-head">
                  <span className="opp-name">
                    <span className="mono" style={{ color: 'var(--accent)', marginRight: '4px' }}>
                      #{rp?.seatOrder ?? '-'}
                    </span>
                    {m.displayName}
                  </span>
                  {rp && rp.betLocked && (
                    <span
                      className={`bet-chip mono tier-${getBetIntensity(rp.bet, m.balance).level}`}
                    >
                      {rp.bet >= 100_000 ? '🔥' : ''}{formatShortK(rp.bet)}
                    </span>
                  )}
                </div>

                <div className="opp-cards">
                  {rev
                    ? rev.tiles.map((t, i) => <PaperDomino key={i} tile={t} size="xs" />)
                    : Array.from({ length: tileCount }).map((_, i) => (
                        <PaperDomino key={i} faceDown size="xs" />
                      ))}
                  {rev && (
                    <span
                      className={`badge ${rev.evaluatedHand.handType === 'TRIPLE' ? 'badge-gold' : 'badge-mint'}`}
                      style={{ marginLeft: 'auto', fontSize: '10px', padding: '2px 6px' }}
                    >
                      {rev.evaluatedHand.handType === 'TRIPLE'
                        ? 'TRIPLE'
                        : rev.evaluatedHand.numericScore}
                    </span>
                  )}
                </div>

                <div className="opp-foot">
                  <span className="mono">{formatShortK(m.balance)}</span>
                  {settle ? (
                    <span
                      className={
                        settle.paymentStatus === 'SKIPPED_UDEG'
                          ? 'delta-skip'
                          : settle.balanceDelta >= 0
                            ? 'delta-pos'
                            : 'delta-neg'
                      }
                    >
                      {settle.paymentStatus === 'SKIPPED_UDEG'
                        ? 'Menang·Skip'
                        : formatSignedRupiah(settle.balanceDelta)}
                    </span>
                  ) : (
                    <span>
                      {activeDrawUid === m.userId
                        ? 'Memilih...'
                        : rp?.decision === 'STOP'
                          ? 'Stop'
                          : rp?.decision === 'DRAW'
                            ? '+Kartu 3'
                            : rp?.betLocked
                              ? 'Siap'
                              : 'Bet...'}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {/* Compact Result Banner inside oval on NEXT_ROUND / FINISHED */}
        {round && (snapshot.phase === 'NEXT_ROUND' || snapshot.phase === 'FINISHED') && (
          <div className="result-banner" role="status">
            <div>
              {round.cancelledReason ? (
                <strong style={{ color: 'var(--gold)' }}>Ronde dibatalkan ({round.cancelledReason})</strong>
              ) : isViewerDealer ? (
                <span>
                  Bandar:{' '}
                  <strong className={round.dealerDelta >= 0 ? 'delta-pos' : 'delta-neg'}>
                    {formatSignedRupiah(round.dealerDelta)}
                  </strong>
                  {skipCount > 0 && <span className="delta-skip"> · {skipCount} Skip</span>}
                </span>
              ) : viewerSettlement ? (
                <span>
                  Hasil Anda:{' '}
                  {viewerSettlement.paymentStatus === 'SKIPPED_UDEG' ? (
                    <strong className="delta-skip">Menang ({viewerSettlement.multiplier}×) · Udeg Skip</strong>
                  ) : viewerSettlement.outcome === 'WIN' ? (
                    <strong className="delta-pos">
                      Menang {viewerSettlement.multiplier}× ({formatSignedRupiah(viewerSettlement.balanceDelta)})
                    </strong>
                  ) : (
                    <strong className="delta-neg">
                      Kalah ({formatSignedRupiah(viewerSettlement.balanceDelta)})
                    </strong>
                  )}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              className="hud-btn"
              onClick={onOpenLedger}
              style={{ flexShrink: 0 }}
            >
              Rincian
            </button>
          </div>
        )}
      </section>

      {/* ZONA 3: Your Private Hand */}
      <section
        className={`hand-zone ${winBanner ? 'is-win-glow' : ''}`}
        aria-label="Kartu tangan Anda"
      >
        <div className="hand-zone-head">
          <span>
            <strong>{viewerMember?.displayName ?? 'Anda'}</strong>{' '}
            <span className={`badge ${isViewerDealer ? 'badge-gold' : 'badge-mint'}`}>
              {isViewerDealer ? 'Bandar' : `#${viewerRoundPlayer?.seatOrder ?? '-'}`}
            </span>
          </span>
          <span className="mono">
            <strong>{formatRupiah(viewerMember?.balance ?? 0)}</strong>
            {viewerRoundPlayer && !isViewerDealer && viewerRoundPlayer.betLocked && (
              <span style={{ color: 'var(--gold)', marginLeft: '6px' }}>
                Bet {formatShortK(viewerRoundPlayer.bet)}
              </span>
            )}
          </span>
        </div>

        <div className="hand-row" style={{ minHeight: '105px' }}>
          {snapshot.myTiles.length > 0 ? (
            <>
              {snapshot.myTiles.map((tile, idx) => (
                <PaperDomino key={idx} tile={tile} size="md" />
              ))}
              {myEval ? (
                <div style={{ display: 'grid', gap: '4px', marginLeft: '6px' }}>
                  <span className={`badge ${myEval.handType === 'TRIPLE' ? 'badge-gold' : 'badge-mint'}`}>
                    {myEval.handType === 'TRIPLE'
                      ? 'TRIPLE (3×)'
                      : `Nilai ${myEval.numericScore}${myEval.numericScore === 9 ? ' (2×)' : ''}`}
                  </span>
                  {myEval.isPureNine && (
                    <span className="muted" style={{ fontSize: '11px' }}>9 Murni</span>
                  )}
                </div>
              ) : (
                <span className="muted" style={{ fontSize: '12px', marginLeft: '6px' }}>
                  Titik: {snapshot.myTiles[0]![0] + snapshot.myTiles[0]![1]}
                </span>
              )}
            </>
          ) : (
            <span className="muted" style={{ fontSize: '12px' }}>
              Menunggu pembagian kartu...
            </span>
          )}
        </div>
      </section>

      {/* ZONA 4: One-Handed Bottom Thumb Action Bar */}
      <footer className="thumb-bar" aria-label="Aksi ibu jari">
        {snapshot.phase === 'ROUND_SETUP' && isViewerDealer && (
          <BetPanel mode="UDEG" maxAmount={availableViewerBalance} onSubmit={onSetUdeg} />
        )}

        {snapshot.phase === 'ROUND_SETUP' && !isViewerDealer && (
          <div className="callout callout-gold" style={{ textAlign: 'center' }}>
            Menunggu Bandar <strong>{dealerMember?.displayName}</strong> menetapkan Udeg...
          </div>
        )}

        {snapshot.phase === 'BETTING' && !isViewerDealer && viewerRoundPlayer && !viewerRoundPlayer.betLocked && (
          <BetPanel mode="BET" maxAmount={availableViewerBalance} onSubmit={onPlaceBet} />
        )}

        {snapshot.phase === 'BETTING' && (isViewerDealer || viewerRoundPlayer?.betLocked) && (
          <div className="callout" style={{ textAlign: 'center' }}>
            {isViewerDealer
              ? 'Menunggu semua pemain mengunci taruhan...'
              : `Taruhan ${formatRupiah(viewerRoundPlayer?.bet ?? 0)} terkunci. Menunggu pemain lain...`}
          </div>
        )}

        {snapshot.phase === 'DRAW_DECISION' && isViewerDrawTurn && (
          <div className="thumb-row">
            <button type="button" className="btn-ghost thumb-cta" onClick={onStop}>
              Stop (2 Kartu)
            </button>
            <button type="button" className="btn-primary thumb-cta" onClick={onDraw}>
              + Kartu Ke-3
            </button>
          </div>
        )}

        {snapshot.phase === 'DRAW_DECISION' && !isViewerDrawTurn && (
          <div className="callout" style={{ textAlign: 'center' }}>
            Giliran <strong>{snapshot.members.find((m) => m.userId === activeDrawUid)?.displayName ?? '...'}</strong> memilih Stop/Draw...
          </div>
        )}

        {snapshot.phase === 'NEXT_ROUND' && (
          <button type="button" className="btn-primary thumb-cta" onClick={onNextRound}>
            Lanjut Ronde #{snapshot.roundSequence + 1}
          </button>
        )}

        {snapshot.phase === 'FINISHED' && (
          <button type="button" className="btn-gold thumb-cta" onClick={onExitLobby}>
            Sesi Selesai · Buat Meja Baru
          </button>
        )}
      </footer>
    </div>
  );
}
