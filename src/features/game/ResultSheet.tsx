import type { RoomMember, RoundState } from '../../domain';
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

  return (
    <section className="panel-card" aria-label="Hasil settlement ronde">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '17px' }}>
            Settlement Ronde #{round.sequence}
          </h3>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: '13px' }}>
            Bandar: <strong>{nameOf(round.dealerId)}</strong>
            {dealerReveal && (
              <>
                {' '}·{' '}
                {dealerReveal.evaluatedHand.handType === 'TRIPLE'
                  ? `TRIPLE (skor ${dealerReveal.evaluatedHand.numericScore})`
                  : `Nilai ${dealerReveal.evaluatedHand.numericScore}`}
              </>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <span className="badge badge-gold">
            Sisa Udeg: {formatRupiah(round.udegRemaining)} / {formatRupiah(round.udegLimit)}
          </span>
          <span className={`badge ${round.dealerDelta >= 0 ? 'badge-mint' : 'badge-red'}`}>
            Delta Bandar: {formatSignedRupiah(round.dealerDelta)}
          </span>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Urutan</th>
              <th>Pemain</th>
              <th>Tangan</th>
              <th>Status</th>
              <th>Bet</th>
              <th>Klaim</th>
              <th>Delta Bersih</th>
              <th>Udeg Sisa</th>
            </tr>
          </thead>
          <tbody>
            {round.settlements.map((s) => {
              const rev = round.reveals[s.playerId];
              const isTie = rev && rev.evaluatedHand.rank === dealerRank;
              return (
                <tr key={s.playerId}>
                  <td className="mono">#{s.seatOrder}</td>
                  <td><strong>{nameOf(s.playerId)}</strong></td>
                  <td>
                    {rev
                      ? rev.evaluatedHand.handType === 'TRIPLE'
                        ? `TRIPLE (${rev.evaluatedHand.numericScore})`
                        : `Nilai ${rev.evaluatedHand.numericScore}${rev.evaluatedHand.isPureNine ? ' · 9 Murni' : ''}`
                      : '—'}
                  </td>
                  <td>
                    {s.paymentStatus === 'SKIPPED_UDEG' ? (
                      <span className="badge badge-gold">
                        Menang ({s.multiplier}×) · dilewati, Udeg tidak cukup
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
                  </td>
                  <td>{formatRupiah(s.bet)}</td>
                  <td>{s.claim > 0 ? formatRupiah(s.claim) : '—'}</td>
                  <td
                    className={
                      s.paymentStatus === 'SKIPPED_UDEG'
                        ? 'delta-skip'
                        : s.balanceDelta >= 0
                          ? 'delta-pos'
                          : 'delta-neg'
                    }
                  >
                    {s.paymentStatus === 'SKIPPED_UDEG'
                      ? 'Rp0 (Skip)'
                      : formatSignedRupiah(s.balanceDelta)}
                  </td>
                  <td className="mono">{formatRupiah(s.udegAfter)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
