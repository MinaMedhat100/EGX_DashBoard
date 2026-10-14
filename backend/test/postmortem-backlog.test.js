import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPostmortemRunner, backlogCandidates } from '../services/postmortemRunner.js';

function series(n, start = '2026-05-01') {
  const t0 = Date.parse(start);
  return Array.from({ length: n }, (_, k) => ({ date: new Date(t0 + k * 86400000).toISOString().slice(0, 10), open: 10, high: 10.5, low: 9.5, close: 10 }));
}
const rebuilt = (id, pm) => ({
  trade_id: id, ticker: id.split('-')[0], status: 'closed', opened_at: '2026-06-01',
  entry: { price: 10, levels_known: false }, events: [{ kind: 'order', type: 'SELL', date: '2026-06-10', at: '2026-06-10T12:00:00.000Z', price: 11 }],
  exit: { date: '2026-06-10', price: 11, type: 'SELL', realized_pnl: 10 }, ...(pm ? { postmortem: pm } : {}),
});
const live = (id) => ({ ...rebuilt(id), events: [{ kind: 'order', type: 'SELL', date: '2026-10-01', at: '2026-10-01T12:00:00.000Z', price: 11 }], exit: { date: '2026-10-01', price: 11, type: 'SELL' } });

function harness(trades, analyze) {
  const journal = { version: 1, trades };
  const calls = [];
  const runner = createPostmortemRunner({
    load: async () => structuredClone(journal),
    record: async (apply) => { apply(journal); return null; },
    bars: { getBars: async () => ({ bars: series(200) }) },
    basketTickers: [], strategy: async () => 'S', now: () => new Date('2026-10-14T10:00:00Z'),
    analyze: analyze ?? (async ({ trade }) => { calls.push(trade.trade_id); return { result: { verdict: 'good_process' }, cost_usd: 0.1, model: 'm' }; }),
  });
  return { journal, calls, runner };
}

test('backlogCandidates: rebuilt trades with no review or a failed one; never live or done', () => {
  const j = { trades: [rebuilt('A-1'), rebuilt('B-1', { status: 'failed' }), rebuilt('C-1', { status: 'done' }), live('D-1'), { trade_id: 'O', status: 'open', events: [] }] };
  assert.deepEqual(backlogCandidates(j), ['A-1', 'B-1']);
});

test('runBacklog runs them one at a time and reports progress', async () => {
  const h = harness([rebuilt('A-1'), rebuilt('B-1'), rebuilt('C-1', { status: 'done' })]);
  const r = await h.runner.runBacklog();
  assert.deepEqual([r.status, r.started, r.total], [200, true, 2]);
  await r.job;
  assert.deepEqual(h.calls, ['A-1', 'B-1']);
  const s = h.runner.backlogState();
  assert.deepEqual([s.running, s.done, s.skipped, s.error], [false, 2, 0, null]);
});

test('runBacklog stops at the first Claude error and keeps the reason', async () => {
  let n = 0;
  const h = harness([rebuilt('A-1'), rebuilt('B-1'), rebuilt('C-1')], async () => {
    n++;
    if (n === 2) throw new Error('claude exit 1: Claude AI usage limit reached');
    return { result: { verdict: 'good_process' }, cost_usd: 0.1, model: 'm' };
  });
  const r = await h.runner.runBacklog();
  await r.job;
  const s = h.runner.backlogState();
  assert.equal(s.done, 1);
  assert.equal(s.failed_on, 'B-1');
  assert.match(s.error, /usage limit/);
  assert.equal(n, 2); // C-1 never tried
});

test('runBacklog: nothing to do, and no second start while running', async () => {
  const empty = harness([rebuilt('A-1', { status: 'done' })]);
  assert.deepEqual(await empty.runner.runBacklog(), { status: 200, started: false, total: 0 });
  let release;
  const gate = new Promise((res) => { release = res; });
  const h = harness([rebuilt('A-1')], async () => { await gate; return { result: { verdict: 'good_process' }, cost_usd: 0, model: 'm' }; });
  const first = await h.runner.runBacklog();
  assert.equal((await h.runner.runBacklog()).status, 409);
  release();
  await first.job;
});
