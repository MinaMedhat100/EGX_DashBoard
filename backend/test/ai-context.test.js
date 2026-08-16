import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relAge, gatherNews, goldMacroNews, latestRegime, REGIME_MAX_AGE_MS } from '../services/aiContext.js';

const NOW = Date.parse('2026-08-16T12:00:00Z');
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();

test('relAge buckets by age', () => {
  assert.equal(relAge(null, NOW), null);
  assert.equal(relAge('not-a-date', NOW), null);
  assert.equal(relAge(iso(30 * 60 * 1000), NOW), 'just now');
  assert.equal(relAge(iso(5 * 60 * 60 * 1000), NOW), '5h');
  assert.equal(relAge(iso(3 * 24 * 60 * 60 * 1000), NOW), '3d');
});

test('gatherNews maps, caps 4, uppercases+dedupes, isolates failures', async () => {
  const fake = async (t) => {
    if (t === 'BOOM') throw new Error('net');
    return [1, 2, 3, 4, 5].map((n) => ({ headline: `${t}-${n}`, time: iso(60 * 60 * 1000) }));
  };
  const out = await gatherNews(['comi', 'COMI', 'boom'], fake, NOW);
  assert.equal(out.COMI.length, 4);
  assert.equal(out.COMI[0].headline, 'COMI-1');
  assert.equal(out.COMI[0].age, '1h');
  assert.deepEqual(out.BOOM, []);
});

test('goldMacroNews returns capped {headline,age}, [] on failure', async () => {
  const ok = await goldMacroNews(async () => [{ headline: 'Gold rips', time: iso(60 * 60 * 1000) }], NOW);
  assert.deepEqual(ok, [{ headline: 'Gold rips', age: '1h' }]);
  assert.deepEqual(await goldMacroNews(async () => { throw new Error('x'); }, NOW), []);
});

test('latestRegime parses fresh, flags stale, null on missing', async () => {
  const fresh = async () => ({ timestamp: iso(60 * 60 * 1000), overall: { regime: 'Risk-Off', summary: 'weak breadth' } });
  assert.deepEqual(await latestRegime(fresh, NOW), { regime: 'Risk-Off', summary: 'weak breadth', as_of: iso(60 * 60 * 1000), stale: false });
  const old = async () => ({ timestamp: iso(REGIME_MAX_AGE_MS + 1000), overall: { regime: 'Risk-On', summary: 's' } });
  assert.equal((await latestRegime(old, NOW)).stale, true);
  assert.equal(await latestRegime(async () => null, NOW), null);
  assert.equal(await latestRegime(async () => ({ timestamp: 't', overall: {} }), NOW), null);
});
