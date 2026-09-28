import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyJournal, newTradeId, randomSuffix, findTrade, levelsSnapshot, levelsChanged, aiReadEvent,
  openTrade, appendEvent, closeTrade, acceptCard, applyOrderJournal, ensureTradeId, recordAiRead,
} from '../services/journalService.js';

const AT = '2026-09-28T10:00:00.000Z';
const ref = { trade_id: 'BRKT-2026-09-01-aaaa', ticker: 'BRKT', date: '2026-09-01' };
const classic = () => ({ ticker: 'CLSC', stop_loss: 9, t1_price: 11, t2_price: 12 });
function bracket() {
  return {
    ticker: 'BRKT',
    brackets: {
      entry_price: 10,
      lots: [
        { id: 'A', target: 'T1', shares: 400, tp_price: 11, stop: 9, tp_hit: false, stopped: false },
        { id: 'B', target: 'T2', shares: 600, tp_price: 12, stop: 9, tp_hit: false, stopped: false },
      ],
    },
  };
}

test('newTradeId is TICKER-date-suffix with a 4-char suffix', () => {
  assert.equal(newTradeId('brkt', '2026-09-28', 'ab12'), 'BRKT-2026-09-28-ab12');
  assert.match(newTradeId('BRKT', '2026-09-28'), /^BRKT-2026-09-28-[a-z0-9]{4}$/);
  assert.equal(randomSuffix(Buffer.from([0, 1, 35, 36])), 'ab9a');
  assert.equal(newTradeId('efih t1', 'undated', 'ab12'), 'EFIH_T1-undated-ab12'); // legacy tickers with spaces
});

test('levelsSnapshot: classic stop/t1/t2, bracket per lot with open flags', () => {
  assert.deepEqual(levelsSnapshot(classic()), { stop: 9, t1: 11, t2: 12 });
  const b = bracket();
  b.brackets.lots[0].tp_hit = true;
  assert.deepEqual(levelsSnapshot(b), {
    lots: { A: { stop: 9, tp: 11, open: false }, B: { stop: 9, tp: 12, open: true } },
  });
});

test('levelsSnapshot: a missing or zero level is null, not 0', () => {
  assert.deepEqual(levelsSnapshot({ ticker: 'CLSC', stop_loss: 0, t1_price: null }), { stop: null, t1: null, t2: null });
});

test('levelsChanged compares at 2 dp and per lot, ignoring lot open state', () => {
  assert.equal(levelsChanged({ stop: 9, t1: 11, t2: 12 }, { stop: 9.004, t1: 11, t2: 12 }), false);
  assert.equal(levelsChanged({ stop: 9, t1: 11, t2: 12 }, { stop: 9.5, t1: 11, t2: 12 }), true);
  const a = levelsSnapshot(bracket());
  const b = levelsSnapshot(bracket());
  b.lots.B.stop = 10;
  assert.equal(levelsChanged(a, b), true);
  const c = levelsSnapshot(bracket());
  c.lots.A.open = false;
  assert.equal(levelsChanged(a, c), false);
  assert.equal(levelsChanged(null, a), true);
  assert.equal(levelsChanged(null, null), false);
});

test('aiReadEvent captures the call, suggested levels and indicators', () => {
  const p = {
    ticker: 'BRKT', live_price: 10.5,
    indicators: { adx: 40, plus_di: 30, minus_di: 15, rsi: 60, atr: 0.4, ema20: 10, ema50: 9.5 },
    ai: {
      recommendation: 'HOLD', conviction: 3, thesis: 't', key_risk: 'k', action_line: 'a',
      suggested_stop: 9.5, suggested_stop_a: 9, suggested_stop_b: 9.5, suggested_t1: 11, suggested_t2: 12,
      stop_guard: null, vs_prior: 'unchanged', change_reason: '', model: 'm', analyzed_at: AT,
    },
  };
  const e = aiReadEvent(p, 'refresh_one');
  assert.equal(e.kind, 'ai_read');
  assert.equal(e.source, 'refresh_one');
  assert.equal(e.price, 10.5);
  assert.deepEqual(e.suggested, { stop: 9.5, stop_a: 9, stop_b: 9.5, t1: 11, t2: 12 });
  assert.equal(e.indicators.atr, 0.4);
  assert.equal(e.recommendation, 'HOLD');
  assert.equal(e.conviction, 3);
  assert.equal(e.analyzed_at, AT);
});

test('aiReadEvent: absent fields are null, never 0', () => {
  const e = aiReadEvent({ ticker: 'BRKT', live_price: 10, ai: { recommendation: 'HOLD' } }, 'refresh_all');
  assert.equal(e.suggested.stop_a, null);
  assert.equal(e.indicators.atr, null);
  assert.equal(e.conviction, null);
});

test('openTrade records entry and card; origin follows the card; idempotent', () => {
  const j = emptyJournal();
  const card = { ticker: 'BRKT', score: 80, scan_as_of: AT };
  const t = openTrade(j, { ...ref, entry: { price: 10 }, card });
  assert.equal(t.origin, 'card');
  assert.equal(t.card_source, 'logged');
  assert.equal(t.status, 'open');
  assert.equal(t.opened_at, '2026-09-01');
  openTrade(j, { ...ref, entry: { price: 99 } });
  assert.equal(j.trades.length, 1);
  assert.equal(j.trades[0].entry.price, 10);
  const t2 = openTrade(j, { trade_id: 'CLSC-2026-09-01-bbbb', ticker: 'CLSC', date: '2026-09-01', entry: {} });
  assert.equal(t2.origin, 'no_card');
  assert.equal(t2.card_source, null);
});

test('appendEvent on a missing record recreates it with a leading gap event', () => {
  const j = emptyJournal();
  appendEvent(j, ref, { kind: 'order', type: 'SELL' }, AT);
  const t = findTrade(j, ref.trade_id);
  assert.equal(t.origin, 'seeded');
  assert.deepEqual(t.events.map((e) => e.kind), ['gap', 'order']);
  assert.equal(t.events[1].at, AT);
});

test('closeTrade sets exit and status', () => {
  const j = emptyJournal();
  openTrade(j, { ...ref, entry: {} });
  closeTrade(j, ref, { date: '2026-09-10', price: 9, type: 'STOP-OUT', realized_pnl: -100 }, AT);
  const t = findTrade(j, ref.trade_id);
  assert.equal(t.status, 'closed');
  assert.equal(t.closed_at, '2026-09-10');
  assert.deepEqual(t.exit, { date: '2026-09-10', price: 9, type: 'STOP-OUT', realized_pnl: -100, approximate: false });
});

test('acceptCard keeps a copy only for a BUY_NEW of the same ticker', () => {
  const card = { ticker: 'BRKT', score: 80 };
  const kept = acceptCard({ type: 'BUY_NEW', ticker: 'brkt', card });
  assert.deepEqual(kept, card);
  assert.notEqual(kept, card);
  assert.equal(acceptCard({ type: 'BUY_NEW', ticker: 'CLSC', card }), null);
  assert.equal(acceptCard({ type: 'SELL', ticker: 'BRKT', card }), null);
  assert.equal(acceptCard({ type: 'BUY_NEW', ticker: 'BRKT' }), null);
});

test('applyOrderJournal opens, appends and closes from an applyOrder report', () => {
  const j = emptyJournal();
  applyOrderJournal(j, { ...ref, open: { entry: { price: 10 } }, events: [], exit: null }, { card: { ticker: 'BRKT' }, at: AT });
  applyOrderJournal(j, {
    ...ref, open: null, events: [{ kind: 'order', type: 'STOP_OUT', lot: 'A' }],
    exit: { date: '2026-09-10', price: 9, type: 'STOP-OUT', realized_pnl: -40 },
  }, { at: AT });
  const t = findTrade(j, ref.trade_id);
  assert.equal(t.origin, 'card');
  assert.deepEqual(t.events.map((e) => e.kind), ['order']);
  assert.equal(t.status, 'closed');
  applyOrderJournal(j, null);
  assert.equal(j.trades.length, 1);
});

test('ensureTradeId assigns once', () => {
  const p = { ticker: 'BRKT' };
  const id = ensureTradeId(p, '2026-09-28');
  assert.match(id, /^BRKT-2026-09-28-[a-z0-9]{4}$/);
  assert.equal(ensureTradeId(p, '2026-10-01'), id);
});

test('recordAiRead appends the read, plus an ai_initial levels event only when levels were adopted', () => {
  const j = emptyJournal();
  const p = { ticker: 'CLSC', trade_id: 'CLSC-2026-09-01-aaaa', stop_loss: 0, t1_price: 0, t2_price: 0, live_price: 10, ai: { recommendation: 'HOLD' } };
  openTrade(j, { trade_id: p.trade_id, ticker: 'CLSC', date: '2026-09-01', entry: {} });
  const before = levelsSnapshot(p);
  p.stop_loss = 9; p.t1_price = 11; p.t2_price = 12;
  recordAiRead(j, p, 'refresh_one', before, true, AT);
  recordAiRead(j, p, 'refresh_one', levelsSnapshot(p), false, AT);
  const t = findTrade(j, p.trade_id);
  assert.deepEqual(t.events.map((e) => [e.kind, e.source]), [
    ['ai_read', 'refresh_one'], ['levels', 'ai_initial'], ['ai_read', 'refresh_one'],
  ]);
  assert.deepEqual(t.events[1].to, { stop: 9, t1: 11, t2: 12 });
});
