# Spirit Bali — Domino Kertas v1.0

Implementasi **Spirit Bali** berdasarkan *Master Implementation Plan v1.0*: permainan domino kertas tradisional (1 Bandar / Cong melawan 1–5 pemain) dengan antarmuka **Modern Dark** dan kartu kertas tradisional.

> **Cakupan produk:** Saldo virtual (`Rp1.000.000` awal per peserta) khusus untuk simulasi permainan — tanpa pembelian saldo, pencairan, atau transfer uang asli.

## Live Demo (GitHub Pages)
- **URL:** https://archimades27.github.io/spirit-bali/
- Mode **Main Langsung (vs Bot AI)** dapat langsung dimainkan di GitHub Pages menggunakan pure TypeScript domain engine v1.0 yang sama (CSPRNG Fisher–Yates, settlement atomik, Udeg fixed/skip, rotasi bandar 3 ronde).
- Mode **Multiplayer Online** siap dihubungkan ke Supabase (migrasi SQL, RLS, `private` schema, dan Edge Function `submit-game-action` sudah tersedia di folder `supabase/`).

## Struktur Proyek
```
spirit-bali/
  src/
    app/            # App shell & hash navigation
    components/     # PaperDomino, PlayerSeat, BetPanel, UdegMeter, StatusBar, RulesModal
    features/
      room/         # HomeLobby (Local vs Bot & Online Supabase)
      game/         # GameTable & ResultSheet
    domain/         # Pure TS engine: deck, handEvaluator, handComparator, settlementEngine, dealerRotation, gameReducer
    services/       # LocalGameSession, Supabase client, Rupiah formatters
    styles/         # Modern Dark tokens & accessible responsive CSS
  supabase/
    migrations/     # 0001_spirit_bali_v1.sql (tables, private schema, RLS, atomic settlement RPC)
    functions/      # submit-game-action Edge Function gateway
  tests/
    fixtures/       # rules-v1.0.json canonical vectors
    domain.test.ts  # Acceptance tests T01–T36 + 3,000 property-based runs
  .github/workflows/deploy.yml
```

## Menjalankan Secara Lokal
```bash
npm install
npm run typecheck
npm test
npm run dev
```

## Build & Deploy GitHub Pages
```bash
npm run build
```
Workflow `.github/workflows/deploy.yml` otomatis menjalankan `npm ci` → `npm run typecheck` → `npm test` → `npm run build` → deploy `dist/` ke GitHub Pages pada setiap push ke branch `main`.

## Setup Backend Multiplayer Supabase (Opsional)
1. Buat proyek Supabase baru.
2. Terapkan migrasi `supabase/migrations/0001_spirit_bali_v1.sql`.
3. Deploy Edge Function `supabase/functions/submit-game-action/index.ts`.
4. Salin `.env.example` menjadi `.env` (atau tambahkan di GitHub Repository Variables):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - **Jangan pernah** menaruh `SUPABASE_SERVICE_ROLE_KEY` di frontend atau repository publik.

## Aturan v1.0 & Asumsi Terbuka (A01–A09)
- **Dikonfirmasi:** 1 Bandar vs 1–5 pemain; 28 kartu domino kertas double-six unik (belakang kuning titik merah); modal awal Rp1.000.000; bet kelipatan Rp10.000 setelah kartu pertama; semua peserta termasuk bandar boleh Stop atau Draw tepat 1 kartu ke-3; skor = total titik mod 10; Triple (3 balak berbeda) rank tertinggi; seri (termasuk Triple vs Triple) dimenangkan bandar; bandar menang dengan 9/Triple tetap menerima 1× bet; Udeg fixed/skip per ronde; rotasi bandar tepat setelah 3 ronde selesai (bukan karena 9 murni).
- **Asumsi Terbuka (A01–A09):** Diterapkan sebagai default prototipe di `src/domain/rules.ts` dan ditampilkan di modal **Aturan v1.0** dalam aplikasi — bukan konfirmasi aturan lokal:
  - **A01:** Kekalahan pemain tetap dibayar 1× bet ke bandar dan tidak menambah sisa Udeg.
  - **A02:** Pengali kemenangan pemain default Normal `1×`, Nilai 9 `2×`, Triple `3×`.
  - **A03:** Nilai 9 dari 3 kartu tetap mendapat `2×`; 9 murni hanya metadata.
  - **A04:** Saldo `< Rp10.000` tidak ikut ronde berikut; jika peserta eligible `< 2`, sesi `FINISHED` tanpa top-up otomatis.
  - **A05:** Udeg integer positif kelipatan Rp10.000, `<=` saldo awal ronde bandar.
  - **A06:** Host menjadi bandar awal; urutan deal/payout searah jarum jam setelah bandar; Draw berurutan kursi dengan bandar terakhir.
  - **A07:** Timeout Setup 60d, Betting 45d, Draw 30d (Draw → Stop; Setup/Betting → batal ronde sebelum reveal, lepas reserve, counter rotasi tidak bertambah).
  - **A08:** Kursi aktif dibekukan per ronde; join/leave efektif pada batas ronde.
  - **A09:** Supabase Auth guest/akun untuk online; pip depan charcoal pada kertas krem.
