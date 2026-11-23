/**
 * Lightweight sound + haptic feedback. Sounds are synthesized with the Web Audio API
 * (no asset files). Audio only starts after the first user gesture (browser autoplay policy).
 */

export type WinTier = 'normal' | 'nine' | 'besar' | 'triple' | 'six66' | 'dealer';

const STORAGE_KEY = 'spirit-bali:sound-muted';

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

let muted = typeof window !== 'undefined' ? readMuted() : false;
let ctx: AudioContext | null = null;
const listeners = new Set<(muted: boolean) => void>();

function audio(): AudioContext | null {
  if (muted || typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  freq: number,
  startOffset: number,
  duration: number,
  opts: { type?: OscillatorType; gain?: number; slideTo?: number } = {}
): void {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + startOffset;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slideTo) {
    osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + duration);
  }
  const peak = opts.gain ?? 0.12;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function noise(startOffset: number, duration: number, gainPeak = 0.08, highpass = 2400): void {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + startOffset;
  const length = Math.max(1, Math.floor(ac.sampleRate * duration));
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = highpass;
  const gain = ac.createGain();
  gain.gain.value = gainPeak;
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t0);
}

function vibrate(pattern: number | number[]): void {
  if (muted) return;
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // ignore
  }
}

export const feedback = {
  isMuted(): boolean {
    return muted;
  },
  setMuted(next: boolean): void {
    muted = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      // ignore
    }
    listeners.forEach((fn) => fn(next));
  },
  subscribe(fn: (muted: boolean) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  chip(): void {
    noise(0, 0.04, 0.09, 3200);
    tone(2600, 0, 0.05, { type: 'triangle', gain: 0.05 });
    vibrate(8);
  },
  lockBet(): void {
    noise(0, 0.05, 0.1, 2800);
    noise(0.07, 0.05, 0.08, 2800);
    tone(880, 0.06, 0.12, { type: 'triangle', gain: 0.07 });
    vibrate([12, 40, 18]);
  },
  flip(): void {
    noise(0, 0.07, 0.06, 1600);
  },
  dealerFlip(): void {
    noise(0, 0.09, 0.08, 1200);
    tone(196, 0, 0.35, { type: 'sine', gain: 0.1, slideTo: 392 });
    vibrate(25);
  },
  win(tier: WinTier): void {
    const big = tier === 'triple' || tier === 'six66';
    const notes = big
      ? [523, 659, 784, 1047, 1319, 1568]
      : tier === 'nine' || tier === 'besar'
        ? [523, 659, 784, 1047]
        : [587, 740, 880];
    notes.forEach((f, i) => tone(f, i * 0.085, 0.22, { type: 'triangle', gain: 0.09 }));
    if (big) {
      for (let i = 0; i < 8; i += 1) {
        noise(0.5 + i * 0.07, 0.04, 0.06, 4000);
      }
      vibrate(tier === 'six66' ? [40, 60, 40, 60, 140] : [40, 60, 90]);
    } else {
      vibrate([30, 50, 30]);
    }
  },
  lose(): void {
    tone(392, 0, 0.18, { type: 'sine', gain: 0.07 });
    tone(294, 0.16, 0.3, { type: 'sine', gain: 0.07 });
  },
  relief(): void {
    tone(440, 0, 0.12, { type: 'sine', gain: 0.07 });
    tone(554, 0.1, 0.18, { type: 'sine', gain: 0.07 });
  },
  tick(): void {
    tone(1200, 0, 0.04, { type: 'square', gain: 0.03 });
    vibrate(6);
  },
};
