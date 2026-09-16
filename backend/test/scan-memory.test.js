import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priorReads, PRIOR_THESIS_MAX } from '../services/scanHistoryStore.js';

const NOW = new Date('2026-08-28T23:39:00Z');
const run = (ts, mode, opportunities) => ({ id: ts, timestamp: ts, mode, opportunities });

// ALUM's real August cards, newest first — exactly how appendRun stores them.
const RUNS = [
  run('2026-08-25T23:44:00Z', 'market', [
    {
      ticker: 'ALUM', score: 80, conviction: 4, adx: 40.93, plus_di: 39.2, minus_di: 11.11,
      rsi: 69.1, price: 29.38, entry_zone: [27.6, 29.4], stop: 26.4, t1: 30.95, t2: 34,
      thesis: 'x'.repeat(300),
    },
    { ticker: 'SPIN', score: 70, conviction: 3 },
  ]),
  run('2026-08-25T00:56:00Z', 'market', [
    { ticker: 'ALUM', score: 88, conviction: 4, price: 28.93, entry_zone: [27.2, 28.4], stop: 26.2 },
  ]),
  run('2026-08-20T10:00:00Z', 'watchlist', [{ ticker: 'ALUM', score: 60, conviction: 2 }]),
];

test('priorReads returns the most recent earlier read and counts every appearance', () => {
  const out = priorReads(RUNS, ['alum'], NOW);
  assert.equal(out.ALUM.score, 80); // the newest run wins, not the older 88
  assert.equal(out.ALUM.conviction, 4);
  assert.equal(out.ALUM.plus_di, 39.2);
  assert.equal(out.ALUM.price, 29.38);
  assert.deepEqual(out.ALUM.entry_zone, [27.6, 29.4]);
  assert.equal(out.ALUM.mode, 'market');
  assert.equal(out.ALUM.days_ago, 2); // 25th 23:44 -> 28th 23:39 is 2 whole days
  assert.equal(out.ALUM.seen_count, 3); // both scan modes count as a prior read
});

test('priorReads truncates the thesis to PRIOR_THESIS_MAX', () => {
  assert.equal(PRIOR_THESIS_MAX, 200);
  assert.equal(priorReads(RUNS, ['ALUM'], NOW).ALUM.thesis.length, PRIOR_THESIS_MAX);
});

test('priorReads returns null for an unseen ticker and only the tickers asked for', () => {
  const out = priorReads(RUNS, ['ALUM', 'NEWCO'], NOW);
  assert.equal(out.NEWCO, null);
  assert.deepEqual(Object.keys(out).sort(), ['ALUM', 'NEWCO']);
});

test('priorReads survives empty history, missing fields and bad timestamps', () => {
  assert.deepEqual(priorReads([], ['ALUM'], NOW), { ALUM: null });
  assert.deepEqual(priorReads(null, [], NOW), {});
  const bad = priorReads([run('not-a-date', 'market', [{ ticker: 'ALUM', score: 1 }])], ['ALUM'], NOW);
  assert.equal(bad.ALUM.days_ago, null);
  assert.equal(bad.ALUM.score, 1);
  assert.equal(bad.ALUM.price, null); // runs saved before v2.5.0 carry no price
  assert.equal(bad.ALUM.thesis, '');
});
