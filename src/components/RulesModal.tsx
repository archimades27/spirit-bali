import { useEffect, useId, useRef } from 'react';
import { OPEN_ASSUMPTIONS } from '../domain';

interface RulesModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function RulesModal({ open, onClose }: RulesModalProps) {
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
        <h2 id={titleId}>Aturan Spirit Bali v1.0 & Asumsi Terbuka</h2>
        <form method="dialog">
          <button type="submit" value="close" autoFocus aria-label="Tutup jendela aturan">
            Tutup
          </button>
        </form>
      </div>

      <div className="dialog-body">
        <div className="callout">
          <strong>Simulasi saldo virtual.</strong> Modal awal Rp1.000.000 per peserta; tidak ada pembelian saldo, pencairan, atau transfer uang asli.
        </div>

        <section>
          <h3 style={{ margin: '0 0 8px' }}>Aturan Inti (Dikonfirmasi)</h3>
          <ul style={{ margin: 0, paddingLeft: '20px', display: 'grid', gap: '6px' }}>
            <li><strong>1 Bandar / Cong vs 1–5 Pemain</strong> memakai 28 kartu domino kertas double-six unik.</li>
            <li><strong>Alur ronde:</strong> Bandar set Udeg → Kartu 1 ke semua → Bet kelipatan Rp10.000 → Kartu 2 ke semua → Stop atau Draw tepat 1 kartu ke-3 (termasuk bandar) → Buka & Settlement.</li>
            <li><strong>Skor:</strong> Total titik modulo 10. <strong>Triple</strong> = 3 kartu balak berbeda (peringkat tertinggi, rank 10).</li>
            <li><strong>Seri:</strong> Nilai normal sama maupun Triple vs Triple selalu dimenangkan bandar.</li>
            <li><strong>Bandar menang:</strong> Meski dengan 9 atau Triple, bandar tetap menerima hanya 1× bet.</li>
            <li><strong>Udeg (Fixed / Skip):</strong> Nominal batas bayar bandar per ronde. Jika klaim melebihi sisa Udeg, status dicatat <em>Menang · dilewati</em> (Rp0) dan pembayaran lanjut ke kursi berikutnya.</li>
            <li><strong>Rotasi bandar:</strong> Berpindah searah jarum jam tepat setelah 3 ronde selesai (tidak dipicu oleh 9 murni).</li>
          </ul>
        </section>

        <section>
          <h3 style={{ margin: '0 0 8px' }}>Asumsi Terbuka (A01–A09)</h3>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: '13px' }}>
            Default prototipe berikut bukan konfirmasi aturan lokal dan tercatat eksplisit dalam konfigurasi ruleset v1.0:
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Topik</th>
                  <th>Default Implementasi</th>
                </tr>
              </thead>
              <tbody>
                {OPEN_ASSUMPTIONS.map((item) => (
                  <tr key={item.id}>
                    <td className="mono">{item.id}</td>
                    <td><strong>{item.title}</strong></td>
                    <td>{item.defaultBehavior}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </dialog>
  );
}
