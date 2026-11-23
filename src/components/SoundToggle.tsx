import { useEffect, useState } from 'react';
import { feedback } from '../services/feedback';

export function SoundToggle() {
  const [muted, setMuted] = useState(feedback.isMuted());

  useEffect(() => feedback.subscribe(setMuted), []);

  return (
    <button
      type="button"
      className="hud-btn"
      aria-pressed={!muted}
      aria-label={muted ? 'Nyalakan suara & getar' : 'Matikan suara & getar'}
      onClick={() => {
        feedback.setMuted(!muted);
        if (muted) feedback.chip();
      }}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9H4z" />
        {muted ? (
          <path d="M17 9l5 6M22 9l-5 6" />
        ) : (
          <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
        )}
      </svg>
    </button>
  );
}
