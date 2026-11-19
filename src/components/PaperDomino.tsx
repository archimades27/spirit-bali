import type { Tile } from '../domain';

const PIP_POSITIONS: Readonly<Record<number, readonly number[]>> = {
  0: [],
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

interface PaperDominoProps {
  readonly tile?: Tile;
  readonly faceDown?: boolean;
  readonly size?: 'md' | 'sm' | 'xs';
}

function DominoHalf({ value }: { readonly value: number }) {
  const positions = PIP_POSITIONS[value] ?? [];
  return (
    <span className={`domino-half pip-count-${value}`} aria-hidden="true">
      {positions.map((pos) => (
        <span
          key={pos}
          className={`domino-pip ${value === 1 ? 'is-one' : ''}`}
          style={{
            gridColumn: ((pos - 1) % 3) + 1,
            gridRow: Math.floor((pos - 1) / 3) + 1,
          }}
        />
      ))}
    </span>
  );
}

export function PaperDomino({ tile, faceDown = false, size = 'md' }: PaperDominoProps) {
  const sizeClass = size === 'sm' ? 'size-sm' : size === 'xs' ? 'size-xs' : '';

  if (faceDown || !tile) {
    return (
      <div
        className={`paper-domino is-back ${sizeClass}`}
        role="img"
        aria-label="Kartu domino tertutup"
      />
    );
  }

  return (
    <div
      className={`paper-domino ${sizeClass}`}
      role="img"
      aria-label={`Kartu domino ${tile[0]} | ${tile[1]}`}
    >
      <DominoHalf value={tile[0]} />
      <DominoHalf value={tile[1]} />
    </div>
  );
}
