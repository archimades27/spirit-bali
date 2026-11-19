import { useEffect, useId, useRef } from 'react';
import type { SafeRoomSnapshot } from '../domain';
import { ResultSheet } from '../features/game/ResultSheet';
import { formatRupiah, formatSignedRupiah } from '../services/format';

interface LedgerModalProps {
  readonly open: boolean;
  readonly snapshot: SafeRoomSnapshot | null;
  readonly onClose: () => void;
}

export function LedgerModal({ open, snapshot, onClose }: LedgerModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Progressive fallback for browsers without native `closedby="any"` (Safari)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) return;

    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };

    let pressedOutside = false;
    const onDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        dialog.close();
      }
    };

    dialog.addEventListener('pointerdown', onDown);
    dialog.addEventListener('pointerup', onUp);
    return () => {
      dialog.removeEventListener('pointerdown', onDown);
      dialog.removeEventListener('pointerup', onUp);
    };
  }, []);

  if (!snapshot) return null;

  const round = snapshot.currentRound;
  const dealerId = round?.dealerId ?? snapshot.dealerId;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: 'any' } as Record<string, string>)}
      onClose={() => {
        if (dialogRef.current) {
          dialogRef.current.returnValue = '';
        }
        onClose();
      }}
    >
      <div className="dialog-header">
        <h2 id={titleId}>Ledger & Riwayat Ronde</h2>
        <form method="dialog">
          <button type="submit" value="close" autoFocus aria-label="Tutup ledger">
            Tutup
          </button>
        </form>
      </div>

      <div className="dialog-body">
        {round && (snapshot.phase === 'NEXT_ROUND' || snapshot.phase === 'FINISHED') && (
          <ResultSheet round={round} members={snapshot.members} />
        )}

        <section>
          <h3 style={{ margin: '0 0 8px', fontSize: '15px' }}>Saldo & Rotasi Bandar</h3>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: '12px' }}>
            Bandar berikutnya:{' '}
            <strong>{snapshot.members.find((m) => m.userId === snapshot.dealerId)?.displayName}</strong>{' '}
            ({snapshot.dealerRoundsCompleted}/{snapshot.rules.dealerRotationRounds} ronde selesai)
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Kursi</th>
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
        </section>

        <section>
          <h3 style={{ margin: '0 0 8px', fontSize: '15px' }}>
            Riwayat Ronde ({snapshot.roundHistory.length})
          </h3>
          {snapshot.roundHistory.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: '13px' }}>
              Belum ada ronde yang selesai.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: '8px' }}>
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
        </section>
      </div>
    </dialog>
  );
}
