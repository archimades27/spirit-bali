import { formatRupiah } from '../services/format';

interface UdegMeterProps {
  readonly limit: number;
  readonly remaining: number;
}

export function UdegMeter({ limit, remaining }: UdegMeterProps) {
  const pct = limit > 0 ? Math.max(0, Math.min(100, Math.round((remaining / limit) * 100))) : 0;

  return (
    <div className="udeg-meter" aria-label={`Udeg tersisa ${formatRupiah(remaining)} dari ${formatRupiah(limit)}`}>
      <div className="udeg-meter-row">
        <span className="muted">Udeg Ronde (Fixed)</span>
        <strong style={{ color: 'var(--gold)' }}>
          {limit > 0 ? `${formatRupiah(remaining)} / ${formatRupiah(limit)}` : 'Belum ditetapkan'}
        </strong>
      </div>
      <div className="udeg-bar-track" aria-hidden="true">
        <div className="udeg-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
