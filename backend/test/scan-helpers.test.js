import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRuns } from '../services/scanHistoryStore.js';
import { deterministicRank, aiFailureReason } from '../routes/scan.js';

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

test('aiFailureReason turns an expired Claude login into an actionable hint', () => {
  // the exact rejection runClaude produced on 2026-09-12 when the CLI login had lapsed
  const r = aiFailureReason(new Error('claude reported error: Not logged in · Please run /login'));
  assert.match(r, /not logged in/i);
  assert.match(r, /\/login/);
});

test('aiFailureReason names timeouts, a missing CLI, and unreadable output', () => {
  assert.match(aiFailureReason(new Error('claude analysis timed out')), /timed out/i);
  assert.match(aiFailureReason(new Error('spawn claude failed: spawn claude ENOENT')), /not found/i);
  assert.match(aiFailureReason(new Error('no JSON found in model output')), /unreadable/i);
  assert.match(aiFailureReason(new Error('empty AI result')), /unreadable/i);
});

test('aiFailureReason passes an unrecognised error through, trimmed', () => {
  assert.equal(aiFailureReason(new Error('claude exit 1: boom')), 'claude exit 1: boom');
  assert.ok(aiFailureReason(new Error('x'.repeat(500))).length <= 160);
  assert.equal(aiFailureReason(undefined), 'unknown AI error');
});

test('deterministicRank carries the failure reason into each thesis', () => {
  const cands = [{ ticker: 'A', stock_score: 1, suggested: {} }];
  assert.match(deterministicRank(cands, 8, 'Claude CLI not logged in')[0].thesis, /Claude CLI not logged in/);
  // no reason given: the thesis stays exactly what it was
  assert.equal(deterministicRank(cands)[0].thesis, '(deterministic ranking — AI analysis unavailable)');
});
