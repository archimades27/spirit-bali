import { useMemo } from 'react';
import type { WinTier } from '../services/feedback';
import { formatSignedRupiah } from '../services/format';

export type OutcomeKind = 'win' | 'lose' | 'skip' | 'capped';

interface WinCelebrationProps {
  readonly roundKey: string;
  readonly kind: OutcomeKind;
  readonly title: string;
  readonly subtitle?: string;
  readonly delta: number;
  readonly tier?: WinTier;
  readonly onDismiss?: () => void;
}

const TIER_CONFIG: Readonly<
  Record<WinTier, { pieces: number; coins: number; colors: readonly string[]; className: string }>
> = {
  normal: { pieces: 16, coins: 0, colors: ['#65e0c2', '#9af0dc', '#f7da47'], className: 'tier-normal' },
  dealer: { pieces: 18, coins: 6, colors: ['#f3c76c', '#65e0c2', '#fff1c4'], className: 'tier-dealer' },
  nine: { pieces: 28, coins: 6, colors: ['#f7da47', '#65e0c2', '#ff6b7a'], className: 'tier-nine' },
  besar: { pieces: 28, coins: 8, colors: ['#f7da47', '#ff9843', '#65e0c2'], className: 'tier-nine' },
  triple: { pieces: 44, coins: 16, colors: ['#f7da47', '#ffd36b', '#ff6b7a', '#65e0c2'], className: 'tier-triple' },
  six66: { pieces: 60, coins: 26, colors: ['#ff3b4f', '#f7da47', '#ffe9a3', '#ff9843'], className: 'tier-six66' },
};

function buildPieces(tier: WinTier) {
  const cfg = TIER_CONFIG[tier];
  const total = cfg.pieces + cfg.coins;
  return Array.from({ length: total }, (_, i) => {
    const isCoin = i >= cfg.pieces;
    return {
      id: i,
      isCoin,
      left: `${3 + ((i * 37) % 94)}%`,
      delay: `${(i % 9) * 70 + (isCoin ? 220 : 0)}ms`,
      duration: `${1400 + (i % 6) * 190}ms`,
      drift: `${(i % 2 === 0 ? 1 : -1) * (10 + (i % 5) * 9)}px`,
      color: cfg.colors[i % cfg.colors.length]!,
      size: isCoin ? 13 : i % 4 === 0 ? 9 : 7,
    };
  });
}

export function WinCelebration({
  roundKey,
  kind,
  title,
  subtitle,
  delta,
  tier = 'normal',
  onDismiss,
}: WinCelebrationProps) {
  const pieces = useMemo(() => (kind === 'win' ? buildPieces(tier) : []), [kind, tier]);
  const tierClass = kind === 'win' ? TIER_CONFIG[tier].className : `outcome-${kind}`;
  const big = kind === 'win' && (tier === 'triple' || tier === 'six66');

  return (
    <div
      key={roundKey}
      className={`win-celebration-overlay ${tierClass}`}
      onClick={onDismiss}
      role="presentation"
    >
      {tier === 'six66' && kind === 'win' && <div className="jackpot-flash" aria-hidden="true" />}
      {big && <div className="win-rays" aria-hidden="true" />}

      {pieces.length > 0 && (
        <div className="confetti-layer" aria-hidden="true">
          {pieces.map((p) => (
            <span
              key={p.id}
              className={`confetti-piece ${p.isCoin ? 'is-coin' : ''}`}
              style={{
                left: p.left,
                width: `${p.size}px`,
                height: p.isCoin ? `${p.size}px` : `${Math.round(p.size * 1.4)}px`,
                backgroundColor: p.isCoin ? undefined : p.color,
                animationDelay: p.delay,
                animationDuration: p.duration,
                ['--drift' as string]: p.drift,
              }}
            />
          ))}
        </div>
      )}

      <div className={`win-toast ${tierClass}`} aria-hidden="true">
        <span className="win-toast-kicker">
          {big
            ? title.split('').map((ch, i) => (
                <span key={i} className="kicker-letter" style={{ animationDelay: `${i * 45}ms` }}>
                  {ch === ' ' ? ' ' : ch}
                </span>
              ))
            : title}
        </span>
        <strong className="win-toast-amount">
          {kind === 'skip' || kind === 'capped' ? 'Rp0' : formatSignedRupiah(delta)}
        </strong>
        {subtitle && <span className="win-toast-sub">{subtitle}</span>}
      </div>
    </div>
  );
}
