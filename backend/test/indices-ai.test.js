import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  indicesPrompt, mergeIndexAi, validateIndexAi, withZones, analyzeIndices, buildIndicesSnapshot, INDICES_SYSTEM,
} from '../services/analystService.js';

const D = (name, value) => ({ name, tf: 'D', value });
const W = (name, value) => ({ name, tf: 'W', value });

// price 1000, ATR 100 → zones: Z1 1200 (R), Z2 1100 (R), Z3 900–940 (S), Z4 700 (S)
const IDX = {
  index: 'EGX30', level: 1000, change_pct: -0.5, indicators: { atr: 100, rsi: 40 },
  levels: [D('Pivot R1', 1200), D('EMA50', 1100), W('EMA30', 900), D('BB lower', 940), D('Pivot S2', 700)],
  weekly_ok: true, stats: { breadth: 30 }, sectors: [],
};

test('withZones adds zones and drops the raw levels', () => {
  const [x] = withZones([IDX]);
  assert.equal(x.levels, undefined);
  assert.deepEqual(x.zones.map((z) => [z.id, z.lo, z.hi, z.role]),
    [['Z1', 1200, 1200, 'resistance'], ['Z2', 1100, 1100, 'resistance'], ['Z3', 900, 940, 'support'], ['Z4', 700, 700, 'support']]);
  const [none] = withZones([{ index: 'EGX70', level: null, indicators: {} }]);
  assert.deepEqual(none.zones, []);
});

test('indicesPrompt carries the numbered zones with sources and asks for the sections', () => {
  const p = indicesPrompt(withZones([IDX, { ...IDX, index: 'EGX70' }]), '');
  assert.match(p, /EGX30/);
  assert.match(p, /EGX70/);
  assert.match(p, /"id": "Z3"/);
  assert.match(p, /EMA30 W/);
  for (const k of ['trend_momentum', 'breadth', 'scenarios', 'for_me', 'headline', 'Risk-On', 'overall']) {
    assert.match(p, new RegExp(k));
  }
});

const zones = withZones([IDX])[0].zones;

test('validateIndexAi: non-object → null', () => {
  assert.equal(validateIndexAi(null, zones, 100), null);
  assert.equal(validateIndexAi('x', zones, 100), null);
  assert.equal(validateIndexAi([], zones, 100), null);
});

test('validateIndexAi: enum and tone fallbacks', () => {
  const v = validateIndexAi({
    index: 'EGX30', regime: 'Panic', trend: 'Up',
    trend_momentum: [{ label: 'Daily trend', read: 'Bearish', tone: 'red', detail: 'below EMA50' }, { read: 'no label' }],
    breadth: { read: 'Weak', tone: 'bear', detail: '8 up / 23 down', leaders: ['banks +1%', 3], laggards: [], note: 'n' },
  }, zones, 100);
  assert.equal(v.regime, 'Neutral');
  assert.equal(v.trend, 'Neutral');
  assert.deepEqual(v.trend_momentum, [{ label: 'Daily trend', read: 'Bearish', tone: 'neutral', detail: 'below EMA50' }]);
  assert.equal(v.breadth.tone, 'bear');
  assert.deepEqual(v.breadth.leaders, ['banks +1%']);
});

test('validateIndexAi: unknown zone ids dropped', () => {
  const v = validateIndexAi({ zones: [{ id: 'Z3', note: 'hold here' }, { id: 'Z9', note: 'ghost' }] }, zones, 100);
  assert.deepEqual(v.zones, [{ id: 'Z3', note: 'hold here' }]);
});

test('validateIndexAi: scenarios — off-zone flag, missing level dropped', () => {
  const v = validateIndexAi({ scenarios: {
    bull: { trigger: 'daily close above', level: 1120, target: 1200, note: 'n' }, // 20 from Z2 (≤ 50) → in zone
    bear: { trigger: 'daily close below', level: 880, target: 600, note: 'n' },  // target 100 below Z4 → off-zone
  } }, zones, 100);
  assert.equal(v.scenarios.bull.off_zone, false);
  assert.equal(v.scenarios.bear.off_zone, true);
  const w = validateIndexAi({ scenarios: { bull: { trigger: 'x', target: 1200 }, bear: null } }, zones, 100);
  assert.equal(w.scenarios.bull, null);
  assert.equal(w.scenarios.bear, null);
});

test('validateIndexAi: key levels default to the nearest zones; headline falls back to the thesis', () => {
  const v = validateIndexAi({ thesis: 'Sellers in control. Breadth weak.' }, zones, 100);
  assert.equal(v.key_support, 920);
  assert.equal(v.key_resistance, 1100);
  assert.equal(v.headline, 'Sellers in control.');
  assert.equal(v.thesis, 'Sellers in control. Breadth weak.');
  const k = validateIndexAi({ key_support: 905, key_resistance: 1110 }, zones, 100);
  assert.deepEqual([k.key_support, k.key_resistance], [905, 1110]);
});

test('mergeIndexAi validates per index and carries overall', () => {
  const indices = withZones([IDX, { ...IDX, index: 'EGX70' }]);
  const out = mergeIndexAi(indices, { indices: [{ index: 'EGX30', regime: 'Risk-On' }], overall: { regime: 'Neutral', summary: 's' } });
  assert.equal(out.indices[0].ai.regime, 'Risk-On');
  assert.equal(out.indices[0].ai.key_support, 920);
  assert.equal(out.indices[1].ai, null);
  assert.deepEqual(out.overall, { regime: 'Neutral', summary: 's' });
  const empty = mergeIndexAi([{ index: 'EGX30' }], null);
  assert.equal(empty.indices[0].ai, null);
  assert.equal(empty.overall, null);
});

// v2.11.0 A/B run 3: the schema example shows one object (EGX30) and the AI returned only that one.
test('indicesPrompt asks for exactly one object per index, by name and in order', () => {
  const three = withZones([IDX, { ...IDX, index: 'EGX70' }, { ...IDX, index: 'EGX100' }]);
  assert.ok(indicesPrompt(three, '').includes(
    '"indices" must hold exactly 3 objects, one per index, in this order: EGX30, EGX70, EGX100. The example shows only the first.'));
  assert.ok(indicesPrompt(withZones([IDX]), '').includes(
    '"indices" must hold exactly 1 object, one per index, in this order: EGX30. The example shows only the first.'));
});

test('analyzeIndices logs the indices the AI skipped, and nothing when it covers all', async () => {
  const logged = [];
  const log = (m) => logged.push(m);
  const run = async () => ({ text: JSON.stringify({ indices: [{ index: 'EGX30' }], overall: null }), cost_usd: 0.1 });
  const three = withZones([IDX, { ...IDX, index: 'EGX70' }, { ...IDX, index: 'EGX100' }]);
  const out = await analyzeIndices(three, 'm', { run, strategy: '', log });
  assert.deepEqual(logged, ['Indices AI read skipped EGX70, EGX100 (returned EGX30)']);
  assert.equal(out.indices[1].ai, null);
  await analyzeIndices(withZones([IDX]), 'm', { run, strategy: '', log });
  assert.equal(logged.length, 1);
});

test('analyzeIndices runs one isolated call and returns its cost', async () => {
  let seen;
  const run = async (prompt, model, opts) => {
    seen = { prompt, model, opts };
    return { text: JSON.stringify({ indices: [{ index: 'EGX30', regime: 'Risk-Off', trend: 'Bearish' }], overall: { regime: 'Risk-Off', summary: 's' } }), cost_usd: 0.12 };
  };
  const out = await analyzeIndices(withZones([IDX]), 'm', { run, strategy: '' });
  assert.equal(seen.model, 'm');
  assert.deepEqual(seen.opts, { isolated: true, systemPrompt: INDICES_SYSTEM, envelope: true });
  assert.equal(out.cost_usd, 0.12);
  assert.equal(out.indices[0].ai.trend, 'Bearish');
  assert.equal(out.overall.regime, 'Risk-Off');
});

test('buildIndicesSnapshot keeps the zones when the AI fails', async () => {
  const analyze = async () => { throw new Error('usage limit'); };
  const now = () => new Date('2026-10-14T10:00:00Z');
  const s = await buildIndicesSnapshot([IDX], 'm', { analyze, now, getNews: async () => ({ items: [], error: null }) });
  assert.equal(s.timestamp, '2026-10-14T10:00:00.000Z');
  assert.equal(s.indices[0].ai, null);
  assert.equal(s.indices[0].zones.length, 4);
  assert.equal(s.overall, null);
  assert.equal(s.cost_usd, null);
  assert.equal(s.ai_error, 'usage limit');
});

test('buildIndicesSnapshot on success', async () => {
  const analyze = async (indices) => ({ indices: indices.map((x) => ({ ...x, ai: { regime: 'Neutral' } })), overall: { regime: 'Neutral', summary: '' }, cost_usd: 0.1 });
  const s = await buildIndicesSnapshot([IDX], 'm', { analyze, now: () => new Date(0), getNews: async () => ({ items: [], error: null }) });
  assert.equal(s.cost_usd, 0.1);
  assert.equal(s.ai_error, null);
  assert.equal(s.indices[0].zones.length, 4);
});

const POOL = {
  items: [
    { id: 'N1', headline: 'Egypt stocks slump on regional jitters', source: 'Reuters', age: '1d', time: null, url: null },
    { id: 'N2', headline: 'Pound weakens past a new low against the dollar', source: 'Ahram', age: '4d', time: null, url: null },
  ],
  error: null,
};
const NEWS_IDS = new Set(['N1', 'N2']);

test('indicesPrompt carries the news pool and the likely rules', () => {
  const p = indicesPrompt(withZones([IDX]), '', POOL);
  assert.match(p, /"id": "N1"/);
  assert.match(p, /regional jitters/);
  assert.match(p, /"likely"/);
  assert.match(p, /"range"/);
  const failed = indicesPrompt(withZones([IDX]), '', { items: [], error: 'news lookup failed' });
  assert.match(failed, /lookup FAILED/);
  assert.doesNotMatch(failed, /"id": "N1"/);
  assert.match(indicesPrompt(withZones([IDX]), ''), /NEWS POOL/); // default: empty pool, no crash
});

test('validateIndexAi: news picks are checked against the pool', () => {
  const v = validateIndexAi({ news: [
    { id: 'N1', impact: 'bear', why: 'risk-off across the board' },
    { id: 'N9', impact: 'bull', why: 'not in the pool' },
    { id: 'N1', impact: 'bull', why: 'duplicate' },
    { id: 'N2', impact: 'sideways', why: 'weaker pound' },
    { id: 'N2' },
  ] }, zones, 100, NEWS_IDS);
  assert.deepEqual(v.news, [
    { id: 'N1', impact: 'bear', why: 'risk-off across the board' },
    { id: 'N2', impact: 'neutral', why: 'weaker pound' },
  ]);
  assert.deepEqual(validateIndexAi({}, zones, 100).news, []);
  assert.deepEqual(validateIndexAi({ news: 'N1' }, zones, 100, NEWS_IDS).news, []);
});

test('validateIndexAi: at most 4 news picks', () => {
  const ids = new Set(['N1', 'N2', 'N3', 'N4', 'N5', 'N6']);
  const v = validateIndexAi({ news: [...ids].map((id) => ({ id, impact: 'bull', why: 'x' })) }, zones, 100, ids);
  assert.deepEqual(v.news.map((n) => n.id), ['N1', 'N2', 'N3', 'N4']);
});

test('validateIndexAi: likely', () => {
  assert.deepEqual(
    validateIndexAi({ likely: { side: 'bear', confidence: 'medium', reasons: ['breadth 10%', 7, 'N1 risk-off', 'a', 'b'] } }, zones, 100).likely,
    { side: 'bear', confidence: 'medium', reasons: ['breadth 10%', 'N1 risk-off', 'a'] },
  );
  assert.equal(validateIndexAi({ likely: { side: 'up', confidence: 'high' } }, zones, 100).likely, null);
  assert.equal(validateIndexAi({ likely: 'bear' }, zones, 100).likely, null);
  assert.equal(validateIndexAi({}, zones, 100).likely, null);
  const r = validateIndexAi({ likely: { side: 'range', confidence: 'certain' } }, zones, 100).likely;
  assert.deepEqual(r, { side: 'range', confidence: 'low', reasons: [] });
});

test('analyzeIndices sends the pool and validates the picks against it', async () => {
  let prompt;
  const run = async (p) => {
    prompt = p;
    return { text: JSON.stringify({ indices: [{ index: 'EGX30', news: [{ id: 'N2', impact: 'bear', why: 'weaker pound' }, { id: 'N7', impact: 'bear', why: 'x' }] }], overall: null }), cost_usd: 0.2 };
  };
  const out = await analyzeIndices(withZones([IDX]), 'm', { run, strategy: '', news: POOL });
  assert.match(prompt, /Pound weakens/);
  assert.deepEqual(out.indices[0].ai.news, [{ id: 'N2', impact: 'bear', why: 'weaker pound' }]);
});

test('buildIndicesSnapshot stores the pool and hands it to analyze', async () => {
  let seen;
  const analyze = async (indices, model, opts) => { seen = opts; return { indices: indices.map((x) => ({ ...x, ai: null })), overall: null, cost_usd: 0.1 }; };
  const s = await buildIndicesSnapshot([IDX], 'm', { analyze, now: () => new Date(0), getNews: async () => POOL });
  assert.deepEqual(seen, { news: POOL });
  assert.deepEqual(s.news, POOL);
});

test('buildIndicesSnapshot survives a throwing news lookup', async () => {
  let seen;
  const analyze = async (indices, model, opts) => { seen = opts; return { indices: indices.map((x) => ({ ...x, ai: null })), overall: null, cost_usd: null }; };
  const s = await buildIndicesSnapshot([IDX], 'm', { analyze, now: () => new Date(0), getNews: async () => { throw new Error('offline'); } });
  assert.deepEqual(s.news, { items: [], error: 'news lookup failed' });
  assert.deepEqual(seen.news, { items: [], error: 'news lookup failed' });
});
