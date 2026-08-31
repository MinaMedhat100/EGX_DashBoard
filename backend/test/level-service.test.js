import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAiLevels, commitLevels, recomputeDerived, proposalDiffers, bracketProposal } from '../services/levelService.js';
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
