import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normDate, parseLogType, buildBackfill, pendingTrades, applyBackfill } from '../services/journalBackfill.js';
import { emptyJournal } from '../services/journalService.js';

const opts = { today: '2026-09-28', now: '2026-09-28T12:00:00.000Z', idFor: (t, d) => `${t}-${d}-test` };
const newestFirst = (entries) => entries.slice().reverse(); // action_log is written with unshift

function data() {
  return {
    positions: [
      { ticker: 'OPEN', avg_cost: 5, shares: 200, live_price: 5.2, stop_loss: 4.5, t1_price: 6, t2_price: 7,
        ai: { recommendation: 'HOLD', conviction: 3, thesis: 'x' } },
      { ticker: 'NOLG', avg_cost: 50, shares: 10, live_price: 0, stop_loss: 0, t1_price: 0, t2_price: 0, ai: null },
    ],
    action_log: newestFirst([
      { id: '1', date: 'Jun 10, 2026', type: 'BUY', ticker: 'RENT', shares: 100, price: 10 },
      { id: '2', date: 'Jun 20, 2026', type: 'STOP-OUT', ticker: 'RENT', shares: 100, price: 9, realized_pnl: -100 },
      { id: '3', date: '2026-08-01', type: 'BUY (bracket)', ticker: 'RENT', shares: 100, price: 12 },
      { id: '4', date: '2026-08-05', type: 'SELL (Lot A @ T1)', ticker: 'RENT', shares: 50, price: 13, realized_pnl: 50 },
      { id: '5', date: '2026-08-09', type: 'STOP-OUT (Lot B)', ticker: 'RENT', shares: 50, price: 12, realized_pnl: 0 },
      { id: '6', date: '2026-09-01', type: 'BUY', ticker: 'OPEN', shares: 200, price: 5.1 },
      { id: '7', date: '2026-09-02', type: 'CORRECT', ticker: 'OPEN', shares: 200, total_shares: 200, price: 5, notes: 'entry corrected from 200sh @ 5.1' },
      { id: '8', date: '2026-07-01', type: 'BUY', ticker: 'ADDS', shares: 100, price: 20 },
      { id: '9', date: '2026-07-03', type: 'BUY (add)', ticker: 'ADDS', shares: 100, price: 22 },
      { id: '10', date: '2026-07-06', type: 'SELL', ticker: 'ADDS', shares: 200, price: 25, realized_pnl: 800 },
    ]),
    exited_positions: [
      { ticker: 'ADDS', exit_date: '2026-07-07', exit_price: 25, shares: 200, avg_cost: 21, realized_pnl: 800, exit_type: 'SELL', approximate: false },
      { ticker: 'RENT', exit_date: '2026-08-09', exit_price: 12, shares: 100, avg_cost: 12, realized_pnl: 50, exit_type: 'STOP-OUT', approximate: false },
      { ticker: 'OLDX', exit_date: 'May 1, 2026', exit_price: 3, shares: 10, avg_cost: 4, realized_pnl: -10, exit_type: 'SELL', approximate: true },
      { ticker: 'RENT', exit_date: 'Jun 20, 2026', exit_price: 9, shares: 100, avg_cost: 10, realized_pnl: -100, exit_type: 'STOP-OUT', approximate: false },
    ],
  };
}

const runs = [
  { id: 'r2', timestamp: '2026-07-30T20:00:00.000Z', opportunities: [{ ticker: 'RENT', score: 80 }] },
  { id: 'r1', timestamp: '2026-07-20T20:00:00.000Z', opportunities: [{ ticker: 'RENT', score: 70 }] },
  { id: 'r0', timestamp: '2026-06-01T20:00:00.000Z', opportunities: [{ ticker: 'RENT', score: 60 }] },
];
const byTicker = (built, ticker) => built.trades.filter((t) => t.trade.ticker === ticker);

test('normDate reads ISO and "Mon D, YYYY" dates', () => {
  assert.equal(normDate('Jun 10, 2026'), '2026-06-10');
  assert.equal(normDate('June 3, 2026'), '2026-06-03');
  assert.equal(normDate('2026-08-01'), '2026-08-01');
  assert.equal(normDate('soon'), null);
  assert.equal(normDate(null), null);
});

test('parseLogType reads buys, adds, lot exits and corrections', () => {
  assert.deepEqual(parseLogType('BUY (bracket)'), { kind: 'buy', orderType: null, lot: null, bracket: true });
  assert.deepEqual(parseLogType('BUY (add)'), { kind: 'add', orderType: 'BUY_ADD', lot: null, bracket: false });
  assert.deepEqual(parseLogType('SELL (Lot A @ T1)'), { kind: 'exit', orderType: 'SELL', lot: 'A', bracket: false });
  assert.deepEqual(parseLogType('STOP-OUT (Lot B)'), { kind: 'exit', orderType: 'STOP_OUT', lot: 'B', bracket: false });
  assert.deepEqual(parseLogType('STOP-OUT'), { kind: 'exit', orderType: 'STOP_OUT', lot: null, bracket: false });
  assert.equal(parseLogType('CORRECT').kind, 'correct');
  assert.equal(parseLogType('WEIRD').kind, null);
});

test('re-entries of one ticker become separate closed trades matched to their own exits', () => {
  const rent = byTicker(buildBackfill(data(), runs, opts), 'RENT');
  assert.deepEqual(rent.map((t) => [t.trade.opened_at, t.trade.closed_at, t.trade.status]), [
    ['2026-06-10', '2026-06-20', 'closed'],
    ['2026-08-01', '2026-08-09', 'closed'],
  ]);
  assert.deepEqual(rent.map((t) => t.target), [{ kind: 'exit', index: 3 }, { kind: 'exit', index: 1 }]);
  assert.equal(rent[1].trade.entry.mode, 'bracket');
  assert.deepEqual(rent[1].trade.events.map((e) => [e.type, e.lot]), [['SELL', 'A'], ['STOP_OUT', 'B']]);
  assert.equal(rent[0].trade.origin, 'reconstructed');
  assert.equal(rent[0].trade.entry.levels_known, false);
  assert.equal(rent[0].trade.trade_id, 'RENT-2026-06-10-test');
});

test('adds and a full sell pair into one trade; the exit one day later still matches', () => {
  const [adds] = byTicker(buildBackfill(data(), runs, opts), 'ADDS');
  assert.deepEqual(adds.trade.events.map((e) => e.type), ['BUY_ADD', 'SELL']);
  assert.deepEqual(adds.target, { kind: 'exit', index: 0 });
  assert.equal(adds.trade.entry.price, 20);
  assert.deepEqual(adds.trade.exit, { date: '2026-07-07', price: 25, type: 'SELL', realized_pnl: 800, approximate: false });
});

test('an exit with no buy in the log becomes an exit-only record', () => {
  const [oldx] = byTicker(buildBackfill(data(), runs, opts), 'OLDX');
  assert.equal(oldx.trade.opened_at, null);
  assert.equal(oldx.trade.entry.price, 4);
  assert.equal(oldx.trade.exit.approximate, true);
  assert.deepEqual(oldx.target, { kind: 'exit', index: 2 });
  assert.equal(oldx.trade.trade_id, 'OLDX-2026-05-01-test');
});

test('open positions are seeded: rebuilt orders, the correction, the current AI read, a levels snapshot', () => {
  const built = buildBackfill(data(), runs, opts);
  const [open] = byTicker(built, 'OPEN');
  assert.equal(open.trade.origin, 'seeded');
  assert.equal(open.trade.status, 'open');
  assert.deepEqual(open.target, { kind: 'position', ticker: 'OPEN' });
  assert.deepEqual(open.trade.events.map((e) => e.kind), ['correction', 'ai_read', 'levels']);
  assert.deepEqual(open.trade.events[0].from, { shares: 200, avg_cost: 5.1 });
  assert.deepEqual(open.trade.events[0].to, { shares: 200, avg_cost: 5 });
  assert.equal(open.trade.events[1].source, 'seeded');
  assert.deepEqual(open.trade.events[2], { at: opts.now, kind: 'levels', source: 'seeded', from: null, to: { stop: 4.5, t1: 6, t2: 7 } });
  assert.equal(open.trade.entry.levels_known, false);
  assert.equal(open.trade.entry.price, 5.1);

  const [nolg] = byTicker(built, 'NOLG');
  assert.equal(nolg.trade.opened_at, null);
  assert.equal(nolg.trade.trade_id, 'NOLG-2026-09-28-test');
  assert.deepEqual(nolg.trade.events.map((e) => e.kind), ['levels']);
});

test('cards are matched from scan history within 7 days before entry, labelled as a match', () => {
  const [june, aug] = byTicker(buildBackfill(data(), runs, opts), 'RENT');
  assert.equal(june.trade.card, null); // nearest run is 9 days before
  assert.equal(aug.trade.card.score, 80);
  assert.equal(aug.trade.card.scan_run_id, 'r2');
  assert.equal(aug.trade.card.scan_as_of, '2026-07-30T20:00:00.000Z');
  assert.equal(aug.trade.card_source, 'scan_history_match');
  assert.equal(aug.trade.origin, 'reconstructed');
});

test('what cannot be matched is reported, not invented', () => {
  const d = data();
  d.exited_positions.splice(0, 1); // drop ADDS' exit
  const built = buildBackfill(d, runs, opts);
  assert.equal(byTicker(built, 'ADDS').length, 0);
  assert.match(built.unmatched.join('\n'), /ADDS closed 2026-07-06 in the log, but no exited position matches/);
});

test('on one date, buys come before adds and adds before exits, whatever order they were logged in', () => {
  const d = {
    positions: [],
    action_log: newestFirst([
      { id: '1', date: '2026-06-08', type: 'BUY (add)', ticker: 'SAME', shares: 100, price: 10 },
      { id: '2', date: '2026-06-08', type: 'BUY', ticker: 'SAME', shares: 200, price: 10.5 },
      { id: '3', date: '2026-06-14', type: 'STOP-OUT', ticker: 'SAME', shares: 200, price: 9.8 },
      { id: '4', date: '2026-06-30', type: 'STOP-OUT', ticker: 'SAME', shares: 100, price: 9.5 },
    ]),
    exited_positions: [{ ticker: 'SAME', exit_date: '2026-06-30', exit_price: 9.5, shares: 100, avg_cost: 10, realized_pnl: -50, exit_type: 'STOP-OUT' }],
  };
  const built = buildBackfill(d, [], opts);
  assert.equal(built.trades.length, 1);
  const [{ trade, target }] = built.trades;
  assert.equal(trade.entry.price, 10.5);
  assert.equal(trade.closed_at, '2026-06-30');
  assert.deepEqual(trade.events.map((e) => e.type), ['BUY_ADD', 'STOP_OUT', 'STOP_OUT']);
  assert.deepEqual(target, { kind: 'exit', index: 0 });
  assert.deepEqual(built.unmatched, []);
});

test('a legacy partial-exit record is linked to its trade, not turned into a separate trade', () => {
  const d = {
    positions: [],
    action_log: newestFirst([
      { id: '1', date: '2026-06-08', type: 'BUY', ticker: 'PART', shares: 1000, price: 10 },
      { id: '2', date: '2026-06-09', type: 'STOP-OUT', ticker: 'PART', shares: 1000, price: 9 },
      { id: '3', date: '2026-06-09', type: 'BUY (add)', ticker: 'PART', shares: 350, price: 9.5 },
      { id: '4', date: '2026-07-05', type: 'SELL', ticker: 'PART', shares: 350, price: 11 },
    ]),
    exited_positions: [
      { ticker: 'PART', exit_date: '2026-07-05', exit_price: 11, shares: 350, avg_cost: 9.5, realized_pnl: 525, exit_type: 'SELL' },
      { ticker: 'PART', exit_date: 'Jun 9, 2026', exit_price: 9, shares: 1000, avg_cost: 10, realized_pnl: -1000, exit_type: 'STOP-OUT' },
    ],
  };
  const built = buildBackfill(d, [], opts);
  assert.equal(built.trades.length, 1);
  assert.equal(built.partials.length, 1);
  assert.equal(built.partials[0].index, 1);
  const j = emptyJournal();
  const r = applyBackfill(d, j, built);
  assert.deepEqual(r, { added: 1, linked: 1 });
  assert.equal(d.exited_positions[0].trade_id, 'PART-2026-06-08-test');
  assert.equal(d.exited_positions[1].trade_id, 'PART-2026-06-08-test');
  assert.deepEqual(applyBackfill(d, j, buildBackfill(d, [], opts)), { added: 0, linked: 0 });
});

test('an undated legacy exit keeps its original date text and gets an "undated" id', () => {
  const d = {
    positions: [], action_log: [],
    exited_positions: [{ ticker: 'UNDT', exit_date: '~May–Jun 2026', exit_price: null, shares: null, avg_cost: null, exit_type: 'SELL', approximate: true }],
  };
  const [{ trade }] = buildBackfill(d, [], opts).trades;
  assert.equal(trade.trade_id, 'UNDT-undated-test');
  assert.equal(trade.closed_at, null);
  assert.equal(trade.exit.date, '~May–Jun 2026');
});

test('applyBackfill stamps trade_ids and merges trades; a second run changes nothing', () => {
  const d = data();
  const j = emptyJournal();
  const first = applyBackfill(d, j, buildBackfill(d, runs, opts));
  assert.equal(first.added, 6);
  assert.equal(first.linked, 0);
  assert.equal(d.positions[0].trade_id, 'OPEN-2026-09-01-test');
  assert.ok(d.exited_positions.every((e) => e.trade_id));
  const snapshot = JSON.stringify({ d, j });
  const again = buildBackfill(d, runs, opts);
  assert.equal(pendingTrades(d, j, again).length, 0);
  assert.equal(applyBackfill(d, j, again).added, 0);
  assert.equal(JSON.stringify({ d, j }), snapshot);
});
