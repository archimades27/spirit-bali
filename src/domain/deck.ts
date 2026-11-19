import type { Tile } from './types';

export function normalizeTile(tile: Tile): Tile {
  const [a, b] = tile;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || a > 6 || b < 0 || b > 6) {
    throw new Error('INVALID_TILE');
  }
  return a <= b ? ([a, b] as const) : ([b, a] as const);
}

export function tileKey(tile: Tile): string {
  const [a, b] = normalizeTile(tile);
  return `${a}:${b}`;
}

export function createDeck(): readonly Tile[] {
  const deck: Tile[] = [];
  for (let a = 0; a <= 6; a += 1) {
    for (let b = a; b <= 6; b += 1) {
      deck.push([a, b] as const);
    }
  }
  return Object.freeze(deck);
}

export function validateUniqueTiles(tiles: readonly Tile[]): void {
  const seen = new Set<string>();
  for (const tile of tiles) {
    const key = tileKey(tile);
    if (seen.has(key)) {
      throw new Error('DUPLICATE_TILE');
    }
    seen.add(key);
  }
}

/**
 * Unbiased integer in [0, maxExclusive) using rejection sampling over CSPRNG.
 */
function cryptoRandomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error('INVALID_BOUND');
  }
  if (maxExclusive === 1) return 0;

  const uint32Range = 0x100000000;
  const limit = uint32Range - (uint32Range % maxExclusive);
  const buf = new Uint32Array(1);

  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    const val = buf[0]!;
    if (val < limit) {
      return val % maxExclusive;
    }
  }
}

/**
 * Cryptographic Fisher-Yates shuffle without modulo bias.
 */
export function cryptoShuffle(
  deck: readonly Tile[],
  randomInt: (maxExclusive: number) => number = cryptoRandomInt
): readonly Tile[] {
  validateUniqueTiles(deck);
  const copy = deck.map(normalizeTile);
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return Object.freeze(copy);
}

export function dealFromDeck(
  deck: readonly Tile[],
  cursor: number,
  count: number
): { readonly dealt: readonly Tile[]; readonly nextCursor: number } {
  if (!Number.isInteger(cursor) || cursor < 0 || !Number.isInteger(count) || count < 0) {
    throw new Error('INVALID_DEAL_ARGS');
  }
  if (cursor + count > deck.length) {
    throw new Error('DECK_EXHAUSTED');
  }
  const dealt = deck.slice(cursor, cursor + count).map(normalizeTile);
  return {
    dealt: Object.freeze(dealt),
    nextCursor: cursor + count,
  };
}
