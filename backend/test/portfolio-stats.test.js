import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portfolioStats } from '../services/portfolioStats.js';

test('portfolioStats aggregates open risk, unprotected, largest', () => {
  const s = portfolioStats([
    { ticker: 'A', avg_cost: 10, shares: 100, stop_loss: 9, is_liquid: true, unrealized_pnl: 50 },
    { ticker: 'B', avg_cost: 20, shares: 50, stop_loss: 21, is_liquid: true, unrealized_pnl: -20 },
    { ticker: 'C', avg_cost: 5, shares: 400, stop_loss: 0, is_liquid: true, unrealized_pnl: 10 },
    { ticker: 'D', avg_cost: 100, shares: 10, stop_loss: 90, is_liquid: false, unrealized_pnl: 0 },
  ]);
  assert.equal(s.invested, 5000);
  assert.equal(s.unrealized, 40);
  assert.equal(s.open_risk_egp, 100); // A only; B protected (stop>cost); C no stop; D illiquid
  assert.deepEqual(s.unprotected, ['C']);
  assert.deepEqual(s.largest, { ticker: 'C', exposure: 2000, pct: 40 });
  assert.equal(s.count, 4);
});

test('portfolioStats handles empty book', () => {
  const s = portfolioStats([]);
  assert.equal(s.invested, 0);
  assert.equal(s.open_risk_egp, 0);
  assert.deepEqual(s.unprotected, []);
  assert.equal(s.largest, null);
  assert.equal(s.count, 0);
});
