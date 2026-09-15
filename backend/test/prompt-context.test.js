import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portfolioPrompt, opportunityPrompt, goldPrompt } from '../services/analystService.js';

const regime = { regime: 'Risk-Off', summary: 'weak breadth', as_of: '2026-08-16T10:00:00Z', stale: false };
const news = { COMI: [{ headline: 'CIB posts record profit', age: '2h' }] };

test('portfolioPrompt injects news, regime, prior_ai, vs_prior schema', () => {
  const positions = [{ ticker: 'COMI', avg_cost: 50, shares: 100, live_price: 52, stop_loss: 48,
    t1_price: 55, t2_price: 60, ai: { recommendation: 'HOLD', thesis: 'prior thesis', analyzed_at: 'x' } }];
  const p = portfolioPrompt(positions, 'STRAT', { news, regime });
  assert.match(p, /CIB posts record profit/);
  assert.match(p, /MARKET REGIME/);
  assert.match(p, /Risk-Off/);
  assert.match(p, /prior thesis/);
  assert.match(p, /vs_prior/);
});

test('portfolioPrompt marks regime unknown when null or stale', () => {
  const positions = [{ ticker: 'X', avg_cost: 1, shares: 1, live_price: 1 }];
  assert.match(portfolioPrompt(positions, 'S', { regime: null }), /Unknown \(Indices not refreshed/);
  assert.match(portfolioPrompt(positions, 'S', { regime: { ...regime, stale: true } }), /Unknown \(Indices not refreshed/);
});

test('opportunityPrompt injects candidate news + regime', () => {
  const cands = [{ ticker: 'COMI', indicators: {}, suggested: {} }];
  const p = opportunityPrompt(cands, {}, [], 'S', 'market', { news, regime });
  assert.match(p, /CIB posts record profit/);
  assert.match(p, /Risk-Off/);
});

test('portfolioPrompt requires the thesis to cite the SUGGESTED (not stored) levels', () => {
  const positions = [{ ticker: 'X', avg_cost: 1, shares: 1, live_price: 1 }];
  const p = portfolioPrompt(positions, 'S', {});
  assert.match(p, /LEVEL CONSISTENCY/);
  assert.match(p, /levels you are SUGGESTING/);
});

test('portfolioPrompt includes BOOK STATS + book schema when book_stats given', () => {
  const positions = [{ ticker: 'A', avg_cost: 10, shares: 100, live_price: 11 }];
  const p = portfolioPrompt(positions, 'S', { book_stats: { open_risk_egp: 100, unprotected: ['C'] } });
  assert.match(p, /BOOK STATS/);
  assert.match(p, /open_risk_egp/);
  assert.match(p, /"book"/);
});

test('goldPrompt injects dxy/us10y + macro news + prior_ai', () => {
  const snap = { indicators: { price: 3400 }, mtf: null, usd_egp: 50, gc_usd: 3402, dxy: { price: 99.6 }, us10y: { price: 4.7 } };
  const p = goldPrompt(snap, null, 'S', { news: [{ headline: 'Fed holds', age: '1h' }], prior_ai: { recommendation: 'WAIT', thesis: 'prior gold' } });
  assert.match(p, /Fed holds/);
  assert.match(p, /99.6/);
  assert.match(p, /prior gold/);
});

test('portfolioPrompt includes bracket lots + BRACKET rule for a bracketed position', () => {
  const positions = [{
    ticker: 'WKOL', avg_cost: 328, shares: 7, live_price: 326, stop_loss: 296.5, t1_price: 347, t2_price: 369.2,
    brackets: { entry_price: 328, lots: [
      { id: 'A', target: 'T1', shares: 8, tp_price: 347, stop: 296.5, tp_hit: true, stopped: false, stop_raised: false, exit_price: 347, exit_date: 'd' },
      { id: 'B', target: 'T2', shares: 7, tp_price: 369.2, stop: 296.5, tp_hit: false, stopped: false, stop_raised: false, exit_price: null, exit_date: null },
    ] },
  }];
  const p = portfolioPrompt(positions, 'S', {});
  assert.match(p, /"brackets"/);
  assert.match(p, /BRACKET/);
  assert.match(p, /runner lot/i);
});

test('opportunityPrompt asks for a per-stock split', () => {
  const p = opportunityPrompt([{ ticker: 'X', indicators: {}, suggested: {} }], {}, [], 'S', 'market', {});
  assert.match(p, /"split"/);
  assert.match(p, /split_reason/);
});

test('portfolioPrompt carries ATR, the stop rules and prior_ai.stop_guard (v2.4.0)', () => {
  const positions = [{ ticker: 'SPIN', avg_cost: 19.16, shares: 550, live_price: 19.71, stop_loss: 17.6,
    t1_price: 20.79, t2_price: 22.6, indicators: { price: 19.71, atr: 0.95, atr_pct: 4.82 },
    ai: { recommendation: 'HOLD', stop_guard: { suggested: 18.4, reason: 'below your 19.16 entry before T1' } } }];
  const p = portfolioPrompt(positions, 'S', {});
  assert.match(p, /"atr": 0\.95/);
  assert.match(p, /within 1\.5x ATR/);
  assert.match(p, /Never lower an existing stop/);
  assert.match(p, /break-even \(avg_cost\) or higher/);
  assert.match(p, /exceed the previous swing high/);
  assert.match(p, /below your 19\.16 entry before T1/);
});

test('opportunityPrompt tells the AI to keep stops at least 1.5x ATR below entry (v2.4.0)', () => {
  const cands = [{ ticker: 'SPIN', indicators: { atr: 0.95, atr_pct: 4.96 }, suggested: {} }];
  const p = opportunityPrompt(cands, {}, [], 'S', 'market', {});
  assert.match(p, /"atr": 0\.95/);
  assert.match(p, /at least 1\.5x ATR below the entry/);
});
