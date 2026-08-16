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

test('goldPrompt injects dxy/us10y + macro news + prior_ai', () => {
  const snap = { indicators: { price: 3400 }, mtf: null, usd_egp: 50, gc_usd: 3402, dxy: { price: 99.6 }, us10y: { price: 4.7 } };
  const p = goldPrompt(snap, null, 'S', { news: [{ headline: 'Fed holds', age: '1h' }], prior_ai: { recommendation: 'WAIT', thesis: 'prior gold' } });
  assert.match(p, /Fed holds/);
  assert.match(p, /99.6/);
  assert.match(p, /prior gold/);
});
