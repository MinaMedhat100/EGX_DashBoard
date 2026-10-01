import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idxOnOrAfter, idxOnOrBefore, atrAt, emaAt, pct, median, basketMove, basketDayMove } from '../services/barMath.js';

// n flat-ish bars from 2026-09-01: close 10, high 10.5, low 9.5 (true range 1.0)
const flat = (n, start = 1) => Array.from({ length: n }, (_, k) => ({
  date: `2026-09-${String(start + k).padStart(2, '0')}`, open: 10, high: 10.5, low: 9.5, close: 10,
}));

test('index lookups', () => {
  const b = [{ date: '2026-09-01' }, { date: '2026-09-03' }, { date: '2026-09-05' }];
  assert.equal(idxOnOrAfter(b, '2026-09-02'), 1);
  assert.equal(idxOnOrAfter(b, '2026-09-06'), null);
  assert.equal(idxOnOrBefore(b, '2026-09-04'), 1);
  assert.equal(idxOnOrBefore(b, '2026-08-31'), null);
});

test('atrAt: 14-bar mean true range; null without enough history', () => {
  const b = flat(20);
  assert.equal(atrAt(b, 14), 1);
  assert.equal(atrAt(b, 13), null);
  b[14] = { ...b[14], high: 12, low: 10 }; // TR = max(2, |12-10|, |10-10|) = 2
  assert.equal(atrAt(b, 14), (13 + 2) / 14);
});

test('emaAt: SMA seed then smoothing; null before the period', () => {
  const b = flat(25);
  assert.equal(emaAt(b, 19), 10);
  assert.equal(emaAt(b, 18), null);
  b[20] = { ...b[20], close: 12.1 };
  assert.equal(Math.round(emaAt(b, 20) * 1000) / 1000, 10.2); // 10 + (2/21)*2.1
});

test('pct and median', () => {
  assert.equal(pct(10, 9), -10);
  assert.equal(pct(3, 3.3333), 11.11);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
});

test('basketMove: median member move; members missing an end bar are skipped', () => {
  const m1 = [{ date: '2026-09-01', close: 10 }, { date: '2026-09-10', close: 11 }];   // +10
  const m2 = [{ date: '2026-09-01', close: 20 }, { date: '2026-09-10', close: 19 }];   // -5
  const m3 = [{ date: '2026-09-01', close: 5 }, { date: '2026-09-10', close: 5.5 }];   // +10
  const m4 = [{ date: '2026-09-05', close: 1 }];                                       // skipped
  assert.equal(basketMove([m1, m2, m3, m4], '2026-09-01', '2026-09-10'), 10);
  assert.equal(basketMove([m4], '2026-09-01', '2026-09-10'), null);
});

test('basketDayMove: median close-to-close fraction on that date', () => {
  const m1 = [{ date: '2026-09-01', close: 10 }, { date: '2026-09-02', close: 10.2 }];
  const m2 = [{ date: '2026-09-01', close: 10 }, { date: '2026-09-02', close: 9.9 }];
  assert.equal(Math.round(basketDayMove([m1, m2], '2026-09-02') * 1000) / 1000, 0.005);
  assert.equal(basketDayMove([m1], '2026-09-01'), null);
});
