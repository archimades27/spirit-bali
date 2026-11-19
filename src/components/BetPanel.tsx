import { useState } from 'react';
import { formatRupiah, formatShortK } from '../services/format';

interface BetPanelProps {
  readonly mode: 'BET' | 'UDEG';
  readonly maxAmount: number;
  readonly step?: number;
  readonly disabled?: boolean;
  readonly onSubmit: (amount: number) => string | null;
}

const PRESETS_BET = [10_000, 50_000, 100_000, 250_000] as const;
const PRESETS_UDEG = [100_000, 200_000, 300_000, 500_000] as const;

export type BetIntensityLevel = 'low' | 'warm' | 'hot' | 'allin';

export function getBetIntensity(
  amount: number,
  maxAmount: number
): { readonly level: BetIntensityLevel; readonly label: string; readonly pct: number } {
  if (maxAmount > 0 && amount >= maxAmount) {
    return { level: 'allin', label: '⚡ ALL-IN!', pct: 100 };
  }
  if (amount >= 200_000) {
    return { level: 'allin', label: '💥 TOH JUMBO!', pct: 95 };
  }
  if (amount >= 100_000) {
    return { level: 'hot', label: '🔥🔥 TOH GEDE', pct: 74 };
  }
  if (amount >= 50_000) {
    return { level: 'warm', label: '🔥 TOH PANAS', pct: 48 };
  }
  return { level: 'low', label: 'Toh Santai', pct: 22 };
}

export function BetPanel({
  mode,
  maxAmount,
  step = 10_000,
  disabled = false,
  onSubmit,
}: BetPanelProps) {
  const initial = mode === 'UDEG' ? Math.min(200_000, maxAmount) : Math.min(20_000, maxAmount);
  const [amount, setAmount] = useState(Math.max(step, Math.floor(initial / step) * step));
  const [pulseKey, setPulseKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const presets = mode === 'UDEG' ? PRESETS_UDEG : PRESETS_BET;
  const cta = mode === 'UDEG' ? 'Set Udeg' : 'Kunci Toh';
  const intensity = getBetIntensity(amount, maxAmount);

  function setNextAmount(nextVal: number) {
    setAmount(nextVal);
    setPulseKey((k) => k + 1);
    setError(null);
  }

  function adjust(delta: number) {
    const next = Math.max(step, Math.min(maxAmount, amount + delta));
    setNextAmount(next);
  }

  function handleConfirm() {
    if (!Number.isSafeInteger(amount) || amount < step || amount % step !== 0) {
      setError(`Kelipatan ${formatRupiah(step)} (min ${formatRupiah(step)}).`);
      return;
    }
    if (amount > maxAmount) {
      setError(`Maksimal ${formatRupiah(maxAmount)}.`);
      return;
    }
    setError(onSubmit(amount));
  }

  return (
    <div style={{ display: 'grid', gap: '7px' }}>
      {mode === 'BET' && (
        <div className="intensity-strip" aria-live="polite">
          <span className={`intensity-tag tier-${intensity.level}`}>
            {intensity.label}
          </span>
          <div className="intensity-bar-track" aria-hidden="true">
            <div
              className={`intensity-bar-fill tier-${intensity.level}`}
              style={{ width: `${intensity.pct}%` }}
            />
          </div>
          <span className="muted mono" style={{ fontSize: '10.5px' }}>
            Maks {formatShortK(maxAmount)}
          </span>
        </div>
      )}

      <div className="bet-presets-compact">
        {presets.map((amt) => (
          <button
            key={amt}
            type="button"
            className="bet-preset-chip"
            disabled={disabled || amt > maxAmount}
            aria-pressed={amount === amt}
            style={
              amount === amt
                ? { borderColor: mode === 'UDEG' ? 'var(--gold)' : 'var(--accent)' }
                : undefined
            }
            onClick={() => setNextAmount(amt)}
          >
            {formatShortK(amt)}
          </button>
        ))}
      </div>

      <div className="bet-stepper-row">
        <button
          type="button"
          className="step-btn"
          aria-label={`Kurangi ${formatShortK(step)}`}
          disabled={disabled || amount <= step}
          onClick={() => adjust(-step)}
        >
          −
        </button>

        <div
          key={pulseKey}
          className={`bet-display ${mode === 'BET' ? `tier-${intensity.level}` : ''}`}
          aria-live="polite"
        >
          {formatRupiah(amount)}
        </div>

        <button
          type="button"
          className="step-btn"
          aria-label={`Tambah ${formatShortK(step)}`}
          disabled={disabled || amount + step > maxAmount}
          onClick={() => adjust(step)}
        >
          +
        </button>

        <button
          type="button"
          className={
            mode === 'UDEG'
              ? 'btn-gold'
              : intensity.level === 'allin' || intensity.level === 'hot'
                ? 'btn-hot'
                : 'btn-primary'
          }
          disabled={disabled}
          onClick={handleConfirm}
          style={{ padding: '0 14px' }}
        >
          {cta}
        </button>
      </div>

      {error && (
        <div className="callout callout-red" role="alert" style={{ padding: '6px 10px' }}>
          {error}
        </div>
      )}
    </div>
  );
}
