import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOrder, correctEntry } from '../services/orderService.js';

function emptyData() { return { positions: [], action_log: [], exited_positions: [], realized_pnl: 0 }; }
function buyBracket(d) {
  return applyOrder(d, {
    type: 'BUY_NEW', mode: 'bracket', ticker: 'BRKT', shares: 1000, price: 10,
    split: 40, stop_loss: 9, t1_price: 11, t2_price: 12, date: '2026-09-01',
  });
}

test('BUY_NEW bracket: position gets a trade_id and the report opens a trade with the logged plan', () => {
  const d = emptyData();
  const { journal } = buyBracket(d);
  const p = d.positions[0];
  assert.match(p.trade_id, /^BRKT-2026-09-01-[a-z0-9]{4}$/);
  assert.equal(journal.trade_id, p.trade_id);
  assert.deepEqual(journal.open.entry, {
    price: 10, shares: 1000, mode: 'bracket', split: 40, stop: 9, t1: 11, t2: 12, levels_known: true,
  });
  assert.deepEqual(journal.events, []);
  assert.equal(journal.exit, null);
});

test('BUY_NEW classic without levels records them as null', () => {
  const d = emptyData();
  const { journal } = applyOrder(d, { type: 'BUY_NEW', ticker: 'CLSC', shares: 100, price: 20, date: '2026-09-01' });
  assert.deepEqual(journal.open.entry, {
    price: 20, shares: 100, mode: 'classic', split: null, stop: null, t1: null, t2: null, levels_known: true,
  });
});

test('bracket SELL Lot A with a break-even raise reports the order and the levels move', () => {
  const d = emptyData();
  buyBracket(d);
  const { journal } = applyOrder(d, { type: 'SELL', ticker: 'BRKT', lot: 'A', price: 11, raise_stop_be: true, date: '2026-09-05' });
  assert.deepEqual(journal.events.map((e) => [e.kind, e.type ?? e.source]), [['order', 'SELL'], ['levels', 'breakeven_at_t1']]);
  assert.equal(journal.events[0].lot, 'A');
  assert.equal(journal.events[0].shares, 400);
  assert.equal(journal.events[0].realized_pnl, 400);
  assert.equal(journal.events[1].from.lots.B.stop, 9);
  assert.equal(journal.events[1].to.lots.B.stop, 10);
  assert.equal(journal.exit, null);
});

test('bracket full stop-out closes the trade and stamps the exit with the trade_id', () => {
  const d = emptyData();
  buyBracket(d);
  const { journal } = applyOrder(d, { type: 'STOP_OUT', ticker: 'BRKT', lot: 'ALL', price: 9, date: '2026-09-10' });
  assert.equal(d.positions.length, 0);
  assert.equal(d.exited_positions[0].trade_id, journal.trade_id);
  assert.deepEqual(journal.events.map((e) => e.lot), ['A', 'B']);
  assert.deepEqual(journal.exit, { date: '2026-09-10', price: 9, type: 'STOP-OUT', realized_pnl: -1000, approximate: false });
});

test('classic add, partial sell with break-even, then full exit — one trade throughout', () => {
  const d = emptyData();
  const buy = applyOrder(d, { type: 'BUY_NEW', ticker: 'CLSC', shares: 100, price: 20, stop_loss: 18, t1_price: 22, t2_price: 24, date: '2026-09-01' }).journal;
  const add = applyOrder(d, { type: 'BUY_ADD', ticker: 'CLSC', shares: 100, price: 22, date: '2026-09-02' }).journal;
  assert.deepEqual(add.events, [{ kind: 'order', type: 'BUY_ADD', lot: null, shares: 100, price: 22, date: '2026-09-02', realized_pnl: null }]);
  const sell = applyOrder(d, { type: 'SELL', ticker: 'CLSC', shares: 100, price: 23, target: 'T1', raise_stop_be: true, date: '2026-09-03' }).journal;
  assert.deepEqual(sell.events.map((e) => [e.kind, e.type ?? e.source]), [['order', 'SELL'], ['levels', 'breakeven_at_t1']]);
  assert.equal(sell.events[1].from.stop, 18);
  assert.equal(sell.events[1].to.stop, 21);
  assert.equal(sell.exit, null);
  const out = applyOrder(d, { type: 'SELL', ticker: 'CLSC', shares: 100, price: 24, target: 'T2', date: '2026-09-04' }).journal;
  assert.equal(d.exited_positions[0].trade_id, out.trade_id);
  assert.equal(out.exit.type, 'SELL');
  assert.equal(out.exit.price, 24);
  assert.equal(new Set([buy.trade_id, add.trade_id, sell.trade_id, out.trade_id]).size, 1);
});

test('an order on a position that predates the journal adopts a trade_id', () => {
  const d = { ...emptyData(), positions: [{ ticker: 'CLSC', avg_cost: 20, shares: 100, live_price: 20, stop_loss: 18 }] };
  const { journal } = applyOrder(d, { type: 'BUY_ADD', ticker: 'CLSC', shares: 50, price: 20, date: '2026-09-05' });
  assert.match(d.positions[0].trade_id, /^CLSC-2026-09-05-/);
  assert.equal(journal.trade_id, d.positions[0].trade_id);
  assert.equal(journal.open, null);
});

test('correctEntry reports a correction event', () => {
  const d = { ...emptyData(), positions: [{ ticker: 'CLSC', avg_cost: 20.5, shares: 100, live_price: 20 }] };
  const { journal } = correctEntry(d, { ticker: 'CLSC', shares: 100, avg_cost: 20, date: '2026-09-05' });
  assert.match(d.positions[0].trade_id, /^CLSC-2026-09-05-/);
  assert.deepEqual(journal.events, [
    { kind: 'correction', from: { shares: 100, avg_cost: 20.5 }, to: { shares: 100, avg_cost: 20 }, date: '2026-09-05' },
  ]);
});
