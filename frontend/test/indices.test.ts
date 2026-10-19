import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toneClass, zoneDots, fmtLevel, zoneRange, distText, sourceLabel, isLegacy, scenarioMarks, costText, pickTab,
  newsRows, newsState, newsAge, impactMark, likelyLabel, likelyMark, rangeBetween,
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

const POOL = {
  items: [
    { id: 'N1', headline: 'Egypt stocks slump', source: 'Reuters', age: '1d', time: '2026-10-17T12:00:00Z', url: 'https://news.example/1' },
    { id: 'N2', headline: 'Undated, unlinked item', source: null, age: null, time: null, url: null },
  ],
  error: null,
};

test('newsRows joins picks to the pool and drops ids it does not have', () => {
  const ai = { news: [{ id: 'N2', impact: 'neutral', why: 'b' }, { id: 'N9', impact: 'bull', why: 'gone' }, { id: 'N1', impact: 'bear', why: 'a' }] } as any;
  const rows = newsRows(ai, POOL);
  assert.deepEqual(rows.map((r) => [r.id, r.impact, r.why]), [['N2', 'neutral', 'b'], ['N1', 'bear', 'a']]);
  assert.equal(rows[0].url, null);
  assert.deepEqual(newsRows(null, POOL), []);
  assert.deepEqual(newsRows(ai, null), []);
});

test('newsState', () => {
  const ai = { news: [{ id: 'N1', impact: 'bear', why: 'a' }] } as any;
  assert.equal(newsState(undefined, ai), 'legacy');
  assert.equal(newsState(null, ai), 'legacy');
  assert.equal(newsState({ items: [], error: 'news lookup failed' }, ai), 'failed');
  assert.equal(newsState(POOL, { news: [] } as any), 'empty');
  assert.equal(newsState(POOL, null), 'empty');
  assert.equal(newsState(POOL, ai), 'rows');
});

test('newsAge is computed when viewed, with the stored age as fallback', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  assert.equal(newsAge(POOL.items[0], now), '3d');
  assert.equal(newsAge({ ...POOL.items[0], time: '2026-10-20T07:00:00Z' }, now), '5h');
  assert.equal(newsAge({ ...POOL.items[0], time: '2026-10-20T11:30:00Z' }, now), 'just now');
  assert.equal(newsAge({ ...POOL.items[0], time: null }, now), '1d');
  assert.equal(newsAge(POOL.items[1], now), null);
});

test('impactMark', () => {
  assert.equal(impactMark('bull'), '▲');
  assert.equal(impactMark('bear'), '▼');
  assert.equal(impactMark('neutral'), '•');
  assert.equal(impactMark('weird'), '•');
});

test('likelyLabel and likelyMark', () => {
  assert.equal(likelyLabel({ side: 'bear', confidence: 'medium', reasons: [] }), '🐻 Bear · Medium');
  assert.equal(likelyLabel({ side: 'bull', confidence: 'high', reasons: [] }), '🐂 Bull · High');
  assert.equal(likelyLabel({ side: 'range', confidence: 'low', reasons: [] }), '↔ Range · Low');
  assert.equal(likelyLabel(null), null);
  assert.equal(likelyLabel(undefined), null);
  assert.equal(likelyMark({ side: 'range', confidence: 'low', reasons: [] }), '↔');
  assert.equal(likelyMark({ side: 'bear', confidence: 'low', reasons: [] }), '🐻');
  assert.equal(likelyMark(null), null);
});

test('rangeBetween names the nearest support and resistance', () => {
  const zones = [z('Z1', 1200, 1200, 'resistance'), z('Z2', 1100, 1100, 'resistance'), z('Z3', 900, 940, 'support'), z('Z4', 700, 700, 'support')];
  assert.equal(rangeBetween(zones), 'between Z3 and Z2');
  assert.equal(rangeBetween([z('Z1', 1200, 1200, 'resistance')]), null);
  assert.equal(rangeBetween([]), null);
});

test('newsRows only keeps http(s) links', () => {
  const pool = { items: [
    { id: 'N1', headline: 'a', source: null, age: null, time: null, url: 'javascript:alert(1)' },
    { id: 'N2', headline: 'b', source: null, age: null, time: null, url: 'HTTPS://news.example/b' },
    { id: 'N3', headline: 'c', source: null, age: null, time: null, url: 'data:text/html,x' },
  ], error: null };
  const ai = { news: ['N1', 'N2', 'N3'].map((id) => ({ id, impact: 'neutral', why: 'x' })) } as any;
  assert.deepEqual(newsRows(ai, pool).map((r) => r.url), [null, 'HTTPS://news.example/b', null]);
});
