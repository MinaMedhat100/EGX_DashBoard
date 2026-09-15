import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAiLevels, commitLevels, recomputeDerived, proposalDiffers, bracketProposal, guardStopChange, STOP_ATR_MULT } from '../services/levelService.js';
import { makeBracket, syncBracketSummary, settleLot } from '../services/bracketService.js';

function freshBracketPos(ai) {
  const p = { avg_cost: 328, brackets: makeBracket(328, 15, 50, 296.5, 347, 369.2), ai };
  syncBracketSummary(p);
  return p;
}

test('bracketProposal: fresh bracket, AI differs -> proposal maps to both lots', () => {
  const p = freshBracketPos({ suggested_stop: 308, suggested_t1: 337, suggested_t2: 375 });
  assert.deepEqual(bracketProposal(p), { stop: 308, t1: 337, t2: 375 });
});

test('bracketProposal: AI agrees -> null (no chip)', () => {
  const p = freshBracketPos({ suggested_stop: 296.5, suggested_t1: 347, suggested_t2: 369.2 });
  assert.equal(bracketProposal(p), null);
});

test('bracketProposal: runner (Lot A filled) -> only stop + t2, t1 null', () => {
  const p = freshBracketPos({ suggested_stop: 328, suggested_t1: 999, suggested_t2: 380 });
  settleLot(p, 'A', { kind: 'tp', price: 347, date: 'd' }, p.avg_cost);
  const prop = bracketProposal(p);
  assert.equal(prop.stop, 328);
  assert.equal(prop.t2, 380);
  assert.equal(prop.t1, null);
});

test('applyAiLevels: bracket returns the open-lot proposal (no classic desync)', () => {
  const p = freshBracketPos({ suggested_stop: 308, suggested_t1: 337, suggested_t2: 369.2 });
  const r = applyAiLevels(p);
  assert.equal(r.applied, false);
  assert.deepEqual(r.proposal, { stop: 308, t1: 337, t2: 369.2 });
  assert.equal(p.brackets.lots[0].stop, 296.5);
});

test('commitLevels: bracket re-derives OPEN lots only', () => {
  const p = freshBracketPos({});
  settleLot(p, 'A', { kind: 'tp', price: 347, date: 'd' }, p.avg_cost);
  commitLevels(p, { stop: 328, t1: 999, t2: 380 });
  const a = p.brackets.lots.find((l) => l.id === 'A');
  const b = p.brackets.lots.find((l) => l.id === 'B');
  assert.equal(a.tp_price, 347);
  assert.equal(b.stop, 328);
  assert.equal(b.tp_price, 380);
  assert.equal(p.stop_loss, 328);
});

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

test('applyAiLevels returns no proposal for a bracketed position (brackets self-manage levels)', () => {
  const pos = { brackets: { entry_price: 328, lots: [] }, levels_source: 'manual', stop_loss: 296.5,
    t1_price: 347, t2_price: 369.2, ai: { suggested_stop: 308, suggested_t1: 337, suggested_t2: 369.2 } };
  const r = applyAiLevels(pos);
  assert.equal(r.applied, false);
  assert.equal(r.proposal, undefined); // no classic Apply chip for brackets
  assert.equal(pos.stop_loss, 296.5); // untouched
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

test('proposalDiffers: true when a suggested level moves, false when all match/absent', () => {
  const pos = { stop_loss: 296.5, t1_price: 347, t2_price: 369.2 };
  assert.equal(proposalDiffers(pos, { stop: 308, t1: 337, t2: 369.2 }), true); // stop + t1 moved
  assert.equal(proposalDiffers(pos, { stop: 296.5, t1: 347, t2: 369.2 }), false); // all equal
  assert.equal(proposalDiffers(pos, { stop: null, t1: null, t2: null }), false); // nothing proposed
  assert.equal(proposalDiffers(pos, { stop: 296.5, t1: null, t2: 369.2 }), false); // unchanged + nulls
  assert.equal(proposalDiffers(pos, { stop: 296.5, t1: 347.004, t2: 369.2 }), false); // within 2dp rounding
  assert.equal(proposalDiffers(pos, null), false); // no proposal object
});

test('applyAiLevels leaves position pending when AI returns no stop', () => {
  const pos = { levels_source: 'pending', stop_loss: 0, t1_price: 0, t2_price: 0,
    ai: { suggested_t1: 14, suggested_t2: 16.5 } };
  const r = applyAiLevels(pos);
  assert.equal(r.applied, false);
  assert.equal(pos.levels_source, 'pending');
  assert.equal(pos.stop_loss, 0);
});

// ── v2.4.0 stop guard ─────────────────────────────────────────────────────────
const classic = (over = {}) => ({ avg_cost: 10, live_price: 12, stop_loss: 9, t1_hit: false,
  indicators: { atr: 0.5 }, ...over });

test('guardStopChange: SPIN 09-06 — raise below entry before T1 is held back', () => {
  const spin = { avg_cost: 19.16, live_price: 19.71, stop_loss: 17.6, t1_hit: false, indicators: { atr: 0.95 } };
  const g = guardStopChange(spin, 18.4);
  assert.equal(g.ok, false);
  assert.equal(g.suggested, 18.4);
  assert.match(g.reason, /below your 19\.16 entry before T1/);
});

test('guardStopChange: never moves a stop down', () => {
  const g = guardStopChange(classic(), 8.5);
  assert.equal(g.ok, false);
  assert.match(g.reason, /down from 9\.00/);
});

test('guardStopChange: at or above the live price is held back', () => {
  assert.match(guardStopChange(classic(), 12).reason, /at or above the live price 12\.00/);
});

test('guardStopChange: before T1, a raise to break-even or higher with enough room is allowed', () => {
  assert.deepEqual(guardStopChange(classic(), 11.2), { ok: true }); // 0.8 below price >= 0.75 (1.5x ATR)
  assert.deepEqual(guardStopChange(classic(), 10), { ok: true }); // exactly break-even, 2.0 below price
});

test('guardStopChange: a stop within 1.5x ATR of price is held back', () => {
  assert.equal(STOP_ATR_MULT, 1.5);
  const g = guardStopChange(classic(), 11.5); // 0.5 below price = 1.0x ATR
  assert.equal(g.ok, false);
  assert.match(g.reason, /only 1\.0× ATR below the live price 12\.00 \(minimum 1\.5×\)/);
});

test('guardStopChange: after T1, raising up to break-even ignores the ATR distance', () => {
  const p = classic({ t1_hit: true, live_price: 10.3 });
  assert.deepEqual(guardStopChange(p, 10), { ok: true }); // 0.3 below price, but break-even after T1
  assert.equal(guardStopChange(p, 10.1).ok, false); // trailing above break-even still needs 1.5x ATR
});

test('guardStopChange: missing ATR skips only the distance rule', () => {
  const p = classic({ indicators: {} });
  assert.deepEqual(guardStopChange(p, 11.9), { ok: true });
  assert.equal(guardStopChange(p, 9.5).ok, false); // still below entry before T1
});

test('guardStopChange: no suggestion, or unchanged at 2dp, is ok', () => {
  assert.deepEqual(guardStopChange(classic(), null), { ok: true });
  assert.deepEqual(guardStopChange(classic(), 9.004), { ok: true });
});

test('guardStopChange: a position with no stop may get its first one below entry', () => {
  const p = classic({ stop_loss: 0 });
  assert.deepEqual(guardStopChange(p, 9), { ok: true });
  assert.equal(guardStopChange(p, 12.5).ok, false); // but never at/above price
});

test('guardStopChange: bracket uses the open lots, and Lot A for T1', () => {
  const p = freshBracketPos({}); // avg 328, shared stop 296.5, no live price / ATR
  assert.equal(guardStopChange(p, 308).ok, false); // below entry, Lot A not filled
  assert.deepEqual(guardStopChange(p, 330), { ok: true });
  settleLot(p, 'A', { kind: 'tp', price: 347, date: 'd' }, p.avg_cost);
  p.live_price = 335;
  p.indicators = { atr: 5 };
  assert.deepEqual(guardStopChange(p, 328), { ok: true }); // break-even after T1: 7 below price < 7.5
});

test('guardStopChange: bracket with no open lots is ok', () => {
  const p = { avg_cost: 328, brackets: { entry_price: 328, lots: [] } };
  assert.deepEqual(guardStopChange(p, 308), { ok: true });
});
