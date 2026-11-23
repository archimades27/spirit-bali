import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Tile } from '../domain';
import { feedback } from '../services/feedback';
import { PaperDomino } from './PaperDomino';

interface SqueezeTileProps {
  readonly tile: Tile;
  readonly onRevealed: () => void;
}

/**
 * The drawn 3rd card arrives face down. Drag it upward to "squeeze" (peek) it open
 * slowly, or tap to flip it at once.
 */
export function SqueezeTile({ tile, onRevealed }: SqueezeTileProps) {
  const [progress, setProgress] = useState(0);
  const startY = useRef<number | null>(null);
  const moved = useRef(false);

  function finish() {
    setProgress(1);
    feedback.flip();
    onRevealed();
  }

  function onDown(e: ReactPointerEvent<HTMLButtonElement>) {
    startY.current = e.clientY;
    moved.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onMove(e: ReactPointerEvent<HTMLButtonElement>) {
    if (startY.current === null) return;
    const dy = startY.current - e.clientY;
    if (Math.abs(dy) > 4) moved.current = true;
    setProgress(Math.max(0, Math.min(1, dy / 90)));
  }

  function onUp() {
    if (startY.current === null) return;
    startY.current = null;
    if (!moved.current || progress >= 0.55) {
      finish();
    } else {
      setProgress(0);
    }
  }

  const coverPct = Math.round((1 - progress) * 100);

  return (
    <button
      type="button"
      className="squeeze-tile"
      aria-label="Buka kartu ke-3: geser ke atas atau ketuk"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => {
        startY.current = null;
        setProgress(0);
      }}
    >
      <PaperDomino tile={tile} size="md" />
      <span
        className="squeeze-cover"
        aria-hidden="true"
        style={{ clipPath: `inset(0 0 ${100 - coverPct}% 0)` }}
      >
        <PaperDomino faceDown size="md" />
      </span>
      <span className="squeeze-hint" aria-hidden="true">
        ⇡ Geser
      </span>
    </button>
  );
}
