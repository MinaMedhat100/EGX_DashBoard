import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidence, afterExitSessions, entryPrice, initialLevels, levelsInForce } from '../services/evidenceService.js';

// 40 sessions from 2026-08-01 (dates are just ordered labels): close 10, high 10.5, low 9.5 → ATR 1.
function series(n = 40, start = '2026-08-01') {
  const t0 = Date.parse(start);
  return Array.from({ length: n }, (_, k) => ({
    date: new Date(t0 + k * 86400000).toISOString().slice(0, 10), open: 10, high: 10.5, low: 9.5, close: 10,
  }));
}
const day = (bars, k) => bars[k].date;

function classicTrade(bars, { entryK = 20, exitK = 25, exitPx = 9.4, type = 'STOP-OUT' } = {}) {
  return {
    trade_id: 'CLSC-x', ticker: 'CLSC', status: 'closed', opened_at: day(bars, entryK), origin: 'card',
    card: { scan_as_of: `${day(bars, entryK - 2)}T04:00:00.000Z` },
    entry: { price: 10, shares: 100, mode: 'classic', stop: 9.4, t1: 11, t2: 12, levels_known: true },
    events: [
      { kind: 'order', type: 'STOP_OUT', lot: null, shares: 100, price: exitPx, date: day(bars, exitK), at: `${day(bars, exitK)}T12:00:00.000Z` },
    ],
    exit: { date: day(bars, exitK), price: exitPx, type, realized_pnl: -60, approximate: false },
  };
}

test('entryPrice prefers the last correction', () => {
  const t = { entry: { price: 10 }, events: [{ kind: 'correction', to: { shares: 1, avg_cost: 9.6 } }] };
  assert.equal(entryPrice(t), 9.6);
  assert.equal(entryPrice({ entry: { price: 7 }, events: [] }), 7);
  assert.equal(entryPrice({ entry: null, events: [] }), null);
});

test('levels: entry plan first, then the first/last levels event; brackets per lot', () => {
  const lots = { lots: { A: { stop: 9, tp: 11, open: true }, B: { stop: 9.2, tp: 12, open: true } } };
  const t = { entry: { levels_known: false }, events: [
    { kind: 'levels', source: 'seeded', at: '2026-09-02T00:00:00Z', from: null, to: lots },
    { kind: 'levels', source: 'manual', at: '2026-09-03T00:00:00Z', from: lots, to: { lots: { ...lots.lots, A: { stop: 9.5, tp: 11, open: true } } } },
  ] };
  assert.deepEqual(initialLevels(t), { stop: null, stop_a: 9, stop_b: 9.2, t1: 11, t2: 12 });
  assert.equal(levelsInForce(t).stop_a, 9.5);
  assert.deepEqual(initialLevels({ entry: { levels_known: true, stop: 9, t1: 11, t2: 12 }, events: [] }),
    { stop: 9, stop_a: null, stop_b: null, t1: 11, t2: 12 });
});

test('afterExitSessions counts bars after the exit day; null for a non-ISO exit', () => {
  const b = series();
  assert.equal(afterExitSessions(classicTrade(b, { exitK: 25 }), b), 14);
  assert.equal(afterExitSessions({ exit: { date: '~May–Jun 2026' } }, b), null);
});

test('buildEvidence: entry, held and after groups for a stop-out that recovered', () => {
  const b = series();
  b[23] = { ...b[23], low: 9.0 };          // worst low while held
  b[22] = { ...b[22], high: 10.8 };        // best high while held
  for (let k = 26; k < 40; k++) b[k] = { ...b[k], open: 9.5, high: 9.8, low: 9.2, close: 9.5 }; // below entry after exit
  b[28] = { ...b[28], high: 10.2 };        // 3rd session after exit → back to entry 10
  const ev = buildEvidence(classicTrade(b), b, []);
  assert.equal(ev.entry.price, 10);
  assert.equal(ev.entry.atr, 1);
  assert.equal(ev.entry.stop_atr, 0.6);
  assert.equal(ev.entry.ema20_atr, 0);
  assert.equal(ev.entry.card_age_days, 2);
  assert.equal(ev.held.sessions_held, 6);
  assert.equal(ev.held.mae_pct, -10);
  assert.equal(ev.held.mae_atr, -1);
  assert.equal(ev.held.mfe_pct, 8);
  assert.equal(ev.held.t1_touched, false);
  assert.equal(ev.after.recovered_to_entry, true);
  assert.equal(ev.after.sessions_to_recover, 3);
  assert.equal(ev.after.move_after_pct, -5);
  assert.equal(ev.after.max_gain_after_pct, 8.51);
  assert.deepEqual(ev.after.market_move_after_pct, { unknown: 'no market basket data' });
  assert.equal(ev.data.corporate_action, false);
  assert.equal(ev.data.bars_through, day(b, 39));
});

test('buildEvidence: after group unknown until 10 sessions exist', () => {
  const b = series(30);
  const ev = buildEvidence(classicTrade(b, { exitK: 25 }), b, []);
  assert.deepEqual(ev.after, { unknown: 'only 4 sessions after the exit so far' });
});

test('buildEvidence: recovery is not asked of a winning sell', () => {
  const b = series();
  const ev = buildEvidence(classicTrade(b, { exitPx: 11, type: 'SELL' }), b, []);
  assert.deepEqual(ev.after.recovered_to_entry, { unknown: 'not a loss' });
});

test('buildEvidence: market move from the basket over the same window', () => {
  const b = series();
  const member = b.map((x, k) => ({ ...x, close: k >= 35 ? 11 : 10 }));
  const ev = buildEvidence(classicTrade(b), b, [member]);
  assert.equal(ev.after.market_move_after_pct, 10);
});

test('buildEvidence: corporate action = >25% one-day gap the basket did not share', () => {
  const b = series();
  for (let k = 30; k < 40; k++) b[k] = { ...b[k], close: 5, high: 5.2, low: 4.8, open: 5 };
  const flatMember = series();
  const ev = buildEvidence(classicTrade(b), b, [flatMember]);
  assert.deepEqual(ev.data.corporate_action, { date: day(b, 30), gap_pct: -50 });
});

test('buildEvidence: per-lot stop distance on brackets; unknown stop when never recorded', () => {
  const b = series();
  const t = classicTrade(b);
  t.entry = { price: 10, levels_known: false, mode: 'bracket' };
  t.events.unshift({ kind: 'levels', source: 'seeded', at: `${day(b, 20)}T00:00:00Z`, from: null,
    to: { lots: { A: { stop: 9.5, tp: 11, open: true }, B: { stop: 9, tp: 12, open: true } } } });
  assert.deepEqual(buildEvidence(t, b, []).entry.stop_atr, { A: 0.5, B: 1 });
  t.events.shift();
  assert.deepEqual(buildEvidence(t, b, []).entry.stop_atr, { unknown: 'the stop was never recorded' });
});

test('buildEvidence: process facts', () => {
  const b = series();
  const t = classicTrade(b);
  t.events[0].at = '2027-01-15T10:00:00.000Z'; // logged long after the fill
  t.events.push(
    { kind: 'ai_read', at: '2026-12-01T10:00:00.000Z', analyzed_at: '2026-12-01T10:00:00.000Z', suggested: { stop: 9.6 }, recommendation: 'EXIT' },
    { kind: 'levels', source: 'manual', at: `${day(b, 21)}T09:00:00Z`, from: null, to: { stop: 9.4, t1: 11, t2: 12 } },
  );
  t.events.splice(1, 0, { kind: 'ai_read', at: `${day(b, 22)}T00:00:00Z`, analyzed_at: `${day(b, 22)}T00:00:00Z`, suggested: { stop: 9.6 }, recommendation: 'HOLD' });
  const p = buildEvidence(t, b, []).process;
  assert.equal(p.log_lag_days[0].days > 100, true);
  assert.equal(p.reads_after_close, 1);
  assert.deepEqual(p.levels_changes, { manual: 1 });
  assert.equal(p.last_stop_vs_ai, 'looser');
});

test('buildEvidence: fills validated against the day range', () => {
  const b = series();
  const t = classicTrade(b, { exitPx: 9.4 });   // inside [9.5*0.995, 10.5*1.005]? 9.4 < 9.4525 → outside
  const ev = buildEvidence(t, b, []);
  assert.equal(ev.data.fills_validated.checked, 1);
  assert.equal(ev.data.fills_validated.outside.length, 1);
});

test('buildEvidence: no bars → bar facts unknown, process facts still there', () => {
  const t = classicTrade(series());
  const ev = buildEvidence(t, [], []);
  assert.deepEqual(ev.entry.atr, { unknown: 'no price history' });
  assert.deepEqual(ev.held, { unknown: 'no price history' });
  assert.deepEqual(ev.after, { unknown: 'no price history' });
  assert.equal(typeof ev.process.reads_after_close, 'number');
});

test('buildEvidence: stop distance from the stop-out fill, even when the stop was never recorded', () => {
  const b = series();
  const t = classicTrade(b);
  t.entry = { price: 10, levels_known: false };
  const ev = buildEvidence(t, b, []);
  assert.deepEqual(ev.entry.stop_atr, { unknown: 'the stop was never recorded' });
  assert.equal(ev.entry.stop_atr_from_fill, 0.6);
  const sold = classicTrade(b, { exitPx: 11, type: 'SELL' });
  sold.events[0].type = 'SELL';
  assert.deepEqual(buildEvidence(sold, b, []).entry.stop_atr_from_fill, { unknown: 'no stop-out fill' });
});
