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
    <main className="lobby-wrap">
      <section className="hero-card">
        <div className="hero-copy" style={{ maxWidth: '540px' }}>
          <span className="badge badge-mint">RULESET v1.0 · SALDO SIMULASI</span>
          <h1>
            Spirit <span>Bali</span>
          </h1>
          <p className="muted" style={{ margin: '0 0 12px' }}>
            Permainan domino kertas tradisional Bali: 1 Bandar / Cong melawan 1–5 pemain.
            Modal awal Rp1.000.000, sistem Udeg fixed/skip, Triple balak rank tertinggi,
            dan rotasi bandar setiap 3 ronde.
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" className="btn-ghost" onClick={onOpenRules}>
              Baca Aturan v1.0 & Asumsi (A01–A09)
            </button>
          </div>
        </div>

        <div className="hand-row" aria-label="Ilustrasi kartu domino kertas Spirit Bali">
          <div style={{ transform: 'rotate(-6deg)' }}>
            <PaperDomino tile={[1, 3]} />
          </div>
          <div style={{ transform: 'rotate(2deg)' }}>
            <PaperDomino tile={[6, 6]} />
          </div>
          <div style={{ transform: 'rotate(8deg)' }}>
            <PaperDomino faceDown />
          </div>
        </div>
      </section>

      <div className="mode-tabs" role="tablist" aria-label="Mode permainan">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'local'}
          className="mode-tab"
          onClick={() => setTab('local')}
        >
          Main Langsung (vs Bot AI)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'online'}
          className="mode-tab"
          onClick={() => setTab('online')}
        >
          Multiplayer Online (Supabase)
        </button>
      </div>

      {tab === 'local' ? (
        <section className="panel-card" aria-label="Pengaturan meja lokal">
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: '20px' }}>Buat Meja Simulasi</h2>
            <p className="muted" style={{ margin: 0, fontSize: '14px' }}>
              Menggunakan engine domain v1.0 yang sama (CSPRNG Fisher–Yates, settlement atomik, rotasi 3 ronde).
            </p>
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="player-name">Nama Anda</label>
              <input
                id="player-name"
                type="text"
                maxLength={24}
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Nama tampilan"
              />
            </div>

            <div className="field">
              <label htmlFor="bot-count">Jumlah Lawan (1–5)</label>
              <select
                id="bot-count"
                value={botCount}
                onChange={(e) => setBotCount(Number(e.target.value))}
              >
                <option value={1}>1 Lawan (Meja 2 orang)</option>
                <option value={2}>2 Lawan (Meja 3 orang)</option>
                <option value={3}>3 Lawan (Meja 4 orang)</option>
                <option value={4}>4 Lawan (Meja 5 orang)</option>
                <option value={5}>5 Lawan (Meja 6 orang penuh)</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="start-role">Peran Awal</label>
              <select
                id="start-role"
                value={role}
                onChange={(e) => setRole(e.target.value as 'player' | 'dealer')}
              >
                <option value="player">Pemain #1 (Pasang Bet)</option>
                <option value="dealer">Bandar / Cong (Tentukan Udeg)</option>
              </select>
            </div>
          </div>

          <div className="action-row">
            <button
              type="button"
              className="btn-primary"
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
          </div>
        </section>
      ) : (
        <section className="panel-card" aria-label="Multiplayer Online Supabase">
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: '20px' }}>Multiplayer Online (Supabase)</h2>
            <p className="muted" style={{ margin: 0, fontSize: '14px' }}>
              Arsitektur otoritatif: Edge Function <code>submit-game-action</code> + Postgres transactional RPC + RLS + private schema.
            </p>
          </div>

          {isSupabaseConfigured ? (
            <div className="callout">
              <strong>Supabase terhubung.</strong> Siap menjalankan sesi multiplayer online melalui Edge Function gateway.
            </div>
          ) : (
            <div className="callout callout-gold">
              <strong>Backend Supabase belum dikonfigurasi pada build GitHub Pages ini.</strong>
              <p style={{ margin: '8px 0 0', fontSize: '13px' }}>
                Untuk mengaktifkan multiplayer online, jalankan migrasi{' '}
                <code>supabase/migrations/0001_spirit_bali_v1.sql</code>, deploy Edge Function{' '}
                <code>supabase/functions/submit-game-action</code>, lalu set repository secrets/vars{' '}
                <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> pada GitHub Actions.
                Sementara itu, Anda dapat langsung bermain di tab <strong>Main Langsung (vs Bot AI)</strong>.
              </p>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
