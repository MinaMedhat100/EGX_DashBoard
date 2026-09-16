import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  entryGuard, entryZoneChasing, annotateEntries, ENTRY_GAP_MIN_PCT,
} from '../services/entryGuard.js';

// ALUM's three August cards: the zone climbed until its top was the live price.
const CARD1 = { price: 28.93, entry_zone: [27.2, 28.4] };
const CARD2 = { price: 29.38, entry_zone: [27.6, 29.4] };
const CARD3 = { price: 29.6, entry_zone: [28.6, 29.6] };

test('entryGuard reports how far price sits above the zone', () => {
  assert.equal(ENTRY_GAP_MIN_PCT, 0.5);
  assert.deepEqual(entryGuard(CARD1.entry_zone, CARD1.price), { level: 28.4, above_pct: 1.87 });
  assert.equal(entryGuard(CARD3.entry_zone, CARD3.price), null); // zone top IS the price
});

test('entryGuard ignores drift inside the tolerance, and bad input', () => {
  assert.equal(entryGuard([27, 100], 100.4), null); // 0.4% above is not worth a note
  assert.deepEqual(entryGuard([27, 100], 100.6), { level: 100, above_pct: 0.6 });
  assert.equal(entryGuard([27, 100], 99), null); // price inside the zone
  assert.equal(entryGuard(null, 100), null);
  assert.equal(entryGuard([27, 100], null), null);
  assert.equal(entryGuard([], 100), null);
});

test('entryZoneChasing fires only when the zone rose with price to meet it', () => {
  assert.equal(entryZoneChasing(CARD2.entry_zone, CARD2.price, CARD1), true);
  assert.equal(entryZoneChasing(CARD3.entry_zone, CARD3.price, CARD2), true);
  assert.equal(entryZoneChasing(CARD1.entry_zone, CARD1.price, null), false); // no prior read
  assert.equal(entryZoneChasing(CARD1.entry_zone, CARD1.price, CARD2), false); // zone fell
  // a prior read saved before v2.5.0 carries no price, so the question cannot be answered
  assert.equal(entryZoneChasing(CARD2.entry_zone, CARD2.price, { entry_zone: [27.2, 28.4] }), false);
  // the zone rose but still sits well below price: that is a pullback zone, not a chase
  assert.equal(entryZoneChasing([26, 27], 29.6, { price: 28.0, entry_zone: [25, 26] }), false);
});

test('annotateEntries sets price and guard, and appends the flag once', () => {
  const opps = [{ ticker: 'alum', entry_zone: [28.6, 29.6], overextension: ['rsi_at_band_ceiling'] }];
  annotateEntries(opps, { ALUM: 29.6 }, { ALUM: CARD2 });
  assert.equal(opps[0].price, 29.6);
  assert.equal(opps[0].entry_guard, null);
  assert.deepEqual(opps[0].overextension, ['rsi_at_band_ceiling', 'entry_zone_chasing']);
  annotateEntries(opps, { ALUM: 29.6 }, { ALUM: CARD2 }); // idempotent
  assert.deepEqual(opps[0].overextension, ['rsi_at_band_ceiling', 'entry_zone_chasing']);
});

test('annotateEntries tolerates a missing price, prior and flag array', () => {
  const opps = [{ ticker: 'X', entry_zone: [9, 10] }];
  annotateEntries(opps, {}, {});
  assert.equal(opps[0].price, undefined);
  assert.equal(opps[0].entry_guard, null);
  assert.equal(opps[0].overextension, undefined); // nothing added when nothing fires
  assert.deepEqual(annotateEntries(null, {}, {}), null);
});
