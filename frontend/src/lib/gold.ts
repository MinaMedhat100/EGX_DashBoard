export const OZ_TO_GRAM = 31.1035;

export type GoldUnit = 'oz_usd' | 'g_usd' | 'g_egp';

export const GOLD_UNITS: { key: GoldUnit; label: string; sym: string }[] = [
  { key: 'oz_usd', label: 'USD / oz', sym: '$' },
  { key: 'g_usd', label: 'USD / g', sym: '$' },
  { key: 'g_egp', label: 'EGP / g', sym: 'E£' },
];

/** Convert a native USD/oz price to the selected display unit. Returns null when EGP is
 *  requested but the USD/EGP rate is unavailable. */
export function convertPrice(usdPerOz: number | null | undefined, unit: GoldUnit, usdEgp: number | null | undefined): number | null {
  if (usdPerOz == null) return null;
  if (unit === 'oz_usd') return usdPerOz;
  const perGram = usdPerOz / OZ_TO_GRAM;
  if (unit === 'g_usd') return perGram;
  if (usdEgp == null) return null;
  return perGram * usdEgp;
}

export function fmtGold(usdPerOz: number | null | undefined, unit: GoldUnit, usdEgp: number | null | undefined): string {
  const v = convertPrice(usdPerOz, unit, usdEgp);
  if (v == null) return unit === 'g_egp' ? 'rate n/a' : '—';
  const dp = unit === 'oz_usd' ? 2 : unit === 'g_usd' ? 3 : 1;
  const sym = GOLD_UNITS.find((u) => u.key === unit)!.sym;
  return `${sym}${v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

// Thndr gold execution windows, Africa/Cairo. The dashboard runs locally in Cairo, so the
// browser's local time is Cairo time — no timezone library needed.
export const THNDR_WINDOWS = ['10:00', '13:00', '15:00'];

export function nextThndrWindow(now: Date = new Date()): { label: string; minsUntil: number } {
  const mins = now.getHours() * 60 + now.getMinutes();
  const marks = [10 * 60, 13 * 60, 15 * 60];
  for (const w of marks) {
    if (mins < w) return { label: `${String(Math.floor(w / 60)).padStart(2, '0')}:00`, minsUntil: w - mins };
  }
  return { label: '10:00', minsUntil: 24 * 60 - mins + 10 * 60 }; // tomorrow's first window
}
