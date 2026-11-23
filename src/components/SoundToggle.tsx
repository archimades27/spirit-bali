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
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
