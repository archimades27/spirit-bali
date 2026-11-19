import type {
  RoomMember,
  RoundPlayerState,
  RoundRevealEntry,
  RoundSettlement,
  Tile,
} from '../domain';
import { formatRupiah, formatSignedRupiah } from '../services/format';
import { PaperDomino } from './PaperDomino';

interface PlayerSeatProps {
  readonly member: RoomMember;
  readonly roundPlayer?: RoundPlayerState;
  readonly isYou: boolean;
  readonly isTurn: boolean;
  readonly tileCount: number;
  readonly visibleTiles?: readonly Tile[];
  readonly reveal?: RoundRevealEntry;
  readonly settlement?: RoundSettlement;
}

export function PlayerSeat({
  member,
  roundPlayer,
  isYou,
  isTurn,
  tileCount,
  visibleTiles,
  reveal,
  settlement,
}: PlayerSeatProps) {
  const showFront = Boolean(reveal || (isYou && visibleTiles && visibleTiles.length > 0));
  const tilesToRender: readonly Tile[] = reveal
    ? reveal.tiles
    : isYou && visibleTiles
      ? visibleTiles
      : [];

  return (
    <article
      className={`seat-card ${isTurn ? 'is-turn' : ''} ${roundPlayer?.isDealer ? 'is-dealer' : ''} ${isYou ? 'is-you' : ''}`}
      aria-label={`Kursi ${member.displayName}`}
    >
      <div className="seat-header">
        <span className="seat-name">
          {roundPlayer && roundPlayer.seatOrder > 0 && (
            <span className="mono" style={{ color: 'var(--accent)', marginRight: '6px' }}>
              #{roundPlayer.seatOrder}
            </span>
          )}
          {member.displayName}
          {isYou ? ' (Anda)' : ''}
        </span>
        {member.status === 'BANKRUPT' && <span className="badge badge-red">Saldo Habis</span>}
        {member.status === 'WAITING_NEXT_ROUND' && <span className="badge">Tunggu Ronde</span>}
        {isTurn && <span className="badge badge-mint">Giliran</span>}
      </div>

      <div className="seat-meta">
        <span>Saldo: {formatRupiah(member.balance)}</span>
        {roundPlayer && !roundPlayer.isDealer && roundPlayer.betLocked && (
          <strong style={{ color: 'var(--text)' }}>Bet {formatRupiah(roundPlayer.bet)}</strong>
        )}
      </div>

      <div className="hand-row" style={{ justifyContent: 'flex-start', minHeight: '84px' }}>
        {showFront
          ? tilesToRender.map((t, i) => <PaperDomino key={i} tile={t} size="sm" />)
          : Array.from({ length: tileCount }).map((_, i) => (
              <PaperDomino key={i} faceDown size="sm" />
            ))}
      </div>

      <div className="seat-meta">
        {reveal ? (
          <span className={`badge ${reveal.evaluatedHand.handType === 'TRIPLE' ? 'badge-gold' : 'badge-mint'}`}>
            {reveal.evaluatedHand.handType === 'TRIPLE'
              ? `TRIPLE (Skor ${reveal.evaluatedHand.numericScore})`
              : `Nilai ${reveal.evaluatedHand.numericScore}${reveal.evaluatedHand.isPureNine ? ' · 9 Murni' : ''}`}
          </span>
        ) : roundPlayer ? (
          <span>
            {roundPlayer.decision === 'STOP'
              ? 'Stop (2 kartu)'
              : roundPlayer.decision === 'DRAW'
                ? 'Ambil kartu ke-3'
                : roundPlayer.betLocked
                  ? 'Bet terkunci'
                  : 'Menunggu bet...'}
          </span>
        ) : null}

        {settlement && (
          <span
            className={
              settlement.paymentStatus === 'SKIPPED_UDEG'
                ? 'delta-skip'
                : settlement.balanceDelta >= 0
                  ? 'delta-pos'
                  : 'delta-neg'
            }
          >
            {settlement.paymentStatus === 'SKIPPED_UDEG'
              ? 'Menang · Udeg Skip'
              : formatSignedRupiah(settlement.balanceDelta)}
          </span>
        )}
      </div>
    </article>
  );
}
