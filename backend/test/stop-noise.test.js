import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stopNoiseWarning, refreshStopWarning, correctionWarning, recomputeDerived } from '../services/levelService.js';

const bracket = (stopA, stopB, extra = {}) => ({
  ticker: 'BRKT', avg_cost: 10, shares: 1000, indicators: { atr: 1 },
  brackets: { entry_price: 10, lots: [
    { id: 'A', shares: 400, stop: stopA, tp_price: 11, tp_hit: false, stopped: false },
    { id: 'B', shares: 600, stop: stopB, tp_price: 12, tp_hit: false, stopped: false },
  ] }, ...extra,
});
const classic = (stop, extra = {}) => ({ ticker: 'CLSC', avg_cost: 10, shares: 100, stop_loss: stop, indicators: { atr: 1 }, ...extra });

test('bracket inside noise: per-lot multiples, safer stop and same-risk shares', () => {
  const w = stopNoiseWarning(bracket(9.6, 9.6));
  assert.deepEqual(w.stops, [{ lot: 'A', stop: 9.6, atr_mult: 0.4 }, { lot: 'B', stop: 9.6, atr_mult: 0.4 }]);
  assert.equal(w.safer_stop, 8.5);
  assert.equal(w.same_risk_shares, 266);
  assert.match(w.text, /Lot A stop 9\.60 is only 0\.4× ATR · Lot B stop 9\.60 is only 0\.4× ATR below your 10\.00 entry \(minimum 1\.5×\) — widen to ≤ 8\.50 and cut to ~266sh/);
});

test('closed lots and stops at/above entry are ignored; far stops give no warning', () => {
  const b = bracket(9.6, 9.6);
  b.brackets.lots[0].tp_hit = true;
  assert.deepEqual(stopNoiseWarning(b).stops.map((s) => s.lot), ['B']);
  assert.equal(stopNoiseWarning(bracket(10.2, 8.3)), null); // A above entry (profit stop), B 1.7× away
  assert.equal(stopNoiseWarning(classic(8)), null);
  assert.equal(stopNoiseWarning(classic(9)).stops[0].lot, null);
  assert.match(stopNoiseWarning(classic(9)).text, /^stop 9\.00 is only 1× ATR/);
});

test('no ATR or no entry → null', () => {
  assert.equal(stopNoiseWarning(classic(9, { indicators: {} })), null);
  assert.equal(stopNoiseWarning(classic(9, { avg_cost: 0 })), null);
});

test('refreshStopWarning clears once the stop is wide enough, and only touches existing warnings', () => {
  const p = classic(9, { stop_warning: { text: 'old', at: 'T0' } });
  refreshStopWarning(p);
  assert.match(p.stop_warning.text, /1× ATR/);
  assert.equal(p.stop_warning.at, 'T0');
  p.stop_loss = 8;
  refreshStopWarning(p);
  assert.equal(p.stop_warning, undefined);
  const q = classic(9);
  refreshStopWarning(q);
  assert.equal(q.stop_warning, undefined); // never creates one
  const r = classic(8, { stop_warning: { text: 'old', at: 'T0' } });
  recomputeDerived(r);
  assert.equal(r.stop_warning, undefined);
});

test('correctionWarning sets the flag and annotates the journal correction event', () => {
  const p = classic(9);
  const report = { events: [{ kind: 'correction', from: null, to: { shares: 100, avg_cost: 10 }, date: '2026-10-14' }] };
  const w = correctionWarning(p, report, 'T1');
  assert.equal(p.stop_warning.at, 'T1');
  assert.equal(report.events[0].stop_warning, w.text);
  const fine = classic(8, { stop_warning: { text: 'old', at: 'T0' } });
  assert.equal(correctionWarning(fine, { events: [] }, 'T2'), null);
  assert.equal(fine.stop_warning, undefined);
});
