import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toneClass, zoneDots, fmtLevel, zoneRange, distText, sourceLabel, isLegacy, scenarioMarks, costText, pickTab,
} from '../src/lib/indices.ts';

const z = (id: string, lo: number, hi: number, role: string, dist_pct = 0, dist_atr = 0) =>
  ({ id, lo, hi, mid: (lo + hi) / 2, sources: [], score: 1, dots: 1, role, dist_pct, dist_atr }) as any;

test('toneClass falls back to neutral', () => {
  assert.match(toneClass('bull'), /status-green/);
  assert.match(toneClass('bear'), /status-red/);
  assert.match(toneClass('neutral'), /status-yellow/);
  assert.equal(toneClass('weird'), toneClass('neutral'));
});

test('zoneDots', () => {
  assert.equal(zoneDots(1), '●○○');
  assert.equal(zoneDots(2), '●●○');
  assert.equal(zoneDots(3), '●●●');
  assert.equal(zoneDots(9), '●●●');
});

test('fmtLevel and zoneRange', () => {
  assert.equal(fmtLevel(51842.39), '51,842');
  assert.equal(fmtLevel(null), '—');
  assert.equal(zoneRange(z('Z1', 50000, 50280.5, 'support')), '50,000–50,281');
  assert.equal(zoneRange(z('Z1', 53308.54, 53308.54, 'resistance')), '53,309');
  assert.equal(zoneRange(z('Z1', 53308.4, 53308.6, 'resistance')), '53,308–53,309');
});

test('distText', () => {
  assert.equal(distText(z('Z1', 1, 1, 'resistance', 1.123, 0.62)), '+1.12% · 0.6 ATR');
  assert.equal(distText(z('Z1', 1, 1, 'support', -2.04, -1.14)), '-2.04% · 1.1 ATR');
  assert.equal(distText(z('Z1', 1, 1, 'at_price')), 'at price');
});

test('sourceLabel', () => {
  assert.equal(sourceLabel({ name: 'EMA50', tf: 'W', value: 1 }), 'EMA50 W');
});

test('isLegacy', () => {
  assert.equal(isLegacy({ index: 'EGX30', regime: 'Neutral', trend: 'Neutral', thesis: 'old' } as any), true);
  assert.equal(isLegacy({ trend_momentum: [{ label: 'a' }] } as any), false);
  assert.equal(isLegacy({ trend_momentum: [], scenarios: { bull: { level: 1 }, bear: null } } as any), false);
});

test('scenarioMarks puts 🐂/🐻 on the zone holding (or nearest to) each level, skipping off-zone ones', () => {
  const zones = [z('Z1', 1200, 1200, 'resistance'), z('Z2', 1100, 1100, 'resistance'), z('Z3', 900, 940, 'support')];
  const ai = { scenarios: {
    bull: { trigger: '', level: 1110, target: 1200, note: '', off_zone: false },
    bear: { trigger: '', level: 930, target: 700, note: '', off_zone: false },
  } } as any;
  assert.deepEqual(scenarioMarks(ai, zones), { Z2: '🐂', Z3: '🐻' });
  const off = { scenarios: { bull: { level: 5000, off_zone: true }, bear: null } } as any;
  assert.deepEqual(scenarioMarks(off, zones), {});
  const both = { scenarios: { bull: { level: 920, off_zone: false }, bear: { level: 910, off_zone: false } } } as any;
  assert.deepEqual(scenarioMarks(both, zones), { Z3: '🐂🐻' });
  assert.deepEqual(scenarioMarks(null, zones), {});
});

test('costText', () => {
  assert.equal(costText(0.1234), 'AI read · $0.12');
  assert.equal(costText(null), null);
  assert.equal(costText(undefined), null);
});

test('pickTab', () => {
  assert.equal(pickTab('EGX70', ['EGX30', 'EGX70']), 'EGX70');
  assert.equal(pickTab('EGX999', ['EGX30', 'EGX70']), 'EGX30');
  assert.equal(pickTab(null, ['EGX30']), 'EGX30');
  assert.equal(pickTab(null, []), null);
});
