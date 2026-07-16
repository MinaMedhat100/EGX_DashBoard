import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goldPrompt, finalizeGold } from '../services/analystService.js';

const snap = { indicators: { price: 4028, adx: 40.8, rsi: 40, plus_di: 10, minus_di: 29 }, mtf: { weekly_bias: 'Bullish' }, usd_egp: 50.5 };

test('flat-state prompt asks for an ENTRY and frames gold/macro, no sector', () => {
  const p = goldPrompt(snap, null, '');
  assert.match(p, /ENTER_LONG/);
  assert.match(p, /macro|USD|DXY|real yield/i);
  assert.match(p, /2%/);            // Thndr round-trip fee mentioned
  assert.doesNotMatch(p, /sector/i);
});

test('holding-state prompt asks for HOLD/TRIM/EXIT', () => {
  const p = goldPrompt(snap, { avg_cost: 3900, shares: 2, stop_loss: 3800, t1_price: 4200, t2_price: 4500 }, '');
  assert.match(p, /HOLD\|TRIM\|EXIT/);
});

test('finalizeGold passes an object through and tolerates junk', () => {
  assert.deepEqual(finalizeGold({ recommendation: 'WAIT', conviction: 3 }), { recommendation: 'WAIT', conviction: 3 });
  assert.deepEqual(finalizeGold(null), {});
  assert.deepEqual(finalizeGold([{ a: 1 }]), {});
});
