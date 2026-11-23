import { useCallback, useEffect, useRef, useState } from 'react';
import {
  evaluateHand,
  formatHandLabel,
  type EvaluatedHand,
  type RoundSettlement,
  type SafeRoomSnapshot,
} from '../../domain';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { BetPanel, getBetIntensity } from '../../components/BetPanel';
import { LeaderboardOverlay } from '../../components/LeaderboardOverlay';
import { PaperDomino } from '../../components/PaperDomino';
import { SqueezeTile } from '../../components/SqueezeTile';
import { TimerRing } from '../../components/TimerRing';
import { WinCelebration, type OutcomeKind } from '../../components/WinCelebration';
import { feedback, type WinTier } from '../../services/feedback';
import { formatRupiah, formatShortK, formatSignedRupiah } from '../../services/format';
import { prefersReducedMotion } from '../../services/motion';
import { useRevealSequence } from './useRevealSequence';

interface GameTableProps {
  readonly snapshot: SafeRoomSnapshot;
  readonly viewerId: string;
  readonly secondsLeft: number | null;
  readonly onSetUdeg: (amount: number) => string | null;
  readonly onPlaceBet: (amount: number) => string | null;
  readonly onStop: () => void;
  readonly onDraw: () => void;
  readonly onNextRound: () => void;
  readonly onOpenLedger: () => void;
  readonly onExitLobby: () => void;
}

interface FlyingChip {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly fx: number;
  readonly fy: number;
  readonly cls: string;
  readonly delay: number;
}

interface OutcomeBanner {
  readonly kind: OutcomeKind;
  readonly title: string;
  readonly subtitle?: string;
  readonly delta: number;
  readonly tier?: WinTier;
}

function chipClassFor(amount: number): string {
  if (amount >= 250_000) return 'chip-250';
  if (amount >= 100_000) return 'chip-100';
  if (amount >= 50_000) return 'chip-50';
  return 'chip-10';
}

function shortHandLabel(hand: EvaluatedHand): string {
  switch (hand.handType) {
    case 'SIX_SIX_SIX':
      return '666';
    case 'TRIPLE':
      return 'TRIPLE';
    case 'BESAR':
      return `BSR ${hand.totalPips}`;
    default:
      return String(hand.numericScore);
  }
}

function handTierClass(hand: EvaluatedHand): string {
  switch (hand.handType) {
    case 'SIX_SIX_SIX':
      return 'hv-six66';
    case 'TRIPLE':
      return 'hv-triple';
    case 'BESAR':
      return 'hv-besar';
    default:
      return hand.numericScore === 9 ? 'hv-nine' : hand.numericScore >= 7 ? 'hv-good' : 'hv-low';
  }
}

function winTierOf(hand: EvaluatedHand | undefined, multiplier: number): WinTier {
  if (hand?.handType === 'SIX_SIX_SIX') return 'six66';
  if (hand?.handType === 'TRIPLE') return 'triple';
  if (hand?.handType === 'BESAR') return 'besar';
  if (multiplier === 2) return 'nine';
  return 'normal';
}

function deltaClass(s: RoundSettlement): string {
  if (s.paymentStatus === 'SKIPPED_UDEG') return 'delta-skip';
  if (s.paymentStatus === 'CAPPED_UDEG') return 'delta-capped';
  return s.balanceDelta >= 0 ? 'delta-pos' : 'delta-neg';
}

function deltaText(s: RoundSettlement, short = false): string {
  if (s.paymentStatus === 'SKIPPED_UDEG') return short ? 'Menang·Skip' : 'Menang · Udeg Skip';
  if (s.paymentStatus === 'CAPPED_UDEG') return short ? 'Bebas' : 'Kalah · Bebas Udeg';
  return formatSignedRupiah(s.balanceDelta);
}

export function GameTable({
  snapshot,
  viewerId,
  secondsLeft,
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

  const ringSeats = snapshot.members
    .filter(
      (m) =>
        m.userId !== dealerId && (isViewerDealer || m.userId !== viewerId) && m.status !== 'LEFT'
    )
    .sort((a, b) => {
      const orderA = round?.players[a.userId]?.seatOrder ?? 99;
      const orderB = round?.players[b.userId]?.seatOrder ?? 99;
      return orderA - orderB || a.seat - b.seat;
    });

  const isSettledPhase =
    Boolean(round) &&
    !round?.cancelledReason &&
    (snapshot.phase === 'NEXT_ROUND' || snapshot.phase === 'FINISHED');

  const reveal = useRevealSequence(
    round?.roundId ?? null,
    isSettledPhase,
    round?.settlementOrder ?? []
  );
  const showResults = isSettledPhase && reveal.done;

  const myEval =
    snapshot.myTiles.length >= 2 && snapshot.myTiles.length <= 3
      ? evaluateHand(snapshot.myTiles)
      : null;

  // ---- Squeeze (peek) for the viewer's own 3rd card ----
  const [squeezedRound, setSqueezedRound] = useState<string | null>(null);
  const viewerSeatRevealedBySequence = isViewerDealer
    ? reveal.dealerRevealed
    : reveal.isSeatRevealed(viewerId);
  const squeezing =
    Boolean(round) &&
    snapshot.myTiles.length === 3 &&
    squeezedRound !== round?.roundId &&
    !(isSettledPhase && viewerSeatRevealedBySequence) &&
    !prefersReducedMotion();

  const dealerRoundNumber = Math.min(
    snapshot.rules.dealerRotationRounds,
    (round ? round.dealerRoundsCompletedBefore : snapshot.dealerRoundsCompleted) + 1
  );

  const udegLimit = round?.udegLimit ?? 0;
  const udegRemaining = round?.udegRemaining ?? 0;
  const shownUdegRemaining = isSettledPhase && !showResults ? udegLimit : udegRemaining;
  const udegPct =
    udegLimit > 0
      ? Math.max(0, Math.min(100, Math.round((Math.min(shownUdegRemaining, udegLimit) / udegLimit) * 100)))
      : 0;

  const availableViewerBalance = viewerMember ? viewerMember.balance - viewerMember.reservedBet : 0;

  const settlementOf = useCallback(
    (uid: string) => round?.settlements.find((s) => s.playerId === uid),
    [round]
  );
  const viewerSettlement = settlementOf(viewerId);
  const skipCount = round?.settlements.filter((s) => s.paymentStatus === 'SKIPPED_UDEG').length ?? 0;
  const cappedCount = round?.settlements.filter((s) => s.paymentStatus === 'CAPPED_UDEG').length ?? 0;

  /** Balance before this round's settlement until the reveal finishes. */
  const shownBalance = (uid: string, balance: number) => {
    if (!isSettledPhase || showResults || !round) return balance;
    if (uid === dealerId) return balance - round.dealerDelta;
    return balance - (settlementOf(uid)?.balanceDelta ?? 0);
  };

  const potTotal = round
    ? Object.values(round.players).reduce((sum, p) => sum + (p.betLocked && !p.isDealer ? p.bet : 0), 0)
    : 0;
  const showPot =
    potTotal > 0 &&
    (snapshot.phase === 'BETTING' ||
      snapshot.phase === 'SECOND_DEAL' ||
      snapshot.phase === 'DRAW_DECISION' ||
      (isSettledPhase && !showResults));

  // ---- Outcome banner for the viewer ----
  let banner: OutcomeBanner | null = null;
  if (showResults && round) {
    if (isViewerDealer) {
      const allCollected =
        round.settlements.length > 1 && round.settlements.every((s) => s.paymentStatus === 'COLLECTED');
      const cappedNote = cappedCount > 0 ? `Udeg penuh · ${cappedCount} pemain bebas bayar` : undefined;
      if (round.dealerDelta > 0) {
        banner = {
          kind: 'win',
          tier: 'dealer',
          title: allCollected ? 'SAPU BERSIH!' : 'BANDAR MENANG!',
          subtitle: cappedNote,
          delta: round.dealerDelta,
        };
      } else if (round.dealerDelta < 0) {
        banner = { kind: 'lose', title: 'BANDAR BAYAR', delta: round.dealerDelta };
      }
    } else if (viewerSettlement) {
      const myHand = round.reveals[viewerId]?.evaluatedHand;
      const dealerHand = round.reveals[dealerId]?.evaluatedHand;
      if (viewerSettlement.paymentStatus === 'PAID') {
        const tier = winTierOf(myHand, viewerSettlement.multiplier);
        banner = {
          kind: 'win',
          tier,
          title:
            tier === 'six66'
              ? '666 JACKPOT 3×'
              : tier === 'triple'
                ? 'TRIPLE 3×!'
                : tier === 'besar'
                  ? `BESAR ${myHand?.totalPips ?? ''} · 2×`
                  : tier === 'nine'
                    ? 'NILAI 9 · 2×'
                    : 'MENANG!',
          delta: viewerSettlement.balanceDelta,
        };
      } else if (viewerSettlement.paymentStatus === 'SKIPPED_UDEG') {
        banner = {
          kind: 'skip',
          title: 'MENANG, TAPI UDEG HABIS 😤',
          subtitle: `Klaim ${formatRupiah(viewerSettlement.claim)} tidak terbayar`,
          delta: 0,
        };
      } else if (viewerSettlement.paymentStatus === 'CAPPED_UDEG') {
        banner = {
          kind: 'capped',
          title: 'LOLOS! BEBAS UDEG',
          subtitle: 'Untung Bandar sudah penuh — Anda tidak bayar',
          delta: 0,
        };
      } else {
        const isTie = myHand && dealerHand && myHand.rank === dealerHand.rank;
        const nearMiss =
          myHand &&
          dealerHand &&
          myHand.handType === 'NORMAL' &&
          dealerHand.handType === 'NORMAL' &&
          dealerHand.numericScore - myHand.numericScore === 1;
        banner = {
          kind: 'lose',
          title: isTie ? 'SERI — BANDAR AMBIL' : 'KALAH',
          subtitle: nearMiss ? 'Hampir! Selisih 1' : undefined,
          delta: viewerSettlement.balanceDelta,
        };
      }
    }
  }

  const [dismissedRound, setDismissedRound] = useState<string | null>(null);
  const showBanner = banner && round && dismissedRound !== round.roundId && snapshot.phase !== 'FINISHED';

  // Auto-dismiss the celebration overlay once its animation has played.
  const bannerTier = banner?.tier;
  const bannerKind = banner?.kind;
  useEffect(() => {
    if (!showBanner || !round) return;
    const ms =
      bannerKind === 'win' && bannerTier === 'six66'
        ? 3700
        : bannerKind === 'win' && bannerTier === 'triple'
          ? 3100
          : 2700;
    const id = round.roundId;
    const t = window.setTimeout(() => setDismissedRound(id), ms);
    return () => window.clearTimeout(t);
  }, [showBanner, round, bannerKind, bannerTier]);

  // Fire outcome sound once per round.
  const soundedRound = useRef<string | null>(null);
  useEffect(() => {
    if (!showResults || !round || !banner || soundedRound.current === round.roundId) return;
    soundedRound.current = round.roundId;
    if (banner.kind === 'win') feedback.win(banner.tier ?? 'normal');
    else if (banner.kind === 'capped') feedback.relief();
    else feedback.lose();
  });

  // ---- Flying chips (bets to pot, settlement to/from Bandar) ----
  const layerRef = useRef<HTMLDivElement>(null);
  const potRef = useRef<HTMLDivElement>(null);
  const dealerRef = useRef<HTMLDivElement>(null);
  const handZoneRef = useRef<HTMLElement>(null);
  const seatRefs = useRef<Record<string, HTMLElement | null>>({});
  const [chips, setChips] = useState<readonly FlyingChip[]>([]);
  const chipId = useRef(0);

  const elFor = useCallback(
    (uid: string): HTMLElement | null => {
      if (uid === viewerId) return handZoneRef.current;
      if (uid === dealerId) return dealerRef.current;
      return seatRefs.current[uid] ?? null;
    },
    [viewerId, dealerId]
  );

  const launch = useCallback(
    (from: HTMLElement | null, to: HTMLElement | null, cls: string, count: number, baseDelay = 0) => {
      const layer = layerRef.current;
      if (!from || !to || !layer || prefersReducedMotion()) return;
      const lr = layer.getBoundingClientRect();
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const x0 = a.left + a.width / 2 - lr.left;
      const y0 = a.top + a.height / 2 - lr.top;
      const x1 = b.left + b.width / 2 - lr.left;
      const y1 = b.top + b.height / 2 - lr.top;
      const fresh: FlyingChip[] = Array.from({ length: count }, (_, i) => ({
        id: ++chipId.current,
        x: x1 + (i - (count - 1) / 2) * 6,
        y: y1,
        fx: x0 - x1,
        fy: y0 - y1,
        cls,
        delay: baseDelay + i * 70,
      }));
      setChips((prev) => [...prev, ...fresh]);
      const ids = new Set(fresh.map((c) => c.id));
      window.setTimeout(
        () => setChips((prev) => prev.filter((c) => !ids.has(c.id))),
        900 + baseDelay + count * 70
      );
    },
    []
  );

  const lockedRef = useRef<{ roundId: string | null; locked: Set<string> }>({
    roundId: null,
    locked: new Set(),
  });
  useEffect(() => {
    if (!round) return;
    const nowLocked = new Set(
      Object.values(round.players)
        .filter((p) => p.betLocked && !p.isDealer)
        .map((p) => p.userId)
    );
    const prev = lockedRef.current;
    if (prev.roundId === round.roundId) {
      for (const uid of nowLocked) {
        if (!prev.locked.has(uid)) {
          const bet = round.players[uid]?.bet ?? 0;
          launch(elFor(uid), potRef.current, chipClassFor(bet), bet >= 100_000 ? 3 : 2);
        }
      }
    }
    lockedRef.current = { roundId: round.roundId, locked: nowLocked };
  }, [round, launch, elFor]);

  const settledChipsRound = useRef<string | null>(null);
  useEffect(() => {
    if (!showResults || !round || settledChipsRound.current === round.roundId) return;
    settledChipsRound.current = round.roundId;
    const dealerEl = elFor(dealerId);
    round.settlements.forEach((s, i) => {
      if (s.paymentStatus === 'COLLECTED') {
        launch(elFor(s.playerId), dealerEl, chipClassFor(s.loss), 2, i * 90);
      } else if (s.paymentStatus === 'PAID') {
        launch(dealerEl, elFor(s.playerId), chipClassFor(s.paid), s.multiplier + 1, 250 + i * 90);
      }
    });
  }, [showResults, round, dealerId, elFor, launch]);

  const totalCycleSeats = snapshot.members.filter((m) => m.status !== 'LEFT').length;
  const currentCyclePos = Math.min(totalCycleSeats, snapshot.dealersServed.length + 1);
  const timeouts = snapshot.rules.timeoutsSec;

  const dealerFaceUp = Boolean(dealerReveal) && reveal.dealerRevealed;
  const viewerHandBig = squeezing ? null : myEval;
  const viewerDelta = isViewerDealer ? (round?.dealerDelta ?? 0) : (viewerSettlement?.balanceDelta ?? 0);

  return (
    <div className="portrait-game">
      {snapshot.phase === 'FINISHED' && reveal.done && (
        <LeaderboardOverlay
          snapshot={snapshot}
          viewerId={viewerId}
          onOpenLedger={onOpenLedger}
          onExitLobby={onExitLobby}
        />
      )}

      <div className="fly-layer" ref={layerRef} aria-hidden="true">
        {chips.map((c) => (
          <span
            key={c.id}
            className={`fly-chip ${c.cls}`}
            style={{
              left: `${c.x}px`,
              top: `${c.y}px`,
              animationDelay: `${c.delay}ms`,
              ['--fx' as string]: `${c.fx}px`,
              ['--fy' as string]: `${c.fy}px`,
            }}
          />
        ))}
      </div>

      {/* ZONA 2: Vertical Oval Felt Table */}
      <section
        className={`table-zone ${reveal.running ? 'is-revealing' : ''} ${showBanner && banner?.tier === 'six66' ? 'is-jackpot' : ''} ${showBanner && banner?.tier === 'triple' ? 'is-shake' : ''}`}
        aria-label="Meja Spirit Bali"
      >
        {showBanner && banner && round && (
          <WinCelebration
            roundKey={round.roundId}
            kind={banner.kind}
            title={banner.title}
            subtitle={banner.subtitle}
            delta={banner.delta}
            tier={banner.tier}
            onDismiss={() => setDismissedRound(round.roundId)}
          />
        )}

        {reveal.running && (
          <div className="reveal-caption" role="status">
            {reveal.dealerRevealed ? 'Hitung hasil...' : 'Buka kartu...'}
          </div>
        )}

        {/* Top of Oval: Bandar / Cong */}
        <div className="dealer-top" ref={dealerRef}>
          <div className="dealer-bar">
            <span className="badge badge-gold">
              ★ BANDAR{' '}
              {snapshot.sessionMode === 'ONE_CYCLE' ? `${currentCyclePos}/${totalCycleSeats} · ` : ''}R
              {dealerRoundNumber}/{snapshot.rules.dealerRotationRounds}
            </span>
            <strong style={{ fontSize: '13px' }}>
              {dealerMember?.displayName}
              {isViewerDealer && dealerMember?.displayName.toLowerCase() !== 'anda' ? ' (Anda)' : ''}
            </strong>
            <AnimatedNumber
              className="muted mono dealer-balance"
              value={shownBalance(dealerId, dealerMember?.balance ?? 0)}
              format={formatRupiah}
              showTrend
            />
            {showResults && round && round.dealerDelta !== 0 && !isViewerDealer && (
              <span
                key={round.roundId}
                className={`float-delta ${round.dealerDelta > 0 ? 'delta-pos' : 'delta-neg'}`}
              >
                {formatSignedRupiah(round.dealerDelta)}
              </span>
            )}
          </div>

          <div className={`udeg-strip ${showResults && udegRemaining === 0 ? 'is-empty' : ''}`} aria-label="Status Udeg">
            <span className="muted">Udeg</span>
            <div className="udeg-mini-bar" aria-hidden="true">
              <div className="udeg-mini-fill" style={{ width: `${udegPct}%` }} />
            </div>
            <strong style={{ color: 'var(--gold)' }} className="mono">
              {udegLimit > 0 ? `${formatShortK(shownUdegRemaining)}/${formatShortK(udegLimit)}` : 'Set...'}
            </strong>
          </div>

          <div className="dealer-row">
          {!isViewerDealer && (
            <div className={`hand-row dealer-hand ${reveal.running && !reveal.dealerRevealed ? 'is-suspense' : ''}`}>
              {dealerFaceUp && dealerReveal
                ? dealerReveal.tiles.map((t, i) => (
                    <PaperDomino key={`f-${i}`} tile={t} size="xs" flipIn className="dealer-flip" />
                  ))
                : Array.from({ length: dealerReveal ? dealerReveal.tiles.length : dealerTileCount }).map(
                    (_, i) => <PaperDomino key={`b-${i}`} faceDown size="xs" />
                  )}
              {dealerFaceUp && dealerReveal && (
                <span className={`badge badge-gold hv-pop ${handTierClass(dealerReveal.evaluatedHand)}`} style={{ marginLeft: '4px' }}>
                  {formatHandLabel(dealerReveal.evaluatedHand)}
                </span>
              )}
              {activeDrawUid === dealerId && <span className="badge badge-mint thinking">Giliran</span>}
            </div>
          )}
        {showPot && (
          <div className="table-pot" ref={potRef} aria-label={`Total toh di meja ${formatRupiah(potTotal)}`}>
            <span className="pot-stack" aria-hidden="true">
              {Array.from({ length: Math.min(6, Math.ceil(potTotal / 50_000)) }).map((_, i) => (
                <span key={i} className={`stack-disc ${chipClassFor(potTotal / (i + 1))}`} style={{ bottom: `${i * 3}px` }} />
              ))}
            </span>
            <span className="pot-label">TOH</span>
            <AnimatedNumber className="mono pot-amount" value={potTotal} format={formatShortK} durationMs={500} />
          </div>
        )}
        {!showPot && <div ref={potRef} className="table-pot-anchor" aria-hidden="true" />}

          </div>
        </div>

        {/* Middle of Oval: Clockwise Opponent Seats */}
        <div className={`opponents-ring ${ringSeats.length === 1 ? 'count-1' : ''}`}>
          {ringSeats.map((m, idx) => {
            const rp = round?.players[m.userId];
            const rev = round?.reveals[m.userId];
            const faceUp = Boolean(rev) && reveal.isSeatRevealed(m.userId);
            const settle = showResults ? settlementOf(m.userId) : undefined;
            const tileCount = rev ? rev.tiles.length : (snapshot.handCounts[m.userId] ?? 0);
            const isOddLast =
              ringSeats.length % 2 === 1 && idx === ringSeats.length - 1 && ringSeats.length > 1;
            const resultClass = settle
              ? settle.paymentStatus === 'PAID'
                ? 'is-winner'
                : settle.paymentStatus === 'COLLECTED'
                  ? 'is-loser'
                  : ''
              : '';

            return (
              <article
                key={m.userId}
                ref={(el) => {
                  seatRefs.current[m.userId] = el;
                }}
                className={`opp-seat ${activeDrawUid === m.userId ? 'is-turn' : ''} ${isOddLast ? 'span-center' : ''} ${resultClass}`}
              >
                <div className="opp-head">
                  <span className="opp-name">
                    <span className="mono" style={{ color: 'var(--accent)', marginRight: '4px' }}>
                      #{rp?.seatOrder ?? '-'}
                    </span>
                    {m.displayName}
                  </span>
                  {rp && rp.betLocked && (
                    <span className={`bet-chip mono tier-${getBetIntensity(rp.bet, m.balance).level}`}>
                      {rp.bet >= 100_000 ? '🔥' : ''}
                      {formatShortK(rp.bet)}
                    </span>
                  )}
                </div>

                <div className="opp-cards">
                  {faceUp && rev
                    ? rev.tiles.map((t, i) => <PaperDomino key={`f-${i}`} tile={t} size="xs" flipIn />)
                    : Array.from({ length: tileCount }).map((_, i) => (
                        <PaperDomino key={`b-${i}`} faceDown size="xs" />
                      ))}
                  {faceUp && rev && (
                    <span
                      className={`badge hv-pop ${rev.evaluatedHand.handType !== 'NORMAL' ? 'badge-gold' : 'badge-mint'} ${handTierClass(rev.evaluatedHand)}`}
                      style={{ marginLeft: 'auto', fontSize: '10px', padding: '2px 6px' }}
                    >
                      {shortHandLabel(rev.evaluatedHand)}
                    </span>
                  )}
                </div>

                <div className="opp-foot">
                  <AnimatedNumber
                    className="mono"
                    value={shownBalance(m.userId, m.balance)}
                    format={formatShortK}
                    showTrend
                  />
                  {settle ? (
                    <span className={deltaClass(settle)}>{deltaText(settle, true)}</span>
                  ) : (
                    <span className={activeDrawUid === m.userId ? 'thinking' : ''}>
                      {activeDrawUid === m.userId
                        ? 'Memilih'
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

                {settle && settle.balanceDelta !== 0 && (
                  <span key={round?.roundId} className={`float-delta ${deltaClass(settle)}`}>
                    {formatSignedRupiah(settle.balanceDelta)}
                  </span>
                )}
              </article>
            );
          })}
        </div>

        {/* Compact Result Banner inside oval on NEXT_ROUND / FINISHED */}
        {round && (snapshot.phase === 'NEXT_ROUND' || snapshot.phase === 'FINISHED') && (round.cancelledReason || showResults) && (
          <div className="result-banner" role="status">
            <div className="result-banner-text">
              {round.cancelledReason ? (
                <strong style={{ color: 'var(--gold)' }}>Ronde dibatalkan ({round.cancelledReason})</strong>
              ) : isViewerDealer ? (
                <span>
                  <span className="result-icon">{round.dealerDelta > 0 ? '🏆' : round.dealerDelta < 0 ? '💸' : '➖'}</span>
                  Bandar:{' '}
                  <strong className={round.dealerDelta >= 0 ? 'delta-pos' : 'delta-neg'}>
                    {formatSignedRupiah(round.dealerDelta)}
                  </strong>
                  {skipCount > 0 && <span className="delta-skip"> · {skipCount} Skip</span>}
                  {cappedCount > 0 && <span className="delta-capped"> · {cappedCount} Bebas</span>}
                </span>
              ) : viewerSettlement ? (
                <span>
                  <span className="result-icon">
                    {viewerSettlement.paymentStatus === 'PAID'
                      ? '🏆'
                      : viewerSettlement.paymentStatus === 'COLLECTED'
                        ? '💸'
                        : '⏭'}
                  </span>
                  Hasil Anda:{' '}
                  {viewerSettlement.paymentStatus === 'SKIPPED_UDEG' ? (
                    <strong className="delta-skip">Menang ({viewerSettlement.multiplier}×) · Udeg Skip</strong>
                  ) : viewerSettlement.paymentStatus === 'CAPPED_UDEG' ? (
                    <strong className="delta-capped">Kalah · Bebas Udeg (Rp0)</strong>
                  ) : viewerSettlement.outcome === 'WIN' ? (
                    <strong className="delta-pos">
                      Menang {viewerSettlement.multiplier}× ({formatSignedRupiah(viewerSettlement.balanceDelta)})
                    </strong>
                  ) : (
                    <strong className="delta-neg">Kalah ({formatSignedRupiah(viewerSettlement.balanceDelta)})</strong>
                  )}
                </span>
              ) : null}
            </div>
            <button type="button" className="hud-btn" onClick={onOpenLedger} style={{ flexShrink: 0 }}>
              Rincian
            </button>
          </div>
        )}
      </section>

      {/* ZONA 3: Your Private Hand */}
      <section
        ref={handZoneRef}
        className={`hand-zone ${showBanner && banner?.kind === 'win' ? 'is-win-glow' : ''} ${showResults && banner?.kind === 'lose' ? 'is-lose-dim' : ''}`}
        aria-label="Kartu tangan Anda"
      >
        <div className="hand-zone-head">
          <span>
            <strong>{viewerMember?.displayName ?? 'Anda'}</strong>{' '}
            <span className={`badge ${isViewerDealer ? 'badge-gold' : 'badge-mint'}`}>
              {isViewerDealer ? 'Bandar' : `#${viewerRoundPlayer?.seatOrder ?? '-'}`}
            </span>
          </span>
          <span className="mono hand-balance">
            <AnimatedNumber
              value={shownBalance(viewerId, viewerMember?.balance ?? 0)}
              format={formatRupiah}
              durationMs={1200}
              showTrend
            />
            {viewerRoundPlayer && !isViewerDealer && viewerRoundPlayer.betLocked && (
              <span className="bet-chip mono tier-warm" style={{ marginLeft: '6px' }}>
                Toh {formatShortK(viewerRoundPlayer.bet)}
              </span>
            )}
            {showResults && viewerDelta !== 0 && round && (
              <span key={round.roundId} className={`float-delta ${viewerDelta > 0 ? 'delta-pos' : 'delta-neg'}`}>
                {formatSignedRupiah(viewerDelta)}
              </span>
            )}
          </span>
        </div>

        <div className="hand-row my-hand" style={{ minHeight: '105px' }}>
          {snapshot.myTiles.length > 0 ? (
            <>
              <div className="hand-fan">
                {snapshot.myTiles.map((tile, idx) =>
                  squeezing && idx === 2 && round ? (
                    <SqueezeTile key={`sq-${round.roundId}`} tile={tile} onRevealed={() => setSqueezedRound(round.roundId)} />
                  ) : (
                    <PaperDomino key={idx} tile={tile} size="md" />
                  )
                )}
              </div>
              {viewerHandBig ? (
                <div className={`hand-value ${handTierClass(viewerHandBig)}`} key={`${snapshot.myTiles.length}-${viewerHandBig.rank}`}>
                  <span className="hand-value-main">
                    {viewerHandBig.handType === 'NORMAL'
                      ? viewerHandBig.numericScore
                      : shortHandLabel(viewerHandBig)}
                  </span>
                  <span className="hand-value-sub">
                    {viewerHandBig.handType === 'SIX_SIX_SIX' || viewerHandBig.handType === 'TRIPLE'
                      ? '3× bayar'
                      : viewerHandBig.handType === 'BESAR' || viewerHandBig.numericScore === 9
                        ? '2× bayar'
                        : 'Nilai'}
                    {viewerHandBig.isPureNine ? ' · 9 Murni' : ''}
                  </span>
                </div>
              ) : squeezing ? (
                <div className="hand-value hv-low">
                  <span className="hand-value-main">?</span>
                  <span className="hand-value-sub">Buka kartu 3</span>
                </div>
              ) : (
                <div className="hand-value hv-low">
                  <span className="hand-value-main">{snapshot.myTiles[0]![0] + snapshot.myTiles[0]![1]}</span>
                  <span className="hand-value-sub">Titik kartu 1</span>
                </div>
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
          <BetPanel
            mode="UDEG"
            maxAmount={availableViewerBalance}
            secondsLeft={secondsLeft}
            totalSeconds={timeouts.roundSetup}
            onSubmit={onSetUdeg}
          />
        )}

        {snapshot.phase === 'ROUND_SETUP' && !isViewerDealer && (
          <div className="callout callout-gold" style={{ textAlign: 'center' }}>
            Menunggu Bandar <strong>{dealerMember?.displayName}</strong> menetapkan Udeg...
          </div>
        )}

        {snapshot.phase === 'BETTING' && !isViewerDealer && viewerRoundPlayer && !viewerRoundPlayer.betLocked && (
          <BetPanel
            key={round?.roundId}
            mode="BET"
            maxAmount={availableViewerBalance}
            secondsLeft={secondsLeft}
            totalSeconds={timeouts.betting}
            onSubmit={onPlaceBet}
          />
        )}

        {snapshot.phase === 'BETTING' && (isViewerDealer || viewerRoundPlayer?.betLocked) && (
          <div className="callout locked-callout" style={{ textAlign: 'center' }}>
            {isViewerDealer
              ? 'Menunggu semua pemain mengunci toh...'
              : `Toh ${formatRupiah(viewerRoundPlayer?.bet ?? 0)} terkunci 🔒 Menunggu pemain lain...`}
          </div>
        )}

        {snapshot.phase === 'DRAW_DECISION' && isViewerDrawTurn && myEval && (
          <TimerRing secondsLeft={secondsLeft} totalSeconds={timeouts.drawDecision}>
            <div className="thumb-row">
              <button
                type="button"
                className={`${myEval.numericScore >= 7 || myEval.handType !== 'NORMAL' ? 'btn-primary' : 'btn-ghost'} thumb-cta decision-btn`}
                onClick={onStop}
              >
                Stop
                <span className="cta-sub">Nilai {shortHandLabel(myEval)}</span>
              </button>
              <button
                type="button"
                className={`${myEval.numericScore <= 4 && myEval.handType === 'NORMAL' ? 'btn-primary' : 'btn-ghost'} thumb-cta decision-btn`}
                onClick={onDraw}
              >
                + Kartu Ke-3
                <span className="cta-sub">Ambil 1 kartu</span>
              </button>
            </div>
          </TimerRing>
        )}

        {snapshot.phase === 'DRAW_DECISION' && !isViewerDrawTurn && (
          <div className="callout" style={{ textAlign: 'center' }}>
            Giliran{' '}
            <strong>{snapshot.members.find((m) => m.userId === activeDrawUid)?.displayName ?? '...'}</strong>{' '}
            memilih Stop/Draw<span className="thinking" />
          </div>
        )}

        {isSettledPhase && reveal.running && (
          <button type="button" className="btn-ghost thumb-cta" onClick={reveal.skip}>
            Lewati animasi ⏩
          </button>
        )}

        {snapshot.phase === 'NEXT_ROUND' && (!isSettledPhase || reveal.done) && (
          <button type="button" className="btn-primary thumb-cta" onClick={onNextRound}>
            Lanjut Ronde #{snapshot.roundSequence + 1}
          </button>
        )}

        {snapshot.phase === 'FINISHED' && reveal.done && (
          <button type="button" className="btn-gold thumb-cta" onClick={onExitLobby}>
            Sesi Selesai · Buat Meja Baru
          </button>
        )}
      </footer>
    </div>
  );
}
