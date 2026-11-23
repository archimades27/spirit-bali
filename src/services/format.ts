const idrFormatter = new Intl.NumberFormat('id-ID');

export function formatRupiah(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = `Rp${idrFormatter.format(abs)}`;
  if (amount < 0) return `−${formatted}`;
  return formatted;
}

export function formatSignedRupiah(amount: number): string {
  if (amount > 0) return `+${formatRupiah(amount)}`;
  return formatRupiah(amount);
}

export function formatShortK(amount: number): string {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return Number.isInteger(m) ? `${m}jt` : `${m.toFixed(1)}jt`;
  }
  return `${Math.round(amount / 1000)}rb`;
}

export function formatSignedShortK(amount: number): string {
  if (amount > 0) return `+${formatShortK(amount)}`;
  if (amount < 0) return `−${formatShortK(-amount)}`;
  return '0';
}
