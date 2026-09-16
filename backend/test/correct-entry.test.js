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

// correctEntry predates brackets (v1.5.4 vs v2.0.0): correcting a bracketed entry used to leave
// brackets.entry_price at the wrong price while avg_cost moved — the same desync v2.0.1 guarded
// BUY_ADD against. Neutral fixture: a bracket logged at 10.20 that really filled at 9.80.
function bracketData() {
  return {
    positions: [{
      ticker: 'BRKT', avg_cost: 10.2, shares: 1000, live_price: 9.8,
      stop_loss: 9.5, t1_price: 10.6, t2_price: 11.2,
      unrealized_pnl: -400, unrealized_pct: -3.92,
      position_label: '1000sh bracket — entered 2026-09-16 @ 10.2',
      brackets: {
        entry_price: 10.2,
        lots: [
          { id: 'A', target: 'T1', shares: 400, tp_price: 10.6, stop: 9.5, tp_hit: false, stopped: false, stop_raised: false, exit_price: null, exit_date: null },
          { id: 'B', target: 'T2', shares: 600, tp_price: 11.2, stop: 9.5, tp_hit: false, stopped: false, stop_raised: false, exit_price: null, exit_date: null },
        ],
      },
    }],
    action_log: [], exited_positions: [], realized_pnl: 0,
  };
}

test('correctEntry moves a bracket entry_price with avg_cost and keeps the lots in sync', () => {
  const d = bracketData();
  const { toasts } = correctEntry(d, { ticker: 'brkt', shares: 1000, avg_cost: 9.8, date: '2026-09-16' });
  const p = d.positions[0];
  assert.equal(p.avg_cost, 9.8);
  assert.equal(p.brackets.entry_price, 9.8); // the desync this test exists to prevent
  assert.equal(p.shares, 1000); // still the sum of the open lots
  assert.equal(p.unrealized_pnl, 0); // live 9.80 == corrected cost
  assert.equal(p.unrealized_pct, 0);
  assert.match(p.position_label, /bracket/); // a bracket stays labelled as one
  assert.match(p.position_label, /9\.8/);
  assert.equal(d.action_log[0].type, 'CORRECT');
  assert.match(d.action_log[0].notes, /from 1000sh @ 10\.2/);
  assert.match(toasts[0], /BRKT: entry corrected to 1000sh @ 9\.8/);
});

test('correctEntry on a bracket derives shares from the lots, ignoring a mismatched count', () => {
  const d = bracketData();
  // a caller passing the wrong total must not be able to desync the lots
  correctEntry(d, { ticker: 'BRKT', shares: 999, avg_cost: 9.8, date: '2026-09-16' });
  const p = d.positions[0];
  assert.equal(p.shares, 1000);
  assert.equal(p.brackets.lots[0].shares, 400);
  assert.equal(p.brackets.lots[1].shares, 600);
});
