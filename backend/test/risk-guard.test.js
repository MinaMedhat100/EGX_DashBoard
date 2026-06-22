import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riskR } from '../services/analystService.js';

test('riskR is null when there is no real stop (pending position)', () => {
  assert.equal(riskR({ avg_cost: 12, stop_loss: 0, live_price: 13, t1_price: 0, t2_price: 0 }), null);
});

test('riskR computes when a real stop exists', () => {
  const r = riskR({ avg_cost: 12, stop_loss: 11, live_price: 13, t1_price: 14, t2_price: 16 });
  assert.equal(r.one_R_egp, 1);
  assert.equal(r.live_R, 1);
  assert.equal(r.t1_R, 2);
});
