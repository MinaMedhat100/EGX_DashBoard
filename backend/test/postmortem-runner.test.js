import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPostmortemRunner } from '../services/postmortemRunner.js';

const NOW = new Date('2026-10-20T10:00:00Z');
function series(n, start = '2026-08-01') {
  const t0 = Date.parse(start);
  return Array.from({ length: n }, (_, k) => ({ date: new Date(t0 + k * 86400000).toISOString().slice(0, 10), open: 10, high: 10.5, low: 9.5, close: 10 }));
}
const closed = (id, { exitDate = '2026-09-21', orderAt = '2026-10-01T10:00:00Z', pm } = {}) => ({
  trade_id: id, ticker: id.split('-')[0], status: 'closed', opened_at: '2026-09-10',
  entry: { price: 10, levels_known: true, stop: 9.5, t1: 11, t2: 12 },
  events: [{ kind: 'order', type: 'STOP_OUT', date: exitDate, at: orderAt, price: 9.5 }],
  exit: { date: exitDate, price: 9.5, type: 'STOP-OUT' }, ...(pm ? { postmortem: pm } : {}),
});

function harness(trades, { barsFor = () => ({ bars: series(80) }), analyze } = {}) {
  const journal = { version: 1, trades };
  const calls = [];
  const deps = {
    load: async () => structuredClone(journal),
    record: async (apply) => { apply(journal); return null; },
    bars: { getBars: async (t) => barsFor(t) },
    basketTickers: [],
    strategy: async () => 'STRAT',
    analyze: analyze ?? (async ({ trade }) => { calls.push(trade.trade_id); return { result: { verdict: 'normal_variance' }, cost_usd: 0.1, model: 'm' }; }),
    now: () => NOW,
  };
  return { journal, calls, runner: createPostmortemRunner(deps) };
}

test('runTrade: done → stores evidence, result, cost, runs', async () => {
  const { journal, runner } = harness([closed('BRKT-1')]);
  const r = await runner.runTrade('BRKT-1', { manual: true });
  assert.equal(r.status, 200);
  const pm = journal.trades[0].postmortem;
  assert.equal(pm.status, 'done');
  assert.equal(pm.runs, 1);
  assert.equal(pm.cost_usd, 0.1);
  assert.equal(pm.result.verdict, 'normal_variance');
  assert.ok(pm.evidence.entry);
});

test('runTrade: 404 unknown, 409 open trade, 409 not ready with due date', async () => {
  const short = harness([closed('BRKT-1'), { trade_id: 'CLSC-1', status: 'open', events: [] }], { barsFor: () => ({ bars: series(55) }) });
  assert.equal((await short.runner.runTrade('NOPE', { manual: true })).status, 404);
  assert.equal((await short.runner.runTrade('CLSC-1', { manual: true })).status, 409);
  const r = await short.runner.runTrade('BRKT-1', { manual: true }); // bars end 09-24: 3 sessions after 09-21
  assert.equal(r.status, 409);
  assert.equal(r.due_estimate, '2026-10-05');
  assert.equal(short.journal.trades[0].postmortem.status, 'waiting');
});

test('runTrade: no Yahoo history → manual runs anyway, auto marks no_bars', async () => {
  const h = harness([closed('BRKT-1'), closed('CLSC-1')], { barsFor: () => ({ none: true }) });
  assert.equal((await h.runner.runTrade('BRKT-1', { manual: true })).status, 200);
  await h.runner.runTrade('CLSC-1', { manual: false });
  assert.equal(h.journal.trades[1].postmortem.status, 'no_bars');
});

test('runTrade: AI failure → failed, attempts+1, error kept', async () => {
  const h = harness([closed('BRKT-1')], { analyze: async () => { throw new Error('boom'); } });
  const r = await h.runner.runTrade('BRKT-1', { manual: false });
  assert.equal(r.status, 502);
  assert.equal(h.journal.trades[0].postmortem.status, 'failed');
  assert.equal(h.journal.trades[0].postmortem.attempts, 1);
  assert.match(h.journal.trades[0].postmortem.error, /boom/);
});

test('runTrade: a fresh running status blocks; a stale one does not', async () => {
  const fresh = harness([closed('BRKT-1', { pm: { status: 'running', started_at: '2026-10-20T09:55:00Z' } })]);
  assert.equal((await fresh.runner.runTrade('BRKT-1', { manual: true })).status, 409);
  const stale = harness([closed('BRKT-1', { pm: { status: 'running', started_at: '2026-10-20T09:00:00Z' } })]);
  assert.equal((await stale.runner.runTrade('BRKT-1', { manual: true })).status, 200);
});

test('tick: only auto-eligible trades, at most 3 AI runs, failed retried while attempts < 2', async () => {
  const trades = [
    closed('A-1'), closed('B-1'), closed('C-1'), closed('D-1'),
    closed('OLD-1', { exitDate: '2026-06-14', orderAt: '2026-06-14T12:00:00Z' }),          // rebuilt → never auto
    closed('DONE-1', { pm: { status: 'done' } }),
    closed('F1-1', { pm: { status: 'failed', attempts: 1 } }),
    closed('F2-1', { pm: { status: 'failed', attempts: 2 } }),
  ];
  const h = harness(trades);
  const r = await h.runner.tick();
  assert.equal(r.ran, 3);
  assert.deepEqual(h.calls, ['A-1', 'B-1', 'C-1']);
  await h.runner.tick();
  assert.deepEqual(h.calls, ['A-1', 'B-1', 'C-1', 'D-1', 'F1-1']);
});

test('tick: a Yahoo network error leaves the trade for the next check', async () => {
  const h = harness([closed('A-1')], { barsFor: () => { throw new Error('ECONNRESET'); } });
  const r = await h.runner.tick();
  assert.equal(r.ran, 0);
  assert.equal(h.journal.trades[0].postmortem, undefined);
});

test('tick: never overlaps itself', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const h = harness([closed('A-1')], { analyze: async () => { await gate; return { result: { verdict: 'good_process' }, cost_usd: 0, model: 'm' }; } });
  const first = h.runner.tick();
  const second = await h.runner.tick();
  assert.deepEqual(second, { ran: 0, checked: 0, skipped: 'busy' });
  release();
  await first;
});
