import { useState } from 'react';
import { formatRupiah, formatShortK } from '../services/format';

interface BetPanelProps {
  readonly mode: 'BET' | 'UDEG';
  readonly maxAmount: number;
  readonly step?: number;
  readonly disabled?: boolean;
  readonly onSubmit: (amount: number) => string | null;
}

const PRESETS_BET = [10_000, 20_000, 50_000, 100_000] as const;
const PRESETS_UDEG = [100_000, 200_000, 300_000, 500_000] as const;

export function BetPanel({
  mode,
  maxAmount,
  step = 10_000,
  disabled = false,
  onSubmit,
}: BetPanelProps) {
  const defaultVal = mode === 'UDEG' ? Math.min(200_000, maxAmount) : Math.min(20_000, maxAmount);
  const [rawValue, setRawValue] = useState(String(Math.max(step, defaultVal)));
  const [error, setError] = useState<string | null>(null);

  const presets = mode === 'UDEG' ? PRESETS_UDEG : PRESETS_BET;
  const label = mode === 'UDEG' ? 'Nominal Udeg Ronde Ini' : 'Taruhan Anda';
  const cta = mode === 'UDEG' ? 'Kunci Udeg & Bagikan Kartu' : 'Kunci Taruhan';

  function handleConfirm() {
    const parsed = Number(rawValue);
    if (!Number.isSafeInteger(parsed) || parsed < step || parsed % step !== 0) {
      setError(`Masukkan kelipatan ${formatRupiah(step)} (minimal ${formatRupiah(step)}).`);
      return;
    }
    if (parsed > maxAmount) {
      setError(`Maksimal ${formatRupiah(maxAmount)} sesuai saldo tersedia.`);
      return;
    }
    const err = onSubmit(parsed);
    setError(err);
  }

  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <label htmlFor={`amount-${mode}`} style={{ fontWeight: 700, fontSize: '14px' }}>
          {label}
        </label>
        <span className="muted" style={{ fontSize: '13px' }}>
          Saldo tersedia: <strong>{formatRupiah(maxAmount)}</strong>
        </span>
      </div>

      <div className="preset-row">
        {presets.map((amt) => (
          <button
            key={amt}
            type="button"
            className="preset-btn"
            disabled={disabled || amt > maxAmount}
            onClick={() => {
              setRawValue(String(amt));
              setError(null);
            }}
          >
            {formatShortK(amt)}
          </button>
        ))}
      </div>

      <div className="action-row">
        <div style={{ flex: '1 1 160px' }}>
          <input
            id={`amount-${mode}`}
            type="number"
            inputMode="numeric"
            min={step}
            max={maxAmount}
            step={step}
            value={rawValue}
            disabled={disabled}
            onChange={(e) => {
              setRawValue(e.target.value);
              if (error) setError(null);
            }}
          />
        </div>
        <button
          type="button"
          className={mode === 'UDEG' ? 'btn-gold' : 'btn-primary'}
          disabled={disabled}
          onClick={handleConfirm}
        >
          {cta}
        </button>
      </div>

      {error && (
        <div className="callout callout-red" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
