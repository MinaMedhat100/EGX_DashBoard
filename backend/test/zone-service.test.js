import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildZones, nearestZone, zoneGap, ZONE_MERGE_ATR, ZONES_PER_SIDE, WEEKLY_WEIGHT } from '../services/zoneService.js';

const D = (name, value) => ({ name, tf: 'D', value });
const W = (name, value) => ({ name, tf: 'W', value });

test('constants', () => {
  assert.equal(ZONE_MERGE_ATR, 0.5);
  assert.equal(ZONES_PER_SIDE, 5);
  assert.equal(WEEKLY_WEIGHT, 2);
});

test('no price or no ATR → no zones', () => {
  assert.deepEqual(buildZones([D('EMA20', 900)], 1000, null), []);
  assert.deepEqual(buildZones([D('EMA20', 900)], 1000, 0), []);
  assert.deepEqual(buildZones([D('EMA20', 900)], null, 100), []);
});

test('levels exactly 0.5 ATR apart merge; just over splits', () => {
  const merged = buildZones([D('EMA20', 800), D('EMA50', 850)], 1000, 100);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].lo, 800);
  assert.equal(merged[0].hi, 850);
  const split = buildZones([D('EMA20', 800), D('EMA50', 851)], 1000, 100);
  assert.equal(split.length, 2);
});

test('chain merge can make a zone wider than 0.5 ATR', () => {
  const z = buildZones([D('A', 700), D('B', 740), D('C', 780)], 1000, 100);
  assert.equal(z.length, 1);
  assert.deepEqual([z[0].lo, z[0].hi, z[0].mid], [700, 780, 740]);
  assert.deepEqual(z[0].sources.map((s) => s.name), ['A', 'B', 'C']);
});

test('score counts weekly double; dots thresholds', () => {
  const [one] = buildZones([D('A', 800)], 1000, 100);
  assert.deepEqual([one.score, one.dots], [1, 1]);
  const [three] = buildZones([D('A', 800), W('B', 810)], 1000, 100);
  assert.deepEqual([three.score, three.dots], [3, 2]);
  const [four] = buildZones([W('A', 800), W('B', 810)], 1000, 100);
  assert.deepEqual([four.score, four.dots], [4, 3]);
});

test('roles and distances (nearest edge)', () => {
  const z = buildZones([D('R', 1200), D('A1', 1080), D('A2', 1120), D('S', 900)], 1100, 100);
  const by = Object.fromEntries(z.map((x) => [x.sources[0].name, x]));
  assert.equal(by.R.role, 'resistance');
  assert.deepEqual([by.R.dist_pct, by.R.dist_atr], [9.09, 1]);
  assert.equal(by.A1.role, 'at_price');
  assert.deepEqual([by.A1.lo, by.A1.hi, by.A1.dist_pct, by.A1.dist_atr], [1080, 1120, 0, 0]);
  assert.equal(by.S.role, 'support');
  assert.deepEqual([by.S.dist_pct, by.S.dist_atr], [-18.18, -2]);
});

test('ids run top-down', () => {
  const z = buildZones([D('S', 900), D('R', 1200), D('R2', 1400)], 1000, 100);
  assert.deepEqual(z.map((x) => [x.id, x.hi]), [['Z1', 1400], ['Z2', 1200], ['Z3', 900]]);
});

test('keeps the 5 nearest zones per side', () => {
  const sup = [100, 200, 300, 400, 500, 600, 700].map((v, i) => D(`S${i}`, v));
  const z = buildZones(sup, 1000, 10);
  assert.equal(z.length, 5);
  assert.deepEqual(z.map((x) => x.hi), [700, 600, 500, 400, 300]);
});

test('bad levels are ignored', () => {
  const z = buildZones([null, D('X', NaN), D('Y', -5), { name: 'Z', tf: 'D' }, D('ok', 900)], 1000, 100);
  assert.equal(z.length, 1);
});

test('nearestZone and zoneGap', () => {
  const z = buildZones([D('R1', 1100), D('R2', 1300), D('S1', 900), D('S2', 700)], 1000, 100);
  assert.equal(nearestZone(z, 'resistance').lo, 1100);
  assert.equal(nearestZone(z, 'support').hi, 900);
  assert.equal(nearestZone(z, 'at_price'), null);
  const zone = { lo: 100, hi: 200 };
  assert.equal(zoneGap(150, zone), 0);
  assert.equal(zoneGap(90, zone), 10);
  assert.equal(zoneGap(230, zone), 30);
});

// v2.11.0 fix: extra levels (ESTHMR swings) are added after the zones are built, so they never chain two zones together.
test('extra levels attach to the nearest zone within ZONE_MERGE_ATR and never join two zones', () => {
  const z = buildZones([D('A', 800), D('B', 900)], 1000, 100, [D('Swing low 1', 840), D('Swing low 2', 860)]);
  assert.deepEqual(z.map((x) => [x.lo, x.hi, x.sources.map((s) => s.name)]), [
    [860, 900, ['Swing low 2', 'B']],
    [800, 840, ['A', 'Swing low 1']],
  ]);
});

test('no extra levels: zones are exactly the base ones', () => {
  const base = [D('A', 800), W('B', 900), D('C', 1100), D('D', 1300)];
  assert.deepEqual(buildZones(base, 1000, 100, []), buildZones(base, 1000, 100));
  assert.deepEqual(buildZones(base, 1000, 100, undefined), buildZones(base, 1000, 100));
});

test('extra levels far from every zone form their own zones and chain only among themselves', () => {
  const z = buildZones([D('A', 800)], 1000, 100, [D('Swing low 1', 600), D('Swing low 2', 640), D('Swing low 3', 680)]);
  assert.deepEqual(z.map((x) => [x.lo, x.hi, x.score]), [[800, 800, 1], [600, 680, 3]]);
});

test('the same turning point from daily and weekly bars counts once, as the weekly one', () => {
  const z = buildZones([D('R1', 1100)], 1000, 100,
    [D('Year high', 1250), W('Swing high 10 Sep', 1250), D('Swing high 8 Sep', 1250)]);
  const top = z.find((x) => x.lo === 1250);
  assert.deepEqual(top.sources, [{ name: 'Swing high 10 Sep', tf: 'W', value: 1250 }]);
  assert.equal(top.score, WEEKLY_WEIGHT);
});

test('an extra level inside a zone joins it without changing its edges', () => {
  const [z] = buildZones([D('A', 800), D('B', 840)], 1000, 100, [D('Swing low', 820)]);
  assert.deepEqual([z.lo, z.hi, z.score], [800, 840, 3]);
});
