import { formatHandLabel, type RoomMember, type RoundState } from '../../domain';
import { formatRupiah, formatSignedRupiah } from '../../services/format';

interface ResultSheetProps {
  readonly round: RoundState;
  readonly members: readonly RoomMember[];
}

export function ResultSheet({ round, members }: ResultSheetProps) {
  const nameOf = (uid: string) =>
    members.find((m) => m.userId === uid)?.displayName ?? uid;

  if (round.cancelledReason) {
    return (
      <section className="panel-card" aria-label="Ronde dibatalkan">
        <div className="callout callout-gold">
          <strong>Ronde #{round.sequence} dibatalkan ({round.cancelledReason}).</strong>{' '}
          Seluruh taruhan cadangan dilepas, saldo utuh, dan penghitung rotasi bandar tidak bertambah (A07 / T36).
        </div>
      </section>
    );
  }

  const dealerReveal = round.reveals[round.dealerId];
  const dealerRank = dealerReveal?.evaluatedHand.rank ?? 0;
  const totalAyahan = round.settlements.reduce((sum, s) => sum + s.loss, 0);

  return (
    <section className="panel-card" aria-label="Hasil settlement ronde">
      <div style={{ display: 'grid', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '15px' }}>Settlement Ronde #{round.sequence}</h3>
          <span className="muted" style={{ fontSize: '12px' }}>
            Bandar: <strong>{nameOf(round.dealerId)}</strong>
            {dealerReveal && (
              <>
                {' '}· {formatHandLabel(dealerReveal.evaluatedHand)}
              </>
            )}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <span className="badge badge-gold">
            Kolam Udeg: {formatRupiah(round.udegLimit)}
            {totalAyahan > 0 ? ` + Ayahan ${formatRupiah(totalAyahan)}` : ''} → Sisa {formatRupiah(round.udegRemaining)}
          </span>
          <span className={`badge ${round.dealerDelta >= 0 ? 'badge-mint' : 'badge-red'}`}>
            Delta Bandar: {formatSignedRupiah(round.dealerDelta)}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '8px' }}>
        {round.settlements.map((s) => {
          const rev = round.reveals[s.playerId];
          const isTie = rev && rev.evaluatedHand.rank === dealerRank;
          return (
            <div
              key={s.playerId}
              style={{
                background: 'var(--soft)',
                border: '1px solid var(--line)',
                borderRadius: '10px',
                padding: '9px 10px',
                display: 'grid',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700 }}>
                  <span className="mono" style={{ color: 'var(--accent)', marginRight: '5px' }}>
                    #{s.seatOrder}
                  </span>
                  {nameOf(s.playerId)}
                  {rev && (
                    <span className="muted" style={{ fontWeight: 500, marginLeft: '6px', fontSize: '12px' }}>
                      {formatHandLabel(rev.evaluatedHand)}
                    </span>
                  )}
                </span>

                <span
                  className={`mono ${
                    s.paymentStatus === 'SKIPPED_UDEG'
                      ? 'delta-skip'
                      : s.paymentStatus === 'CAPPED_UDEG'
                        ? 'delta-capped'
                        : s.balanceDelta >= 0
                        ? 'delta-pos'
                        : 'delta-neg'
                  }`}
                  style={{ fontSize: '13px' }}
                >
                  {s.paymentStatus === 'SKIPPED_UDEG'
                    ? 'Rp0 (Skip)'
                    : s.paymentStatus === 'CAPPED_UDEG'
                      ? 'Rp0 (Bebas)'
                    : formatSignedRupiah(s.balanceDelta)}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {s.paymentStatus === 'SKIPPED_UDEG' ? (
                  <span className="badge badge-gold">
                    Menang ({s.multiplier}×) · dilewati, Udeg tidak cukup
                  </span>
                ) : s.paymentStatus === 'CAPPED_UDEG' ? (
                  <span className="badge">
                    Kalah · bebas bayar, untung Bandar sudah = Udeg
                  </span>
                ) : s.outcome === 'WIN' ? (
                  <span className="badge badge-mint">
                    Menang ({s.multiplier}×) · Dibayar
                  </span>
                ) : (
                  <span className="badge badge-red">
                    {isTie ? 'Seri · Bandar menang' : 'Kalah (1×)'}
                  </span>
                )}

                <span className="muted mono" style={{ fontSize: '11px' }}>
                  Bet {formatRupiah(s.bet)}
                  {s.claim > 0 ? ` · Klaim ${formatRupiah(s.claim)}` : ''} · Sisa {formatRupiah(s.udegAfter)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
