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
  const b = (date, c) => ({ date, open: c, high: c + 1, low: c - 1, close: c });
  const out = cleanBars([b('2026-11-03', 3), b('2026-11-01', 1), b('2026-11-02', 2), b('2026-11-02', 22),
    { date: '2026-11-04', open: 4, high: 'x', low: 3, close: 4 }, { date: 'soon', open: 1, high: 2, low: 0, close: 1 }, null]);
  assert.deepEqual(out.map((x) => [x.date, x.close]), [['2026-11-01', 1], ['2026-11-02', 22], ['2026-11-03', 3]]);
  assert.deepEqual(cleanBars(undefined), []);
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

test('never rejects, even when call throws synchronously', async () => {
  const call = () => { throw new Error('sync'); };
  const { status } = await fetchIndexExtras({ call, now: NOW });
  assert.equal(status.ok, false);
});
