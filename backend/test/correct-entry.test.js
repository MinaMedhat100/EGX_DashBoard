import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correctEntry } from '../services/orderService.js';

function data() {
  return {
    positions: [{
      ticker: 'CLHO', avg_cost: 540, shares: 270, live_price: 17.63,
      unrealized_pnl: -141039.9, unrealized_pct: -96.74, position_label: '270sh @ 540',
    }],
    action_log: [], exited_positions: [], realized_pnl: 0,
  };
}

test('correctEntry overrides shares+avg_cost, recomputes P&L, logs CORRECT', () => {
  const d = data();
  const { toasts } = correctEntry(d, { ticker: 'clho', shares: 540, avg_cost: 18.11, date: '2026-08-07' });
  const p = d.positions[0];
  assert.equal(p.shares, 540);
  assert.equal(p.avg_cost, 18.11);
  assert.equal(p.unrealized_pnl, -259.2);
  assert.equal(p.unrealized_pct, -2.65);
  assert.match(p.position_label, /540sh — corrected 2026-08-07 @ 18.11/);
  const log = d.action_log[0];
  assert.equal(log.type, 'CORRECT');
  assert.equal(log.ticker, 'CLHO');
  assert.equal(log.total_shares, 540);
  assert.match(log.notes, /from 270sh @ 540/);
  assert.match(toasts[0], /CLHO: entry corrected to 540sh @ 18.11/);
});

test('correctEntry rejects non-positive shares', () => {
  assert.throws(() => correctEntry(data(), { ticker: 'CLHO', shares: 0, avg_cost: 18.11, date: 'd' }), /positive/);
});

test('correctEntry rejects non-positive avg_cost', () => {
  assert.throws(() => correctEntry(data(), { ticker: 'CLHO', shares: 540, avg_cost: 0, date: 'd' }), /positive/);
});

test('correctEntry throws for unknown ticker', () => {
  assert.throws(() => correctEntry(data(), { ticker: 'ZZZZ', shares: 10, avg_cost: 5, date: 'd' }), /not found/);
});
