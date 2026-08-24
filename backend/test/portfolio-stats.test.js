import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portfolioStats } from '../services/portfolioStats.js';
import { makeBracket, syncBracketSummary, settleLot, raiseLotStop } from '../services/bracketService.js';

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

test('open risk sums per-lot once Lot B stop is raised to break-even', () => {
  const pos = { ticker: 'WKOL', avg_cost: 328, is_liquid: true, unrealized_pnl: 0, brackets: makeBracket(328, 15, 50, 296.5, 347, 369.2) };
  settleLot(pos, 'A', { kind: 'tp', price: 347, date: 'd' }, 328); // Lot A gone
  raiseLotStop(pos, 'B', 328);                                     // Lot B at break-even
  const s = portfolioStats([pos]);
  assert.equal(s.open_risk_egp, 0); // (328-328)*7
  assert.deepEqual(s.unprotected, []);
});
