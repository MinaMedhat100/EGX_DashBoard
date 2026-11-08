import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swingPoints, swingLevels, structure, SWING_N, SWINGS_KEPT } from '../services/swingService.js';

const addDays = (ymd, k) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + k);
  return d.toISOString().slice(0, 10);
};
const bar = (date, high, low) => ({ date, open: (high + low) / 2, high, low, close: (high + low) / 2 });
// Bars from a list of highs (lows flat unless given), one per `step` days from `start`.
const series = (highs, { start = '2026-09-01', step = 1, lows } = {}) =>
  highs.map((h, i) => bar(addDays(start, i * step), h, lows ? lows[i] : 0.5));

test('constants', () => {
  assert.deepEqual(SWING_N, { D: 5, W: 3 });
  assert.equal(SWINGS_KEPT, 6);
});

test('swingPoints: a peak needs n strictly lower bars on each side', () => {
  const highs = swingPoints(series([1, 2, 5, 2, 1, 3, 1]), 2).filter((p) => p.kind === 'high');
  assert.deepEqual(highs.map((p) => [p.i, p.value]), [[2, 5]]); // index 5 has only 1 bar to its right
});

test('swingPoints: ties are not swings', () => {
  assert.deepEqual(swingPoints(series([1, 2, 5, 5, 2, 1]), 2).filter((p) => p.kind === 'high'), []);
});

test('swingPoints: lows mirror highs', () => {
  const lows = swingPoints(series([9, 9, 9, 9, 9], { lows: [5, 4, 1, 4, 5] }), 2).filter((p) => p.kind === 'low');
  assert.deepEqual(lows.map((p) => [p.i, p.value, p.date]), [[2, 1, '2026-09-03']]);
});

test('swingLevels D: n=5, dated name, year high and low', () => {
  // peak 9 on 6 Sep with 6 bars after it; the year high (12) is the last bar, which can't be a swing
  const lv = swingLevels(series([1, 1, 1, 1, 1, 9, 1, 1, 1, 1, 1, 12]), 'D');
  assert.deepEqual(lv, [
    { name: 'Swing high 6 Sep', tf: 'D', value: 9 },
    { name: 'Year high', tf: 'D', value: 12 },
    { name: 'Year low', tf: 'D', value: 0.5 },
  ]);
});

test('swingLevels D: only 4 bars after a peak is not a swing', () => {
  const lv = swingLevels(series([1, 1, 1, 1, 1, 1, 9, 1, 1, 1, 1]), 'D');
  assert.equal(lv.filter((l) => l.name.startsWith('Swing')).length, 0);
});

test('swingLevels: a swing from an earlier year carries the year', () => {
  const lv = swingLevels(series([1, 1, 1, 1, 1, 9, 1, 1, 1, 1, 1, 12], { start: '2025-12-25' }), 'D');
  assert.equal(lv[0].name, 'Swing high 30 Dec 2025');
});

test('swingLevels: the year-high bar is not counted twice', () => {
  const lv = swingLevels(series([1, 1, 1, 1, 1, 9, 1, 1, 1, 1, 1, 2]), 'D');
  assert.equal(lv.filter((l) => l.value === 9).length, 1);
  assert.deepEqual(lv.find((l) => l.value === 9), { name: 'Year high', tf: 'D', value: 9 });
});

test('swingLevels W: n=3 and no year levels', () => {
  const lv = swingLevels(series([1, 1, 1, 5, 1, 1, 1, 1], { step: 7 }), 'W');
  assert.deepEqual(lv, [{ name: 'Swing high 22 Sep', tf: 'W', value: 5 }]);
});

test('swingLevels keeps the 6 most recent swing highs and lows (Review Focus 3)', () => {
  const pattern = [5, 4, 3, 2, 3, 4];
  const highs = Array.from({ length: 6 * 21 + 1 }, (_, i) => pattern[i % 6] + i * 0.001);
  const bars = series(highs, { step: 7, lows: highs.map((h) => h - 1), start: '2024-01-01' });
  const all = swingPoints(bars, SWING_N.W);
  assert.ok(all.filter((p) => p.kind === 'high').length >= 20);
  assert.ok(all.filter((p) => p.kind === 'low').length >= 20);
  const lv = swingLevels(bars, 'W');
  const want = (kind) => all.filter((p) => p.kind === kind).slice(-6).map((p) => p.value);
  assert.deepEqual(lv.filter((l) => l.name.startsWith('Swing high')).map((l) => l.value), want('high'));
  assert.deepEqual(lv.filter((l) => l.name.startsWith('Swing low')).map((l) => l.value), want('low'));
});

test('structure: last 3 swings oldest first, with the trend', () => {
  const s = structure(series([1, 2, 10, 2, 1, 2, 12, 2, 1, 2, 14, 2, 1]), 2);
  assert.deepEqual(s.highs.map((h) => h.value), [10, 12, 14]);
  assert.equal(s.highs[0].date, '2026-09-03');
  assert.equal(s.highs_trend, 'rising');
  assert.deepEqual(s.lows, []);
  assert.equal(s.lows_trend, null);
  assert.equal(structure(series([1, 2, 14, 2, 1, 2, 12, 2, 1, 2, 13, 2, 1]), 2).highs_trend, 'mixed');
  assert.equal(structure(series([1, 2, 14, 2, 1, 2, 12, 2, 1, 2, 10, 2, 1]), 2).highs_trend, 'falling');
  assert.equal(structure(series([1, 2, 1, 2, 1, 2, 9, 2, 1]), 2).highs_trend, null); // one swing only
});

test('structure keeps at most 3 per side', () => {
  const s = structure(series([1, 2, 5, 2, 1, 2, 6, 2, 1, 2, 7, 2, 1, 2, 8, 2, 1]), 2);
  assert.deepEqual(s.highs.map((h) => h.value), [6, 7, 8]);
});

test('empty or short input', () => {
  assert.deepEqual(swingLevels([], 'D'), []);
  assert.deepEqual(swingLevels(series([1, 2, 3]), 'D'), []);
  assert.deepEqual(swingPoints([], 2), []);
  const empty = { highs: [], lows: [], highs_trend: null, lows_trend: null };
  assert.deepEqual(structure([]), empty);
  assert.deepEqual(structure(series([1, 2, 3])), empty);
});
