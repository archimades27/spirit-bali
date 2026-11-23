import { useMemo } from 'react';
import { prefersReducedMotion } from '../../services/motion';

interface LightningProps {
  /** Stable seed so the bolt shape doesn't change on re-render. */
  readonly seed: string;
  /** 'local' strikes the parent element; 'screen' flashes the whole table. */
  readonly scope?: 'local' | 'screen';
  readonly color?: string;
}

function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function boltPath(rand: () => number, x0: number, x1: number, segments: number): string {
  let d = `M ${x0} 0`;
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const x = x0 + (x1 - x0) * t + (i === segments ? 0 : (rand() - 0.5) * 28);
    d += ` L ${x.toFixed(1)} ${(t * 100).toFixed(1)}`;
  }
  return d;
}

/** One-shot lightning strike: jagged bolt + flash. Plays once on mount. */
export function Lightning({ seed, scope = 'local', color = '#bfe9ff' }: LightningProps) {
  const paths = useMemo(() => {
    const rand = rng(seed);
    const x0 = 30 + rand() * 40;
    const x1 = 35 + rand() * 30;
    const main = boltPath(rand, x0, x1, 7);
    const branchFrom = 0.3 + rand() * 0.3;
    const bx = x0 + (x1 - x0) * branchFrom;
    const branch = `M ${bx.toFixed(1)} ${(branchFrom * 100).toFixed(1)} L ${(bx + 14 + rand() * 10).toFixed(1)} ${(branchFrom * 100 + 18).toFixed(1)} L ${(bx + 8 + rand() * 18).toFixed(1)} ${(branchFrom * 100 + 34).toFixed(1)}`;
    return { main, branch };
  }, [seed]);

  if (prefersReducedMotion()) return null;

  return (
    <span className={`fx-lightning fx-lightning-${scope}`} aria-hidden="true" style={{ ['--bolt' as string]: color }}>
      <span className="fx-lightning-flash" />
      <svg className="fx-bolt" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d={paths.main} className="fx-bolt-glow" />
        <path d={paths.branch} className="fx-bolt-glow" />
        <path d={paths.main} className="fx-bolt-core" />
        <path d={paths.branch} className="fx-bolt-core" />
      </svg>
    </span>
  );
}
