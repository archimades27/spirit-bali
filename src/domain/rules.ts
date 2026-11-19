import type { GameRules } from './types';

export function createRulesV1(maxPlayers = 5): GameRules {
  if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 5) {
    throw new Error('INVALID_MAX_PLAYERS');
  }
  return Object.freeze({
    rulesVersion: '1.0',
    maxPlayers,
    startingBalance: 1000000,
    betStep: 10000,
    maxHandSize: 3,
    dealerWinsTies: true,
    playerNormalMultiplier: 1,
    playerNineMultiplier: 2, // A02 / A03
    playerTripleMultiplier: 3, // A02
    dealerWinMultiplier: 1,
    dealerRotationRounds: 3,
    udegMode: 'FIXED',
    udegShortfallPolicy: 'SKIP',
    timeoutsSec: Object.freeze({
      roundSetup: 60, // A07
      betting: 45, // A07
      drawDecision: 30, // A07
    }),
  });
}

export const RULES_V1_0: GameRules = createRulesV1(5);

export interface OpenAssumption {
  readonly id: string;
  readonly title: string;
  readonly defaultBehavior: string;
  readonly status: 'ASUMSI_TERBUKA';
}

export const OPEN_ASSUMPTIONS: readonly OpenAssumption[] = Object.freeze([
  {
    id: 'A01',
    title: 'Penerimaan bandar saat Udeg habis',
    defaultBehavior:
      'Pemain kalah tetap membayar 1× bet ke bandar; penerimaan tersebut tidak menambah sisa Udeg.',
    status: 'ASUMSI_TERBUKA',
  },
  {
    id: 'A02',
    title: 'Besaran pengali kemenangan pemain',
    defaultBehavior: 'Normal 1×; Nilai 9 = 2×; Triple = 3× (konfigurasi ruleset v1.0).',
    status: 'ASUMSI_TERBUKA',
  },
  {
    id: 'A03',
    title: 'Nilai 9 dari kartu ketiga',
    defaultBehavior:
      'Tetap mendapat pengali 2×; 9 murni (2 kartu) hanya metadata dan tidak memicu rotasi bandar.',
    status: 'ASUMSI_TERBUKA',
  },
  {
    id: 'A04',
    title: 'Saldo habis dan akhir sesi',
    defaultBehavior:
      'Peserta bersaldo < Rp10.000 tidak ikut ronde berikut. Bandar dipilih dari kursi eligible ≥ Rp10.000; jika < 2 peserta eligible, sesi FINISHED tanpa top-up otomatis.',
    status: 'ASUMSI_TERBUKA',
  },
  {
    id: 'A05',
    title: 'Batas minimum & step Udeg',
    defaultBehavior:
      'Integer positif kelipatan Rp10.000, tidak melebihi saldo awal ronde bandar. Dipilih ulang tiap ronde dan fixed sepanjang ronde.',
    status: 'ASUMSI_TERBUKA',
  },
  {
    id: 'A06',
    title: 'Bandar pertama, urutan deal/Draw/payout',
    defaultBehavior:
      'Host jadi bandar awal; urutan searah jarum jam dimulai setelah bandar; giliran Draw mengikuti urutan kursi dengan bandar terakhir.',
    status: 'ASUMSI_TERBUKA',
  },
  {
    id: 'A07',
    title: 'Timeout dan pembatalan',
    defaultBehavior:
      'Setup 60d, Betting 45d, Draw 30d. Timeout Draw → Stop. Timeout Setup/Betting membatalkan ronde sebelum reveal, melepas reserve, tanpa menambah counter rotasi.',
    status: 'ASUMSI_TERBUKA',
  },
  {
    id: 'A08',
    title: 'Join/leave/host putus di tengah ronde',
    defaultBehavior:
      'Kursi aktif dibekukan per ronde; join/leave efektif di batas ronde berikutnya.',
    status: 'ASUMSI_TERBUKA',
  },
  {
    id: 'A09',
    title: 'Metode login & detail visual',
    defaultBehavior:
      'Online mendukung Supabase Auth (anonymous/guest atau email); muka kartu domino kertas kuning dengan titik merah (dikonfirmasi pengguna).',
    status: 'ASUMSI_TERBUKA',
  },
]);
