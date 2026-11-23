import { useState } from 'react';
import { PaperDomino } from '../../components/PaperDomino';
import type { SafeRoomSnapshot } from '../../domain';
import type { LocalGameConfig } from '../../services/localGameEngine';
import type { ConnectionState } from '../../services/onlineGameService';
import { isSupabaseConfigured } from '../../services/supabaseClient';

interface HomeLobbyProps {
  readonly initialJoinCode?: string;
  readonly onlineSnapshot: SafeRoomSnapshot | null;
  readonly onlineUserId: string | null;
  readonly onlineIsHost: boolean;
  readonly connectionState: ConnectionState | null;
  readonly onlineError: string | null;
  readonly onStartLocal: (config: LocalGameConfig) => void;
  readonly onCreateOnline: (params: { playerName: string; maxPlayers: number }) => void;
  readonly onJoinOnline: (params: { playerName: string; roomCode: string }) => void;
  readonly onOnlineAddBot: () => void;
  readonly onOnlineToggleReady: () => void;
  readonly onOnlineStart: () => void;
  readonly onOnlineLeave: () => void;
  readonly onOpenRules: () => void;
}

export function HomeLobby({
  initialJoinCode = '',
  onlineSnapshot,
  onlineUserId,
  onlineIsHost,
  connectionState,
  onlineError,
  onStartLocal,
  onCreateOnline,
  onJoinOnline,
  onOnlineAddBot,
  onOnlineToggleReady,
  onOnlineStart,
  onOnlineLeave,
  onOpenRules,
}: HomeLobbyProps) {
  const [tab, setTab] = useState<'local' | 'online'>(
    initialJoinCode || onlineSnapshot ? 'online' : 'local'
  );
  const [playerName, setPlayerName] = useState('Anda');
  const [botCount, setBotCount] = useState(4);
  const [role, setRole] = useState<'player' | 'dealer'>('player');
  const [maxOnlinePlayers, setMaxOnlinePlayers] = useState(5);
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null);

  async function copyRoomLink(code: string) {
    const shareUrl = `${window.location.origin}${window.location.pathname}#/join/${code}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedMsg('Link room disalin!');
      window.setTimeout(() => setCopiedMsg(null), 2000);
    } catch {
      setCopiedMsg(`Kode: ${code}`);
    }
  }

  // Online Waiting Lobby view (when connected in LOBBY phase)
  if (onlineSnapshot && onlineSnapshot.phase === 'LOBBY') {
    const activeMembers = onlineSnapshot.members.filter((m) => m.status !== 'LEFT');
    const me = activeMembers.find((m) => m.userId === onlineUserId);
    const allReady = activeMembers.length >= 2 && activeMembers.every((m) => m.ready);
    const maxSeats = onlineSnapshot.rules.maxPlayers + 1;

    return (
      <main className="lobby-portrait">
        <section className="panel-card" aria-label="Lobi Room Online">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <div>
              <span className="badge badge-mint">
                {connectionState === 'connected' ? '● Supabase Terhubung' : 'Menyambungkan...'}
              </span>
              <h2 style={{ margin: '6px 0 0', fontSize: '20px' }}>
                Room <span className="mono" style={{ color: 'var(--gold)' }}>{onlineSnapshot.roomCode}</span>
              </h2>
            </div>
            <button
              type="button"
              className="hud-btn"
              onClick={() => void copyRoomLink(onlineSnapshot.roomCode)}
            >
              {copiedMsg ?? 'Salin Link'}
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Kursi</th>
                  <th>Peserta ({activeMembers.length}/{maxSeats})</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {activeMembers.map((m) => (
                  <tr key={m.userId}>
                    <td className="mono">#{m.seat + 1}</td>
                    <td>
                      <strong>{m.displayName}</strong>
                      {m.userId === onlineSnapshot.hostId && (
                        <span className="badge badge-gold" style={{ marginLeft: '6px', padding: '1px 6px', fontSize: '10px' }}>
                          Host / Bandar
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${m.ready ? 'badge-mint' : ''}`}>
                        {m.ready ? 'Siap' : 'Menunggu'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {onlineError && (
            <div className="callout callout-red" role="alert">
              {onlineError}
            </div>
          )}

          {onlineIsHost ? (
            <div style={{ display: 'grid', gap: '8px' }}>
              <button
                type="button"
                className="btn-primary thumb-cta"
                disabled={!allReady}
                onClick={onOnlineStart}
              >
                {allReady
                  ? 'Mulai Permainan Online'
                  : activeMembers.length < 2
                    ? 'Minimal 2 Peserta untuk Mulai'
                    : 'Menunggu Semua Peserta Siap'}
              </button>
              <div className="thumb-row">
                <button
                  type="button"
                  disabled={activeMembers.length >= maxSeats}
                  onClick={onOnlineAddBot}
                >
                  + Tambah Bot
                </button>
                <button type="button" className="btn-ghost" onClick={onOnlineLeave}>
                  Tutup Room
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '8px' }}>
              <button
                type="button"
                className={me?.ready ? 'btn-ghost thumb-cta' : 'btn-primary thumb-cta'}
                onClick={onOnlineToggleReady}
              >
                {me?.ready ? 'Batalkan Siap' : 'Saya Siap!'}
              </button>
              <button type="button" className="btn-ghost" onClick={onOnlineLeave}>
                Keluar Room
              </button>
            </div>
          )}
        </section>
      </main>
    );
  }

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
            Panduan Aturan v1.0 & Asumsi (A01–A10)
          </button>
        </section>
      ) : (
        <section className="panel-card" aria-label="Mode Online Supabase">
          {isSupabaseConfigured ? (
            <>
              <div className="callout">
                <strong>● Supabase Realtime aktif.</strong> Buat room baru lalu bagikan kode ke teman, atau gabung memakai kode room.
              </div>

              <div className="field">
                <label htmlFor="online-name">Nama Tampilan</label>
                <input
                  id="online-name"
                  type="text"
                  maxLength={24}
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Nama Anda"
                />
              </div>

              <div className="field">
                <label>Maksimal Lawan (1–5)</label>
                <div className="pill-row" role="group" aria-label="Maksimal lawan online">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="pill-btn"
                      aria-pressed={maxOnlinePlayers === n}
                      onClick={() => setMaxOnlinePlayers(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="btn-primary thumb-cta"
                onClick={() =>
                  onCreateOnline({
                    playerName: playerName.trim() || 'Host',
                    maxPlayers: maxOnlinePlayers,
                  })
                }
              >
                Buat Room Online
              </button>

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: '12px', display: 'grid', gap: '8px' }}>
                <div className="field">
                  <label htmlFor="join-code">Atau Gabung dengan Kode Room</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px' }}>
                    <input
                      id="join-code"
                      type="text"
                      maxLength={8}
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="Contoh: AB12CD"
                      className="mono"
                    />
                    <button
                      type="button"
                      className="btn-gold"
                      disabled={joinCode.trim().length < 4}
                      onClick={() =>
                        onJoinOnline({
                          playerName: playerName.trim() || 'Pemain',
                          roomCode: joinCode.trim(),
                        })
                      }
                    >
                      Gabung
                    </button>
                  </div>
                </div>
              </div>

              {onlineError && (
                <div className="callout callout-red" role="alert">
                  {onlineError}
                </div>
              )}
            </>
          ) : (
            <div className="callout callout-gold">
              <strong>Backend Supabase belum dikonfigurasi.</strong>
              <p style={{ margin: '6px 0 0', fontSize: '12px' }}>
                Set <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> untuk mengaktifkan Multiplayer Online.
              </p>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
