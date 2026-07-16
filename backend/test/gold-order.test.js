import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyGoldState } from '../services/goldStore.js';
import { applyGoldOrder } from '../services/goldOrderService.js';

test('BUY_NEW opens a pending gold position (USD/oz, shares=oz)', () => {
  const s = emptyGoldState();
  applyGoldOrder(s, { type: 'BUY_NEW', shares: 2, price: 4000, date: '2026-07-16' });
  assert.equal(s.position.shares, 2);
  assert.equal(s.position.avg_cost, 4000);
  assert.equal(s.position.levels_source, 'pending');
  assert.equal(s.position.stop_loss, 0);
  assert.equal(s.action_log.length, 1);
});

test('BUY_ADD averages the cost and adds oz', () => {
  const s = emptyGoldState();
  applyGoldOrder(s, { type: 'BUY_NEW', shares: 2, price: 4000, date: '2026-07-16' });
  applyGoldOrder(s, { type: 'BUY_ADD', shares: 2, price: 4200, date: '2026-07-16' });
  assert.equal(s.position.shares, 4);
  assert.equal(s.position.avg_cost, 4100);
});

test('SELL(T1) with break-even marks t1_hit, raises stop, accrues realized USD', () => {
  const s = emptyGoldState();
  applyGoldOrder(s, { type: 'BUY_NEW', shares: 4, price: 4000, date: '2026-07-16' });
  applyGoldOrder(s, { type: 'SELL', shares: 2, price: 4300, target: 'T1', raise_stop_be: true, date: '2026-07-16' });
  assert.equal(s.position.shares, 2);
  assert.equal(s.position.t1_hit, true);
  assert.equal(s.position.stop_loss, 4000); // break-even = avg cost
  assert.equal(s.position.stop_raised, true);
  assert.equal(s.realized_pnl_usd, 600); // (4300-4000)*2
});

test('selling the whole position closes it (position -> null) and keeps realized', () => {
  const s = emptyGoldState();
  applyGoldOrder(s, { type: 'BUY_NEW', shares: 2, price: 4000, date: '2026-07-16' });
  applyGoldOrder(s, { type: 'STOP_OUT', shares: 2, price: 3900, date: '2026-07-16' });
  assert.equal(s.position, null);
  assert.equal(s.realized_pnl_usd, -200);
});

test('SELL with negative shares is rejected and the position is unchanged', () => {
  const s = emptyGoldState();
  applyGoldOrder(s, { type: 'BUY_NEW', shares: 2, price: 4000, date: '2026-07-16' });
  assert.throws(() => applyGoldOrder(s, { type: 'SELL', shares: -3, price: 4200, date: '2026-07-16' }));
  assert.equal(s.position.shares, 2);
});

test('SELL(T2) marks t2_hit', () => {
  const s = emptyGoldState();
  applyGoldOrder(s, { type: 'BUY_NEW', shares: 4, price: 4000, date: '2026-07-16' });
  applyGoldOrder(s, { type: 'SELL', shares: 1, price: 4600, target: 'T2', date: '2026-07-16' });
  assert.equal(s.position.t2_hit, true);
});

test('over-selling clamps to held ounces and closes the position', () => {
  const s = emptyGoldState();
  applyGoldOrder(s, { type: 'BUY_NEW', shares: 2, price: 4000, date: '2026-07-16' });
  applyGoldOrder(s, { type: 'SELL', shares: 5, price: 4300, target: 'T1', date: '2026-07-16' });
  assert.equal(s.position, null);
  assert.equal(s.realized_pnl_usd, 600);
});
