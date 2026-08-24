// backend/test/bracket-order.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOrder } from '../services/orderService.js';

function emptyData() { return { positions: [], action_log: [], exited_positions: [], realized_pnl: 0 }; }

test('BUY_NEW mode=bracket creates a two-lot position with synced mirrors', () => {
  const data = emptyData();
  applyOrder(data, {
    type: 'BUY_NEW', mode: 'bracket', ticker: 'WKOL', shares: 15, price: 328,
    split: 50, stop_loss: 296.5, t1_price: 347, t2_price: 369.2, date: '2026-08-25',
  });
  const p = data.positions[0];
  assert.ok(p.brackets, 'has brackets block');
  assert.deepEqual([p.brackets.lots[0].shares, p.brackets.lots[1].shares], [8, 7]);
  assert.equal(p.shares, 15);
  assert.equal(p.stop_loss, 296.5);
  assert.equal(p.t1_price, 347);
  assert.equal(p.t2_price, 369.2);
  assert.equal(p.avg_cost, 328);
  assert.equal(p.levels_source, 'manual'); // user supplied the levels at entry
  assert.equal(data.action_log[0].type, 'BUY (bracket)');
});

test('classic BUY_NEW is unchanged (no brackets block)', () => {
  const data = emptyData();
  applyOrder(data, { type: 'BUY_NEW', ticker: 'CANA', shares: 100, price: 38, date: 'd' });
  assert.equal(data.positions[0].brackets, undefined);
  assert.equal(data.positions[0].levels_source, 'pending');
});
