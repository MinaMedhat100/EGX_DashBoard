import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchIndexExtras, cleanBars, ESTHMR_INDEX, EXTRAS_BUDGET_MS, MIN_BARS, PART_NAMES } from '../services/esthmrIndices.js';
import { EsthmrOff } from '../services/esthmrClient.js';

const NOW = () => new Date('2026-11-08T10:00:00Z');
const addDays = (ymd, k) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + k);
  return d.toISOString().slice(0, 10);
};
// n valid bars that rise for 6 bars and fall for 6: a swing high and a swing low every 12 bars.
const WAVE = [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];
const zigzag = (n, start, step) => Array.from({ length: n }, (_, i) => {
  const c = 1000 + WAVE[i % 12] * 10 + i * 0.01;
  return { date: addDays(start, i * step), open: c, high: c + 2, low: c - 2, close: c };
});

const ANSWERS = {
  index_history: (a) => ({ summary: 'free text', points: a.interval === 'day' ? zigzag(80, '2026-07-01', 1) : zigzag(40, '2026-01-01', 7) }),
  investor_flows: () => ({ sessions: [{ date: '2026-11-05', shares: { eg: -1e8, ar: 0, fo: 1e8 }, sharesValue: 1e10 }] }),
  what_moved: () => ({ session: '2026-11-05', breadth: { up: 10, down: 20, flat: 1, none: 2 }, sectors: [], rose: [], fell: [] }),
  rates_and_macro: () => ({ currencies: [{ code: 'USD', egp: 50 }] }),
  upcoming_events: () => ({ banks: [{ bank: 'cbe', date: '2026-12-17' }], events: [] }),
};
function fakeCall(over = {}) {
  const seen = [];
  const call = async (name, args) => {
    seen.push({ name, args });
    return (over[name] ?? ANSWERS[name])(args);
  };
  return { call, seen };
}

test('constants', () => {
  assert.deepEqual(ESTHMR_INDEX, { EGX30: 'EGX30', EGX70: 'EGX70EWI', EGX100: 'EGX100EWI' });
  assert.equal(EXTRAS_BUDGET_MS, 12000);
  assert.deepEqual(MIN_BARS, { D: 60, W: 26 });
  assert.deepEqual(PART_NAMES, ['history:EGX30:D', 'history:EGX30:W', 'history:EGX70:D', 'history:EGX70:W',
    'history:EGX100:D', 'history:EGX100:W', 'flows', 'breadth', 'macro', 'events']);
});

test('happy path: exactly 10 calls with the right names and dates; every part present', async () => {
  const { call, seen } = fakeCall();
  const { parts, status } = await fetchIndexExtras({ call, now: NOW });
  assert.equal(seen.length, 10);
  assert.ok(seen.every((c) => c.args.language === 'en'));
  const hist = seen.filter((c) => c.name === 'index_history');
  assert.deepEqual([...new Set(hist.map((c) => c.args.index))], ['EGX30', 'EGX70EWI', 'EGX100EWI']);
  assert.ok(hist.filter((c) => c.args.interval === 'day').every((c) => c.args.from === '2025-11-08'));
  assert.ok(hist.filter((c) => c.args.interval === 'week').every((c) => c.args.from === '2023-11-09'));
  assert.deepEqual(seen.find((c) => c.name === 'investor_flows').args, { days: 20, language: 'en' });
  assert.deepEqual(seen.find((c) => c.name === 'what_moved').args, { count: 5, language: 'en' });
  assert.deepEqual(status, { ok: true, failed: [] });
  const lv = parts.history.EGX70.levels;
  assert.ok(lv.some((l) => l.name.startsWith('Swing ') && l.tf === 'D'));
  assert.ok(lv.some((l) => l.name.startsWith('Swing ') && l.tf === 'W'));
  assert.ok(lv.some((l) => l.name === 'Year high'));
  assert.ok(parts.history.EGX70.structure.highs.length > 0);
  assert.deepEqual(Object.keys(parts.history), ['EGX30', 'EGX70', 'EGX100']);
  assert.equal(parts.flows.counted, 1);
  assert.equal(parts.breadth.up, 10);
  assert.equal(parts.macro.usd_egp, 50);
  assert.equal(parts.events.next_cbe, '2026-12-17');
  assert.ok(!JSON.stringify(parts).includes('free text'));
  assert.ok(!JSON.stringify(parts).includes('"points"')); // raw bars are not passed on
});

test('one failing part leaves the others', async () => {
  const { call } = fakeCall({ what_moved: () => { throw new Error('down'); } });
  const { parts, status } = await fetchIndexExtras({ call, now: NOW });
  assert.deepEqual(status, { ok: true, failed: ['breadth'] });
  assert.equal(parts.breadth, undefined);
  assert.ok(parts.flows && parts.macro && parts.events && parts.history.EGX30);
});

test('odd data counts as that part failing', async () => {
  const { call } = fakeCall({
    index_history: (a) => (a.index === 'EGX100EWI' && a.interval === 'week' ? { points: [] } : ANSWERS.index_history(a)),
    investor_flows: () => ({}),
  });
  const { parts, status } = await fetchIndexExtras({ call, now: NOW });
  assert.deepEqual(status.failed, ['history:EGX100:W', 'flows']);
  assert.ok(parts.history.EGX100.levels.every((l) => l.tf === 'D'));
  assert.ok(parts.history.EGX100.structure);
});

test('too few clean bars fails that series', async () => {
  const { call } = fakeCall({ index_history: (a) => ({ points: zigzag(a.interval === 'day' ? 59 : 25, '2026-01-01', 1) }) });
  const { parts, status } = await fetchIndexExtras({ call, now: NOW });
  assert.deepEqual(status.failed, PART_NAMES.slice(0, 6));
  assert.equal(parts.history, undefined);
});

test('cleanBars sorts, de-duplicates by date (last wins) and drops bad bars (Review Focus 2)', () => {
  const b = (date, c) => ({ date, open: c, high: c + 1, low: c - 0.5, close: c });
  const out = cleanBars([b('2026-11-03', 3), b('2026-11-01', 1), b('2026-11-02', 2), b('2026-11-02', 22),
    { date: '2026-11-04', open: 4, high: 'x', low: 3, close: 4 }, { date: 'soon', open: 1, high: 2, low: 0, close: 1 }, null]);
  assert.deepEqual(out.map((x) => [x.date, x.close]), [['2026-11-01', 1], ['2026-11-02', 22], ['2026-11-03', 3]]);
  assert.deepEqual(cleanBars(undefined), []);
});

test('cleanBars keeps close-only bars (ESTHMR\'s own daily record since 28 Sep 2026) as high = low = close', () => {
  const out = cleanBars([
    { date: '2026-09-27', open: 10, high: 11, low: 9, close: 10 },
    { date: '2026-09-28', close: 12 },
    { date: '2026-09-29', open: null, high: null, low: null, close: 13 },
    { date: '2026-09-30' },
  ]);
  assert.deepEqual(out, [
    { date: '2026-09-27', open: 10, high: 11, low: 9, close: 10 },
    { date: '2026-09-28', open: 12, high: 12, low: 12, close: 12 },
    { date: '2026-09-29', open: 13, high: 13, low: 13, close: 13 },
  ]);
});

test('recent close-only daily bars still produce swings and structure', async () => {
  const closeOnlyFrom = 50; // the last 30 of 80 daily bars carry only a close, like the live answer
  const { call } = fakeCall({
    index_history: (a) => ({
      points: a.interval === 'day'
        ? zigzag(80, '2026-07-01', 1).map((p, i) => (i >= closeOnlyFrom ? { date: p.date, close: p.close } : p))
        : zigzag(40, '2026-01-01', 7),
    }),
  });
  const { parts, status } = await fetchIndexExtras({ call, now: NOW });
  assert.deepEqual(status.failed, []);
  const lastHigh = parts.history.EGX30.structure.highs.at(-1).date;
  assert.ok(lastHigh >= addDays('2026-07-01', closeOnlyFrom), lastHigh);
});

test('cleanBars drops impossible bars: low above high, zero or negative prices', () => {
  const out = cleanBars([
    { date: '2026-11-01', open: 10, high: 11, low: 9, close: 10 },
    { date: '2026-11-02', open: 10, high: 9, low: 11, close: 10 },
    { date: '2026-11-03', open: 0, high: 0, low: 0, close: 0 },
    { date: '2026-11-04', open: 10, high: 11, low: 0, close: 10 },
    { date: '2026-11-05', open: 10, high: 11, low: -1, close: 10 },
  ]);
  assert.deepEqual(out.map((b) => b.date), ['2026-11-01']);
});

test('ESTHMR off: every part fails, ok is false, parts are empty', async () => {
  const call = async () => { throw new EsthmrOff('ESTHMR is not signed in'); };
  const { parts, status } = await fetchIndexExtras({ call, now: NOW });
  assert.deepEqual(status, { ok: false, failed: PART_NAMES });
  assert.deepEqual(parts, {});
});

test('a part still running at the budget counts as failed', async () => {
  const { call } = fakeCall({ investor_flows: () => new Promise(() => {}) });
  const t0 = Date.now();
  const { parts, status } = await fetchIndexExtras({ call, now: NOW, budgetMs: 50 });
  assert.ok(Date.now() - t0 < 500);
  assert.deepEqual(status.failed, ['flows']);
  assert.ok(parts.breadth);
});

test('every call gets a stop signal that fires at the budget, so late calls never start', async () => {
  const signals = [];
  const call = (name, args, opts) => {
    signals.push(opts?.signal);
    return name === 'investor_flows' ? new Promise(() => {}) : ANSWERS[name](args);
  };
  const { status } = await fetchIndexExtras({ call, now: NOW, budgetMs: 50 });
  assert.deepEqual(status.failed, ['flows']);
  assert.equal(signals.length, 10);
  assert.ok(signals.every((s) => s instanceof AbortSignal && s.aborted));
});

test('the stop signal also fires when everything finished in time', async () => {
  let signal;
  const { call } = fakeCall();
  await fetchIndexExtras({ call: (n, a, o) => { signal = o?.signal; return call(n, a); }, now: NOW });
  assert.equal(signal?.aborted, true);
});

test('never rejects, even when call throws synchronously', async () => {
  const call = () => { throw new Error('sync'); };
  const { status } = await fetchIndexExtras({ call, now: NOW });
  assert.equal(status.ok, false);
});
