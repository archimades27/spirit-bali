import { useEffect, useRef, useState } from 'react';
import { EMOTE_COOLDOWN_MS, EMOTES, getEmote, type EmoteEvent, type EmoteId } from '../services/emotes';

interface EmotePickerProps {
  readonly muted: boolean;
  readonly onToggleMute: () => void;
  readonly onSend: (emoteId: EmoteId) => void;
}

/** Round button that opens a grid of taunt emotes. Enforces a short cooldown. */
export function EmotePicker({ muted, onToggleMute, onSend }: EmotePickerProps) {
  const [open, setOpen] = useState(false);
  const [coolUntil, setCoolUntil] = useState(0);
  const [, force] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const cooling = coolUntil > Date.now();

  useEffect(() => {
    if (!cooling) return;
    const t = window.setTimeout(() => force((n) => n + 1), coolUntil - Date.now() + 20);
    return () => window.clearTimeout(t);
  }, [cooling, coolUntil]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="emote-picker" ref={rootRef}>
      <button
        type="button"
        className={`emote-trigger ${cooling ? 'is-cooling' : ''}`}
        aria-label="Kirim emote"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">😜</span>
        {cooling && (
          <span
            className="emote-cool"
            key={coolUntil}
            style={{ animationDuration: `${EMOTE_COOLDOWN_MS}ms` }}
            aria-hidden="true"
          />
        )}
      </button>

      {open && (
        <div className="emote-pop" role="menu" aria-label="Pilih emote">
          <div className="emote-grid">
            {EMOTES.map((e) => (
              <button
                key={e.id}
                type="button"
                role="menuitem"
                className="emote-cell"
                disabled={cooling}
                aria-label={e.label}
                onClick={() => {
                  onSend(e.id);
                  setCoolUntil(Date.now() + EMOTE_COOLDOWN_MS);
                  setOpen(false);
                }}
              >
                <span className="emote-glyph" aria-hidden="true">
                  {e.glyph}
                </span>
                <span className="emote-label">{e.label}</span>
              </button>
            ))}
          </div>
          <button type="button" className="emote-mute" aria-pressed={muted} onClick={onToggleMute}>
            {muted ? '🔕 Emote lawan disenyapkan' : '🔔 Tampilkan emote lawan'}
          </button>
        </div>
      )}
    </div>
  );
}

/** Speech bubble that pops above a player's avatar. */
export function EmoteBubble({
  event,
  placement = 'up',
}: {
  readonly event: EmoteEvent | undefined;
  readonly placement?: 'up' | 'down';
}) {
  if (!event) return null;
  const e = getEmote(event.emoteId);
  if (!e) return null;
  return (
    <span key={event.key} className={`emote-bubble is-${placement}`} role="status" aria-label={`Emote: ${e.label}`}>
      <span className="emote-bubble-glyph" aria-hidden="true">
        {e.glyph}
      </span>
      <span className="emote-bubble-label">{e.label}</span>
    </span>
  );
}
