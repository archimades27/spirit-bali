/**
 * Taunt emotes: a tiny pub/sub bus shared by the table UI, bots, and the online channel.
 */

export const EMOTES = [
  { id: 'laugh', glyph: '😂', label: 'Wkwkwk' },
  { id: 'cool', glyph: '😎', label: 'Santuy' },
  { id: 'fire', glyph: '🔥', label: 'Panas!' },
  { id: 'money', glyph: '🤑', label: 'Cuan!' },
  { id: 'clown', glyph: '🤡', label: 'Badut' },
  { id: 'point', glyph: '👉', label: 'Kamu!' },
  { id: 'cry', glyph: '😭', label: 'Ampun' },
  { id: 'angry', glyph: '😡', label: 'Gregetan' },
  { id: 'skull', glyph: '💀', label: 'RIP' },
  { id: 'pray', glyph: '🙏', label: 'Hoki dong' },
  { id: 'wave', glyph: '👋', label: 'Dadah' },
  { id: 'clap', glyph: '👏', label: 'GG' },
] as const;

export type EmoteId = (typeof EMOTES)[number]['id'];

export interface EmoteEvent {
  readonly fromId: string;
  readonly emoteId: EmoteId;
  readonly key: number;
}

const BY_ID: ReadonlyMap<string, (typeof EMOTES)[number]> = new Map(EMOTES.map((e) => [e.id, e]));

export function getEmote(id: string): (typeof EMOTES)[number] | undefined {
  return BY_ID.get(id);
}

export function isEmoteId(id: unknown): id is EmoteId {
  return typeof id === 'string' && BY_ID.has(id);
}

export const EMOTE_COOLDOWN_MS = 2500;

const listeners = new Set<(e: EmoteEvent) => void>();
let seq = 0;

export const emoteBus = {
  emit(fromId: string, emoteId: EmoteId): void {
    const evt: EmoteEvent = { fromId, emoteId, key: ++seq };
    listeners.forEach((fn) => fn(evt));
  },
  subscribe(fn: (e: EmoteEvent) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

const MUTE_KEY = 'spirit-bali:emotes-muted';

export function readEmotesMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeEmotesMuted(v: boolean): void {
  try {
    window.localStorage.setItem(MUTE_KEY, v ? '1' : '0');
  } catch {
    // ignore
  }
}

/** Bot reaction pools. */
export const BOT_REACTIONS = {
  win: ['laugh', 'cool', 'money', 'clown', 'point'] as const,
  lose: ['cry', 'angry', 'skull', 'pray'] as const,
  bigBet: ['fire', 'cool', 'point'] as const,
  reply: ['angry', 'laugh', 'clown', 'cool', 'point'] as const,
};

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
