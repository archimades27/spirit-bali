import { useState } from 'react';
import { PaperDomino } from '../../components/PaperDomino';
import { isSupabaseConfigured } from '../../services/supabaseClient';
import type { LocalGameConfig } from '../../services/localGameEngine';

interface HomeLobbyProps {
  readonly onStartLocal: (config: LocalGameConfig) => void;
  readonly onOpenRules: () => void;
}

export function HomeLobby({ onStartLocal, onOpenRules }: HomeLobbyProps) {
  const [tab, setTab] = useState<'local' | 'online'>('local');
  const [playerName, setPlayerName] = useState('Anda');
  const [botCount, setBotCount] = useState(4);
  const [role, setRole] = useState<'player' | 'dealer'>('player');

  return (
    <main className="lobby-portrait">
      <section className="portrait-hero">
        <span className="badge badge-gold">MOBILE PORTRAIT · RULESET v1.0</span>
        <h1>
          Spirit <span>Bali</span>
        </h1>
        <div className="hand-row" aria-label="Ilustrasi kartu domino kertas">
          <div style={{ transform: 'rotate(-7deg)' }}>
            <PaperDomino tile={[1, 3]} size="sm" />
          </div>
          <div style={{ transform: 'rotate(2deg)' }}>
            <PaperDomino tile={[6, 6]} size="sm" />
          </div>
          <div style={{ transform: 'rotate(8deg)' }}>
            <PaperDomino faceDown size="sm" />
          </div>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: '12.5px', maxWidth: '320px' }}>
          1 Bandar / Cong vs 1–5 Pemain · Modal simulasi Rp1.000.000 · Udeg Fixed/Skip · Rotasi 3 Ronde.
        </p>
      </section>

      <div className="mode-tabs" role="tablist" aria-label="Mode permainan">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'local'}
          className="mode-tab"
          onClick={() => setTab('local')}
        >
          Main Offline (Bot)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'online'}
          className="mode-tab"
          onClick={() => setTab('online')}
        >
          Online (Supabase)
        </button>
      </div>

      {tab === 'local' ? (
        <section className="panel-card" aria-label="Pengaturan meja">
          <div className="field">
            <label htmlFor="player-name">Nama Tampilan</label>
            <input
              id="player-name"
              type="text"
              maxLength={24}
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Nama Anda"
            />
          </div>

          <div className="field">
            <label>Jumlah Lawan (Bot)</label>
            <div className="pill-row" role="group" aria-label="Pilih jumlah lawan">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="pill-btn"
                  aria-pressed={botCount === n}
                  onClick={() => setBotCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Peran Awal</label>
            <div className="pill-row-2" role="group" aria-label="Pilih peran awal">
              <button
                type="button"
                className="pill-btn"
                aria-pressed={role === 'player'}
                onClick={() => setRole('player')}
              >
                Pemain (#1)
              </button>
              <button
                type="button"
                className="pill-btn"
                aria-pressed={role === 'dealer'}
                onClick={() => setRole('dealer')}
              >
                Bandar / Cong
              </button>
            </div>
          </div>

          <button
            type="button"
            className="btn-primary thumb-cta"
            onClick={() =>
              onStartLocal({
                playerName: playerName.trim() || 'Anda',
                botCount,
                humanStartsAsDealer: role === 'dealer',
              })
            }
          >
            Mulai Meja Spirit Bali
          </button>

          <button type="button" className="btn-ghost" onClick={onOpenRules}>
            Panduan Aturan v1.0 & Asumsi (A01–A09)
          </button>
        </section>
      ) : (
        <section className="panel-card" aria-label="Mode Online Supabase">
          {isSupabaseConfigured ? (
            <div className="callout">
              <strong>Supabase terhubung.</strong> Siap untuk sesi multiplayer online.
            </div>
          ) : (
            <div className="callout callout-gold">
              <strong>Backend Supabase belum dihubungkan pada build statis ini.</strong>
              <p style={{ margin: '6px 0 0', fontSize: '12px' }}>
                Jalankan migrasi <code>supabase/migrations/0001_spirit_bali_v1.sql</code> dan Edge Function{' '}
                <code>submit-game-action</code>, lalu set <code>VITE_SUPABASE_URL</code> dan{' '}
                <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>. Gunakan tab <strong>Main Offline (Bot)</strong> untuk langsung bermain.
              </p>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
