import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOrder } from '../services/orderService.js';
import { normalize } from '../services/portfolioStore.js';

function emptyData() {
  return { positions: [], action_log: [], exited_positions: [], realized_pnl: 0 };
}

test('BUY_NEW creates a pending position with zeroed levels', () => {
  const data = emptyData();
  applyOrder(data, { type: 'BUY_NEW', ticker: 'sdti', shares: 100, price: 12.5, date: '2026-06-22' });
  const p = data.positions[0];
  assert.equal(p.ticker, 'SDTI');
  assert.equal(p.levels_source, 'pending');
  assert.equal(p.stop_loss, 0);
  assert.equal(p.t1_price, 0);
  assert.equal(p.t2_price, 0);
});

test('normalize defaults legacy positions to manual', () => {
  const data = { positions: [{ ticker: 'CANA', stop_loss: 38, t1_price: 41, t2_price: 45 }] };
  normalize(data);
  assert.equal(data.positions[0].levels_source, 'manual');
});

test('normalize leaves an explicit levels_source untouched', () => {
  const data = { positions: [{ ticker: 'X', levels_source: 'pending' }] };
  normalize(data);
  assert.equal(data.positions[0].levels_source, 'pending');
});
