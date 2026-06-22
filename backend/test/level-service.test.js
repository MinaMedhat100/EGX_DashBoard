import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAiLevels, commitLevels, recomputeDerived } from '../services/levelService.js';

test('applyAiLevels adopts AI levels for a pending position', () => {
  const pos = { levels_source: 'pending', stop_loss: 0, t1_price: 0, t2_price: 0,
    ai: { suggested_stop: 11.2, suggested_t1: 14, suggested_t2: 16.5 } };
  const r = applyAiLevels(pos);
  assert.equal(r.applied, true);
  assert.equal(pos.stop_loss, 11.2);
  assert.equal(pos.t1_price, 14);
  assert.equal(pos.t2_price, 16.5);
  assert.equal(pos.levels_source, 'ai');
});

test('applyAiLevels proposes (no mutation) for an existing position', () => {
  const pos = { levels_source: 'manual', stop_loss: 38, t1_price: 41, t2_price: 45,
    ai: { suggested_stop: 37.2, suggested_t1: 42.5, suggested_t2: 47 } };
  const r = applyAiLevels(pos);
  assert.equal(r.applied, false);
  assert.deepEqual(r.proposal, { stop: 37.2, t1: 42.5, t2: 47 });
  assert.equal(pos.stop_loss, 38); // unchanged
  assert.equal(pos.levels_source, 'manual'); // unchanged
});

test('commitLevels sets levels and marks manual', () => {
  const pos = { levels_source: 'ai', stop_loss: 0, t1_price: 0, t2_price: 0 };
  commitLevels(pos, { stop: 10, t1: 12, t2: 14 });
  assert.equal(pos.stop_loss, 10);
  assert.equal(pos.t1_price, 12);
  assert.equal(pos.t2_price, 14);
  assert.equal(pos.levels_source, 'manual');
});

test('recomputeDerived computes P&L and status from indicators', () => {
  const pos = { live_price: 13, avg_cost: 12, shares: 100, stop_loss: 11, t1_price: 14,
    indicators: { price: 13, adx: 45, plus_di: 30, minus_di: 18 } };
  recomputeDerived(pos);
  assert.equal(pos.unrealized_pnl, 100);
  assert.equal(pos.unrealized_pct, 8.33);
  assert.equal(pos.status_key, 'yellow'); // ADX>=40, +DI>-DI, not near T1
});
