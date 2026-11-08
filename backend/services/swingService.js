// swingService.js — real turning points from an index's own bars (v2.11.0). Pure.
// Bars: [{ date: 'YYYY-MM-DD', open, high, low, close }], oldest first, finite values (esthmrIndices cleans them).
// swingLevels returns the same { name, tf, value } shape as the bridge's levels, so buildZones is unchanged.

export const SWING_N = { D: 5, W: 3 }; // bars that must sit lower (or higher) on each side
export const SWINGS_KEPT = 6; // most recent swing highs and lows kept per timeframe: keeps the ladder readable
const STRUCTURE_KEPT = 3;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function swingPoints(bars, n) {
  const out = [];
  for (let i = n; i < (bars?.length ?? 0) - n; i++) {
    let high = true;
    let low = true;
    for (let k = i - n; k <= i + n; k++) {
      if (k === i) continue;
      if (bars[k].high >= bars[i].high) high = false;
      if (bars[k].low <= bars[i].low) low = false;
    }
    if (high) out.push({ i, date: bars[i].date, kind: 'high', value: bars[i].high });
    if (low) out.push({ i, date: bars[i].date, kind: 'low', value: bars[i].low });
  }
  return out;
}

function label(kind, date, refYear) {
  const [y, m, d] = date.split('-');
  return `Swing ${kind} ${Number(d)} ${MONTHS[Number(m) - 1]}${y === refYear ? '' : ` ${y}`}`;
}

const extreme = (bars, key, better) => bars.reduce((best, b, i) => (better(b[key], bars[best][key]) ? i : best), 0);

export function swingLevels(bars, tf) {
  const n = SWING_N[tf];
  if (!n || !Array.isArray(bars) || bars.length < 2 * n + 1) return [];
  const points = swingPoints(bars, n);
  const kept = [
    ...points.filter((p) => p.kind === 'high').slice(-SWINGS_KEPT),
    ...points.filter((p) => p.kind === 'low').slice(-SWINGS_KEPT),
  ].sort((a, b) => a.i - b.i);
  const refYear = bars[bars.length - 1].date.slice(0, 4);

  if (tf !== 'D') return kept.map((p) => ({ name: label(p.kind, p.date, refYear), tf, value: p.value }));

  // Daily bars cover one year: add its high and low; a swing on the same bar is not counted twice.
  const hi = extreme(bars, 'high', (a, b) => a > b);
  const lo = extreme(bars, 'low', (a, b) => a < b);
  return [
    ...kept
      .filter((p) => !(p.kind === 'high' && p.i === hi) && !(p.kind === 'low' && p.i === lo))
      .map((p) => ({ name: label(p.kind, p.date, refYear), tf, value: p.value })),
    { name: 'Year high', tf, value: bars[hi].high },
    { name: 'Year low', tf, value: bars[lo].low },
  ];
}

function trend(list) {
  if (list.length < 2) return null;
  const steps = list.slice(1).map((p, i) => p.value - list[i].value);
  if (steps.every((s) => s > 0)) return 'rising';
  if (steps.every((s) => s < 0)) return 'falling';
  return 'mixed';
}

export function structure(bars, n = SWING_N.D) {
  const points = Array.isArray(bars) ? swingPoints(bars, n) : [];
  const last = (kind) => points.filter((p) => p.kind === kind).slice(-STRUCTURE_KEPT).map(({ date, value }) => ({ date, value }));
  const highs = last('high');
  const lows = last('low');
  return { highs, lows, highs_trend: trend(highs), lows_trend: trend(lows) };
}
