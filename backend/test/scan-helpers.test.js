import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRuns } from '../services/scanHistoryStore.js';
import { deterministicRank } from '../routes/scan.js';

test('summarizeRuns defaults legacy runs to market mode', () => {
  const [s] = summarizeRuns([{ id: '1', timestamp: 't', opportunities: [{}, {}] }]);
  assert.equal(s.mode, 'market');
  assert.equal(s.watchlist_count, 0);
  assert.equal(s.count, 2);
});

test('summarizeRuns preserves watchlist mode and counts the tickers', () => {
  const [s] = summarizeRuns([
    { id: '2', timestamp: 't', mode: 'watchlist', watchlist_tickers: ['COMI', 'SWDY'], opportunities: [] },
  ]);
  assert.equal(s.mode, 'watchlist');
  assert.equal(s.watchlist_count, 2);
});

test('deterministicRank caps to 8 by default but honours a larger cap', () => {
  const cands = Array.from({ length: 12 }, (_, i) => ({ ticker: `T${i}`, stock_score: i, suggested: {} }));
  assert.equal(deterministicRank(cands).length, 8);
  assert.equal(deterministicRank(cands, cands.length).length, 12);
});
