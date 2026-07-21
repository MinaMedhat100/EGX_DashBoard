import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPosition, evaluateStatus, buildAlert } from '../services/statusEngine.js';

// Defaults: flat position, strong trend, price between avg and T1.
const P = (o = {}) => ({
  shares: 100, avg_cost: 10, stop_loss: 9, stop_raised: false,
  t1_hit: false, t2_hit: false, t1_price: 12, t2_price: 14, status_key: 'yellow', ...o,
});
const L = (o = {}) => ({ adx: 45, plus_di: 30, minus_di: 18, price: 11, ...o });

// ── stop breach (RED framework, unchanged) ──────────────────────────────────
test('stop breach + adx<40 -> EXIT 100% no trend', () => {
  const c = classifyPosition(P(), L({ price: 8, adx: 35 }));
  assert.deepEqual(c, { status: 'red', action: 'EXIT 100% at market (no trend)' });
});
test('stop breach + adx>=40 + -DI>+DI -> trend reversed', () => {
  const c = classifyPosition(P(), L({ price: 8, plus_di: 15, minus_di: 25 }));
  assert.deepEqual(c, { status: 'red', action: 'EXIT 100% at market (trend reversed)' });
});
test('stop breach + higher TF turned -> W/D exit', () => {
  const c = classifyPosition(P(), L({ price: 8, mtf: { higher_tf_bullish: false } }));
  assert.deepEqual(c, { status: 'red', action: 'EXIT 100% at market — higher TF (W/D) turned' });
});
test('stop breach + strong + no W/D signal -> EXIT 50% keep runner', () => {
  const c = classifyPosition(P(), L({ price: 8 }));
  assert.deepEqual(c, { status: 'red', action: 'EXIT 50% (50sh) at market — keep runner' });
});

// ── next target = T1 (not filled) ───────────────────────────────────────────
test('T1 not filled, price >= T1 -> T1 reached', () => {
  const c = classifyPosition(P(), L({ price: 12.5 }));
  assert.deepEqual(c, { status: 'green', action: 'T1 reached — sell 50sh now' });
});
test('T1 within 2% + strong -> Switch to limit sell', () => {
  const c = classifyPosition(P(), L({ price: 11.8 }));
  assert.deepEqual(c, { status: 'green', action: 'Switch to LIMIT SELL 50sh @ 12' });
});
test('T1 within 4% + strong -> Prepare limit sell', () => {
  const c = classifyPosition(P(), L({ price: 11.6 }));
  assert.deepEqual(c, { status: 'orange_hot', action: 'Prepare LIMIT SELL 50sh @ 12' });
});
test('T1 out of zone -> plain hold', () => {
  const c = classifyPosition(P(), L({ price: 11 }));
  assert.deepEqual(c, { status: 'yellow', action: 'Hold — keep stop @ 9' });
});
test('T1 out of zone + adx<25 -> red no trend', () => {
  const c = classifyPosition(P(), L({ price: 11, adx: 20, plus_di: 22, minus_di: 18 }));
  assert.deepEqual(c, { status: 'red', action: 'EXIT 100% at market (no trend)' });
});
test('plain hold with no stop set -> Hold (no keep-stop text)', () => {
  const c = classifyPosition(P({ stop_loss: 0 }), L({ price: 11 }));
  assert.deepEqual(c, { status: 'yellow', action: 'Hold' });
});

// ── next target = T2 (T1 filled, runner) ────────────────────────────────────
test('REGRESSION #2: T1 filled, pullback into old T1 zone -> NOT a T1 sell', () => {
  const c = classifyPosition(
    P({ t1_hit: true, stop_loss: 11 }), L({ price: 11.9 }),
  );
  // near old T1 (12) but target is now T2; runner-hold, not "LIMIT SELL @ 12"
  assert.deepEqual(c, { status: 'yellow', action: 'Raise stop to break-even (10)' });
});
test('#1: T2 reached, W/D not bullish -> sell remaining', () => {
  const c = classifyPosition(P({ t1_hit: true, shares: 60, stop_loss: 11 }), L({ price: 14.5 }));
  assert.deepEqual(c, { status: 'green', action: 'T2 reached — sell remaining 60sh now' });
});
test('T2 reached, W/D still bullish -> trail, keep runner', () => {
  const c = classifyPosition(
    P({ t1_hit: true, stop_loss: 11 }), L({ price: 14.5, mtf: { higher_tf_bullish: true } }),
  );
  assert.deepEqual(c, { status: 'yellow', action: 'T2 reached — trail stop below recent swing, keep runner' });
});
test('T2 within 2% + strong -> Switch remaining', () => {
  const c = classifyPosition(P({ t1_hit: true, shares: 60, stop_loss: 11 }), L({ price: 13.8 }));
  assert.deepEqual(c, { status: 'green', action: 'Switch to LIMIT SELL 60sh @ 14' });
});
test('T2 within 4% + strong -> Prepare remaining', () => {
  const c = classifyPosition(P({ t1_hit: true, shares: 60, stop_loss: 11 }), L({ price: 13.5 }));
  assert.deepEqual(c, { status: 'orange_hot', action: 'Prepare LIMIT SELL 60sh @ 14' });
});
test('runner-hold, stop already raised -> hold toward T2', () => {
  const c = classifyPosition(
    P({ t1_hit: true, stop_raised: true, stop_loss: 11 }), L({ price: 13 }),
  );
  assert.deepEqual(c, { status: 'yellow', action: 'Hold runner toward T2 — keep stop @ 11' });
});
test('runner-hold with t2 unset -> hold toward T2', () => {
  const c = classifyPosition(
    P({ t1_hit: true, t2_price: 0, stop_raised: true, stop_loss: 11 }), L({ price: 13 }),
  );
  assert.deepEqual(c, { status: 'yellow', action: 'Hold runner toward T2 — keep stop @ 11' });
});

// ── next target = none (both filled) ────────────────────────────────────────
test('both targets filled -> trailing runner', () => {
  const c = classifyPosition(
    P({ t1_hit: true, t2_hit: true, stop_loss: 12 }), L({ price: 15 }),
  );
  assert.deepEqual(c, { status: 'yellow', action: 'Trailing runner — keep stop @ 12' });
});
test('both filled + adx<25 -> red no trend', () => {
  const c = classifyPosition(
    P({ t1_hit: true, t2_hit: true, stop_loss: 12 }), L({ price: 15, adx: 20, plus_di: 22, minus_di: 18 }),
  );
  assert.deepEqual(c, { status: 'red', action: 'EXIT 100% at market (no trend)' });
});

// ── evaluateStatus / buildAlert wiring ──────────────────────────────────────
test('evaluateStatus keeps prior status when live data is insufficient', () => {
  const s = evaluateStatus(P({ status_key: 'orange_hot' }), { price: 11, adx: null, plus_di: null, minus_di: null });
  assert.equal(s, 'orange_hot');
});
test('buildAlert flags next-target imminent vs T2 (not old T1)', () => {
  const p = P({ t1_hit: true, shares: 60, stop_loss: 11 });
  const live = L({ price: 13.8 });
  const a = buildAlert(p, live, evaluateStatus(p, live), null);
  assert.ok(a.flags.includes('TARGET_IMMINENT'));
  assert.equal(a.thndr_action, 'Switch to LIMIT SELL 60sh @ 14');
});
test('buildAlert does NOT flag imminent on a filled-T1 pullback near old T1', () => {
  const p = P({ t1_hit: true, stop_loss: 11 });
  const live = L({ price: 11.9 });
  const a = buildAlert(p, live, evaluateStatus(p, live), null);
  assert.ok(!a.flags.includes('TARGET_IMMINENT'));
});
test('buildAlert emits CROSSOVER when +DI/-DI flip', () => {
  const p = P();
  const live = L({ price: 11, plus_di: 12, minus_di: 15 });
  const a = buildAlert(p, live, evaluateStatus(p, live), { plus_di: 20, minus_di: 10 });
  assert.ok(a.flags.includes('CROSSOVER'));
});
test('buildAlert emits STOP_BREACH flag on breach', () => {
  const p = P();
  const live = L({ price: 8 });
  const a = buildAlert(p, live, evaluateStatus(p, live), null);
  assert.ok(a.flags.includes('STOP_BREACH'));
});
test('buildAlert always carries an EXIT action on stop breach even with missing momentum data', () => {
  const p = P();
  const live = { price: 8, adx: null, plus_di: null, minus_di: null };
  const a = buildAlert(p, live, evaluateStatus(p, live), null);
  assert.ok(a.flags.includes('STOP_BREACH'));
  assert.equal(a.thndr_action, 'EXIT — stop breached');
});
