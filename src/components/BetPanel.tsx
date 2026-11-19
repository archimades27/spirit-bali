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
  const initial = mode === 'UDEG' ? Math.min(200_000, maxAmount) : Math.min(20_000, maxAmount);
  const [amount, setAmount] = useState(Math.max(step, Math.floor(initial / step) * step));
  const [error, setError] = useState<string | null>(null);

  const presets = mode === 'UDEG' ? PRESETS_UDEG : PRESETS_BET;
  const cta = mode === 'UDEG' ? 'Set Udeg' : 'Kunci Bet';

  function adjust(delta: number) {
    const next = Math.max(step, Math.min(maxAmount, amount + delta));
    setAmount(next);
    setError(null);
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
            onClick={() => {
              setAmount(amt);
              setError(null);
            }}
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

        <div className="bet-display" aria-live="polite">
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
          className={mode === 'UDEG' ? 'btn-gold' : 'btn-primary'}
          disabled={disabled}
          onClick={handleConfirm}
          style={{ padding: '0 16px' }}
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
