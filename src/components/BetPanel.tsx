import { useEffect, useState } from 'react';
import { feedback } from '../services/feedback';
import { formatRupiah, formatShortK } from '../services/format';
import { TimerRing } from './TimerRing';

interface BetPanelProps {
  readonly mode: 'BET' | 'UDEG';
  readonly maxAmount: number;
  readonly step?: number;
  readonly disabled?: boolean;
  readonly secondsLeft?: number | null;
  readonly totalSeconds?: number;
  readonly onSubmit: (amount: number) => string | null;
}

interface ChipDef {
  readonly value: number;
  readonly className: string;
}

const CHIPS_BET: readonly ChipDef[] = [
  { value: 10_000, className: 'chip-10' },
  { value: 50_000, className: 'chip-50' },
  { value: 100_000, className: 'chip-100' },
  { value: 250_000, className: 'chip-250' },
];

const PRESETS_UDEG = [100_000, 200_000, 300_000, 500_000] as const;

// Remembered across rounds within this browser tab session (in-memory only).
let lastBetMemory: number | null = null;

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
  if (amount <= 0) {
    return { level: 'low', label: 'Tap chip untuk pasang toh', pct: 0 };
  }
  return { level: 'low', label: 'Toh Santai', pct: 22 };
}

/** Breaks an amount into chip denominations for the visual stack (max 8 discs). */
function chipStack(amount: number): string[] {
  const out: string[] = [];
  let rest = amount;
  for (const chip of [...CHIPS_BET].reverse()) {
    while (rest >= chip.value && out.length < 8) {
      out.push(chip.className);
      rest -= chip.value;
    }
  }
  return out;
}

export function BetPanel({
  mode,
  maxAmount,
  step = 10_000,
  disabled = false,
  secondsLeft = null,
  totalSeconds = 45,
  onSubmit,
}: BetPanelProps) {
  const initial =
    mode === 'UDEG'
      ? Math.max(step, Math.floor(Math.min(200_000, maxAmount) / step) * step)
      : 0;
  const [amount, setAmount] = useState(initial);
  const [pulseKey, setPulseKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [confirmAllIn, setConfirmAllIn] = useState(false);

  const intensity = getBetIntensity(amount, maxAmount);
  const isAllIn = mode === 'BET' && maxAmount > 0 && amount >= maxAmount;
  const lastBet = lastBetMemory !== null && lastBetMemory <= maxAmount ? lastBetMemory : null;

  useEffect(() => {
    if (!confirmAllIn) return;
    const t = window.setTimeout(() => setConfirmAllIn(false), 2600);
    return () => window.clearTimeout(t);
  }, [confirmAllIn]);

  function setNextAmount(nextVal: number) {
    const clamped = Math.max(0, Math.min(maxAmount, nextVal));
    setAmount(clamped);
    setPulseKey((k) => k + 1);
    setError(null);
    setConfirmAllIn(false);
    feedback.chip();
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
    if (isAllIn && !confirmAllIn) {
      setConfirmAllIn(true);
      return;
    }
    const err = onSubmit(amount);
    setError(err);
    if (!err) {
      if (mode === 'BET') lastBetMemory = amount;
      feedback.lockBet();
    }
  }

  const ctaLabel =
    mode === 'UDEG' ? 'Set Udeg' : confirmAllIn ? 'Yakin All-in? Tap lagi' : 'Kunci Toh';
  const ctaClass =
    mode === 'UDEG'
      ? 'btn-gold'
      : intensity.level === 'allin' || intensity.level === 'hot'
        ? 'btn-hot'
        : 'btn-primary';

  return (
    <div className="bet-panel">
      {mode === 'BET' && (
        <div className="intensity-strip" aria-live="polite">
          <span className={`intensity-tag tier-${intensity.level}`}>{intensity.label}</span>
          <div className="intensity-bar-track" aria-hidden="true">
            <div
              className="intensity-bar-fill"
              style={{ clipPath: `inset(0 ${100 - intensity.pct}% 0 0 round 99px)` }}
            />
          </div>
          <span className="muted mono" style={{ fontSize: '10.5px' }}>
            Maks {formatShortK(maxAmount)}
          </span>
        </div>
      )}

      {mode === 'BET' ? (
        <div className="chip-rack" role="group" aria-label="Tambah chip toh">
          {CHIPS_BET.map((chip) => (
            <button
              key={chip.value}
              type="button"
              className={`casino-chip ${chip.className}`}
              disabled={disabled || amount + chip.value > maxAmount}
              aria-label={`Tambah ${formatShortK(chip.value)}`}
              onClick={() => setNextAmount(amount + chip.value)}
            >
              <span>{formatShortK(chip.value)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="bet-presets-compact">
          {PRESETS_UDEG.map((amt) => (
            <button
              key={amt}
              type="button"
              className="bet-preset-chip"
              disabled={disabled || amt > maxAmount}
              aria-pressed={amount === amt}
              style={amount === amt ? { borderColor: 'var(--gold)' } : undefined}
              onClick={() => setNextAmount(amt)}
            >
              {formatShortK(amt)}
            </button>
          ))}
        </div>
      )}

      {mode === 'BET' && (
        <div className="bet-quick-row">
          <button
            type="button"
            className="quick-btn"
            disabled={disabled || amount === 0}
            onClick={() => setNextAmount(0)}
          >
            Reset
          </button>
          <button
            type="button"
            className="quick-btn"
            disabled={disabled || lastBet === null}
            onClick={() => lastBet !== null && setNextAmount(lastBet)}
          >
            Ulangi{lastBet !== null ? ` ${formatShortK(lastBet)}` : ''}
          </button>
          <button
            type="button"
            className="quick-btn quick-max"
            disabled={disabled || maxAmount < step}
            onClick={() => setNextAmount(Math.floor(maxAmount / step) * step)}
          >
            Max
          </button>
        </div>
      )}

      <div className="bet-stepper-row">
        <button
          type="button"
          className="step-btn"
          aria-label={`Kurangi ${formatShortK(step)}`}
          disabled={disabled || amount <= step}
          onClick={() => setNextAmount(amount - step)}
        >
          −
        </button>

        <div
          key={pulseKey}
          className={`bet-display ${mode === 'BET' ? `tier-${intensity.level}` : ''} ${isAllIn ? 'is-allin' : ''}`}
          aria-live="polite"
        >
          {mode === 'BET' && amount > 0 && (
            <span className="chip-stack" aria-hidden="true">
              {chipStack(amount).map((cls, i) => (
                <span key={i} className={`stack-disc ${cls}`} style={{ bottom: `${i * 3}px` }} />
              ))}
            </span>
          )}
          {formatRupiah(amount)}
        </div>

        <button
          type="button"
          className="step-btn"
          aria-label={`Tambah ${formatShortK(step)}`}
          disabled={disabled || amount + step > maxAmount}
          onClick={() => setNextAmount(amount + step)}
        >
          +
        </button>
      </div>

      <TimerRing secondsLeft={secondsLeft} totalSeconds={totalSeconds}>
        <button
          type="button"
          className={`${ctaClass} thumb-cta ${confirmAllIn ? 'is-confirming' : ''}`}
          disabled={disabled || amount < step}
          onClick={handleConfirm}
        >
          {ctaLabel}
          {mode === 'BET' && amount >= step && !confirmAllIn && (
            <span className="cta-sub mono"> · {formatShortK(amount)}</span>
          )}
        </button>
      </TimerRing>

      {error && (
        <div className="callout callout-red" role="alert" style={{ padding: '6px 10px' }}>
          {error}
        </div>
      )}
    </div>
  );
}
