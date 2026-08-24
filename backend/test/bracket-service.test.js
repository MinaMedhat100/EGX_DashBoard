// backend/test/bracket-service.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeBracket, syncBracketSummary, bracketRealized, openLots, isFullyExited, raiseLotStop, settleLot, bracketPlan,
} from '../services/bracketService.js';

test('makeBracket splits 50/50 with Lot A taking the odd extra share', () => {
  const b = makeBracket(328, 15, 50, 296.5, 347, 369.2);
  assert.equal(b.entry_price, 328);
  assert.equal(b.lots.length, 2);
  const [a, bb] = b.lots;
  assert.deepEqual([a.id, a.target, a.shares, a.tp_price, a.stop], ['A', 'T1', 8, 347, 296.5]);
  assert.deepEqual([bb.id, bb.target, bb.shares, bb.tp_price, bb.stop], ['B', 'T2', 7, 369.2, 296.5]);
  assert.equal(a.tp_hit === false && a.stopped === false && a.stop_raised === false, true);
});

test('makeBracket honors a custom split (60/40 of 10)', () => {
  const b = makeBracket(10, 10, 60, 9, 11, 12);
  assert.deepEqual([b.lots[0].shares, b.lots[1].shares], [6, 4]);
});

test('syncBracketSummary derives mirrors from open lots', () => {
  const pos = { brackets: makeBracket(328, 15, 50, 296.5, 347, 369.2) };
  syncBracketSummary(pos);
  assert.equal(pos.shares, 15);
  assert.equal(pos.stop_loss, 296.5);
  assert.equal(pos.t1_price, 347);
  assert.equal(pos.t2_price, 369.2);
  assert.equal(pos.t1_hit, false);
  assert.equal(pos.t2_hit, false);
});

test('settleLot(tp) closes Lot A, returns realized, resyncs mirrors', () => {
  const pos = { avg_cost: 328, brackets: makeBracket(328, 15, 50, 296.5, 347, 369.2) };
  syncBracketSummary(pos);
  const { realized, lot } = settleLot(pos, 'A', { kind: 'tp', price: 347, date: '2026-08-25' }, pos.avg_cost);
  assert.equal(realized, bracketRealized({ shares: 8, exit_price: 347 }, 328)); // (347-328)*8 = 152
  assert.equal(realized, 152);
  assert.equal(lot.tp_hit, true);
  assert.equal(pos.shares, 7);        // only Lot B open
  assert.equal(pos.t1_hit, true);     // mirror
  assert.equal(isFullyExited(pos.brackets), false);
});

test('raiseLotStop moves one lot stop and lifts the whole-position stop mirror', () => {
  const pos = { avg_cost: 328, brackets: makeBracket(328, 15, 50, 296.5, 347, 369.2) };
  settleLot(pos, 'A', { kind: 'tp', price: 347, date: 'd' }, 328);
  raiseLotStop(pos, 'B', 328);
  assert.equal(pos.brackets.lots.find((l) => l.id === 'B').stop, 328);
  assert.equal(pos.brackets.lots.find((l) => l.id === 'B').stop_raised, true);
  assert.equal(pos.stop_loss, 328); // only open lot's stop
});

test('settleLot(stop) on all remaining lots -> fully exited', () => {
  const pos = { avg_cost: 328, brackets: makeBracket(328, 15, 50, 296.5, 347, 369.2) };
  settleLot(pos, 'A', { kind: 'stop', price: 296.5, date: 'd' }, 328);
  settleLot(pos, 'B', { kind: 'stop', price: 296.5, date: 'd' }, 328);
  assert.equal(isFullyExited(pos.brackets), true);
  assert.equal(openLots(pos.brackets).length, 0);
});

test('bracketPlan uses the AI split by default and computes per-lot R:R', () => {
  const opp = { entry_zone: [10, 10.2], stop: 9, t1: 11, t2: 13, split: [40, 60], split_reason: 'strong trend' };
  const bp = bracketPlan(opp);
  assert.deepEqual(bp.split, [40, 60]);
  assert.equal(bp.split_reason, 'strong trend');
  assert.equal(bp.lot_a.pct, 40);
  assert.equal(bp.lot_a.tp, 11);
  assert.equal(bp.lot_b.tp, 13);
  assert.equal(bp.rr_a > 0 && bp.rr_b > bp.rr_a, true); // T2 further than T1
});

test('bracketPlan falls back to 50/50 when the opp has no AI split', () => {
  const bp = bracketPlan({ entry_zone: [10], stop: 9, t1: 11, t2: 13 });
  assert.deepEqual(bp.split, [50, 50]);
});
