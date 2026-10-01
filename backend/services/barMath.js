// barMath.js — pure arithmetic on daily bars ({date, open, high, low, close}, oldest first).
// ATR is the simple mean true range used by the 2026-09-21 closed-trade study.

export function idxOnOrAfter(bars, date) {
  const i = bars.findIndex((b) => b.date >= date);
  return i < 0 ? null : i;
}

export function idxOnOrBefore(bars, date) {
  let found = null;
  for (let i = 0; i < bars.length && bars[i].date <= date; i++) found = i;
  return found;
}

export function atrAt(bars, i, period = 14) {
  if (i == null || i < period) return null;
  let sum = 0;
  for (let j = i - period + 1; j <= i; j++) {
    const b = bars[j], pc = bars[j - 1].close;
    sum += Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
  }
  return sum / period;
}

export function emaAt(bars, i, period = 20) {
  if (i == null || i < period - 1) return null;
  let ema = bars.slice(0, period).reduce((s, b) => s + b.close, 0) / period;
  const k = 2 / (period + 1);
  for (let j = period; j <= i; j++) ema = bars[j].close * k + ema * (1 - k);
  return ema;
}

export const round2 = (x) => Math.round(x * 100) / 100;
export const pct = (from, to) => round2(((to - from) / from) * 100);

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Median % close-to-close move of the basket members over [fromDate, toDate] (exact dates).
export function basketMove(basket, fromDate, toDate) {
  const moves = [];
  for (const bars of basket) {
    const a = bars.find((b) => b.date === fromDate);
    const z = bars.find((b) => b.date === toDate);
    if (a && z) moves.push(((z.close - a.close) / a.close) * 100);
  }
  const m = median(moves);
  return m == null ? null : round2(m);
}

// Median one-day close-to-close move (a fraction) of the basket on `date`.
export function basketDayMove(basket, date) {
  const moves = [];
  for (const bars of basket) {
    const i = bars.findIndex((b) => b.date === date);
    if (i > 0) moves.push((bars[i].close - bars[i - 1].close) / bars[i - 1].close);
  }
  return median(moves);
}
