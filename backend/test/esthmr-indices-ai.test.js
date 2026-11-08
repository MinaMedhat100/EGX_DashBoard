import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { indicesPrompt, withZones, analyzeIndices, buildIndicesSnapshot } from '../services/analystService.js';
import { PART_NAMES } from '../services/esthmrIndices.js';
import { FIXTURE_INDICES, FIXTURE_STRATEGY, FIXTURE_NEWS } from './fixtures/indices-prompt-input.js';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/indices-prompt-v2.10.0.json', import.meta.url), 'utf-8'));
const INSERT_AT = 'For EACH index output one object.';
const RULES = [
  'EXTRAS rules: cite only figures that appear in this block or above; do not compute new flow, breadth or macro numbers.',
  'Flows (EGP millions of net buying) show who traded, not why. Call outlier sessions likely block deals and partial sessions incomplete; never read a trend from one of them.',
  "Breadth here is the WHOLE market; each index's own breadth is its stats above. Do not mix the two.",
  'An event date is a risk window, not a direction.',
  'Zone sources named "Swing high/low <date>" and "Year high/low" are real turning points from the index\'s own bars; structure lists the latest ones, oldest first.',
  'Use the extras inside the existing sections (trend_momentum, breadth, zones notes, scenarios, likely, for_me); the JSON shape below does not change.',
];

const STRUCT = { highs: [{ date: '2026-09-06', value: 1210 }], lows: [{ date: '2026-10-01', value: 880 }], highs_trend: null, lows_trend: null };
const PARTS = {
  flows: {
    unit: 'EGP millions, net buying',
    sessions: [{ date: '2026-11-05', eg: -100, ar: 0, fo: 100, fo_inst: 50, traded: 1000 }],
    counted: 1, totals: { eg: -100, ar: 0, fo: 100 }, totals_ex_outliers: { eg: -100, ar: 0, fo: 100 },
    tbills: { note: 'lending to the government, not shares', totals: { eg: 10, ar: 0, fo: -10 } },
  },
  breadth: { session: '2026-11-05', up: 10, down: 20, flat: 1, none: 2, top_sectors: [], bottom_sectors: [], risers: [], fallers: [] },
  macro: { as_of: '2026-11-06', cbe: null, usd_egp: 50, egx30_usd: null, brent_usd: null, gold_usd_oz: null, moves: [] },
  events: { next_cbe: '2026-12-17', next_fed: null, window_days: 14, events: [] },
};
// History for EGX30 (in the fixture): a weekly swing high at 1210, next to the 1200 daily pivot.
const EXTRAS = {
  parts: { ...PARTS, history: { EGX30: { levels: [{ name: 'Swing high 6 Sep', tf: 'W', value: 1210 }], structure: STRUCT } } },
  status: { ok: true, failed: [] },
};
// History only for an index the fixture doesn't have: the zone JSON stays as in v2.10.0.
const EXTRAS_NO_FIXTURE_HISTORY = {
  parts: { ...PARTS, history: { EGX100: { levels: [{ name: 'Swing low 1 Oct', tf: 'D', value: 10 }], structure: STRUCT } } },
  status: { ok: true, failed: [] },
};

test('ESTHMR off: prompt and zones are byte-identical to v2.10.0', () => {
  for (const x of [undefined, null, { parts: {}, status: { ok: false, failed: PART_NAMES } }, { parts: EXTRAS.parts, status: { ok: false, failed: [] } }]) {
    assert.equal(indicesPrompt(withZones(FIXTURE_INDICES, x), FIXTURE_STRATEGY, FIXTURE_NEWS, x), FIXTURE.prompt);
    assert.deepEqual(withZones(FIXTURE_INDICES, x), withZones(FIXTURE_INDICES));
  }
});

test('ESTHMR on: the block is only inserted, before the JSON schema', () => {
  const x = EXTRAS_NO_FIXTURE_HISTORY;
  const p = indicesPrompt(withZones(FIXTURE_INDICES, x), FIXTURE_STRATEGY, FIXTURE_NEWS, x);
  const at = FIXTURE.prompt.indexOf(INSERT_AT);
  assert.ok(at > 0);
  assert.ok(p.startsWith(FIXTURE.prompt.slice(0, at)));
  assert.ok(p.endsWith(FIXTURE.prompt.slice(at)));
  assert.ok(p.length > FIXTURE.prompt.length);
  assert.match(p, /=== MARKET EXTRAS \(ESTHMR: EGX's own published data\) ===/);
  for (const r of RULES) assert.ok(p.includes(r), r);
  assert.ok(p.includes('"unit": "EGP millions, net buying"'));
  assert.ok(p.includes('"highs_trend"'));
  assert.ok(p.includes('"EGX100"'));
  assert.ok(!p.includes('Not available this time'));
});

test('failed parts are named as not available', () => {
  const x = { ...EXTRAS, status: { ok: true, failed: ['events', 'history:EGX70:W'] } };
  const p = indicesPrompt(withZones(FIXTURE_INDICES, x), FIXTURE_STRATEGY, FIXTURE_NEWS, x);
  assert.ok(p.includes('Not available this time — absence is not evidence: events calendar, EGX70 weekly swing history'));
  const all = { parts: { flows: PARTS.flows }, status: { ok: true, failed: PART_NAMES.filter((n) => n !== 'flows') } };
  const q = indicesPrompt(withZones(FIXTURE_INDICES, all), FIXTURE_STRATEGY, FIXTURE_NEWS, all);
  assert.ok(q.includes('EGX30 daily swing history, EGX30 weekly swing history'));
  assert.ok(q.includes('market breadth, rates and macro, events calendar'));
  assert.ok(!q.includes('"structure"'));
});

test('swing levels join the zones with the existing weights', () => {
  const z = withZones(FIXTURE_INDICES, EXTRAS)[0].zones.find((s) => s.sources.some((x) => x.name === 'Swing high 6 Sep'));
  assert.deepEqual([z.lo, z.hi, z.score, z.role], [1200, 1210, 3, 'resistance']);
  const p = indicesPrompt(withZones(FIXTURE_INDICES, EXTRAS), FIXTURE_STRATEGY, FIXTURE_NEWS, EXTRAS);
  assert.ok(p.includes('Swing high 6 Sep W'));
  // EGX70 has no history in EXTRAS: its zones are unchanged
  assert.deepEqual(withZones(FIXTURE_INDICES, EXTRAS)[1], withZones(FIXTURE_INDICES)[1]);
});

test('swing levels between two zones never join them into one (A/B run 2: EGX30 block 3.3 ATR wide)', () => {
  // Fixture EGX30: EMA50 1100 and Pivot R1 1200 are 1 ATR apart, so two zones. Swings at 1140 and 1160 sit between.
  const x = { ...EXTRAS, parts: { ...EXTRAS.parts, history: { EGX30: { levels: [
    { name: 'Swing high 21 Oct', tf: 'D', value: 1140 }, { name: 'Swing low 30 Jul', tf: 'D', value: 1160 },
  ], structure: STRUCT } } } };
  const res = withZones(FIXTURE_INDICES, x)[0].zones.filter((z) => z.role === 'resistance');
  assert.deepEqual(res.map((z) => [z.lo, z.hi]), [[1160, 1200], [1100, 1140]]);
});

const analyzeStub = (seen) => async (indices, model, opts) => {
  seen.push(opts);
  return { indices: indices.map((x) => ({ ...x, ai: null })), overall: null, cost_usd: 0.1 };
};
const snap = (opts) => buildIndicesSnapshot(FIXTURE_INDICES, 'm', { now: () => new Date(0), getNews: async () => FIXTURE_NEWS, ...opts });

test('snapshot: a throwing or hanging getExtras changes nothing but esthmr', async () => {
  const base = await snap({ analyze: analyzeStub([]) });
  assert.deepEqual(base.esthmr, { ok: false, failed: [] });
  const thrown = await snap({ analyze: analyzeStub([]), getExtras: async () => { throw new Error('down'); } });
  assert.deepEqual(thrown, base);
  const t0 = Date.now();
  const hung = await snap({ analyze: analyzeStub([]), getExtras: () => new Promise(() => {}), extrasTimeoutMs: 20 });
  assert.ok(Date.now() - t0 < 500);
  assert.deepEqual(hung, base);
});

test('snapshot with extras: analyze gets them, zones carry swings, only the status is stored', async () => {
  const seen = [];
  const x = { ...EXTRAS, status: { ok: true, failed: ['events'] } };
  const s = await snap({ analyze: analyzeStub(seen), getExtras: async () => x });
  assert.equal(seen[0].extras, x);
  assert.equal(seen[0].news, FIXTURE_NEWS);
  assert.ok(s.indices[0].zones.some((z) => z.sources.some((y) => y.name === 'Swing high 6 Sep')));
  assert.deepEqual(s.esthmr, { ok: true, failed: ['events'] });
  assert.deepEqual(Object.keys(s).sort(), ['ai_error', 'cost_usd', 'esthmr', 'indices', 'model', 'news', 'overall', 'timestamp']);
  const j = JSON.stringify(s);
  for (const k of ['"parts"', '"flows"', '"history"', '"structure"', 'EGP millions']) assert.ok(!j.includes(k), k);
});

test('analyzeIndices puts the extras block in the prompt', async () => {
  let prompt;
  const run = async (p) => { prompt = p; return { text: '{"indices":[],"overall":null}', cost_usd: 0 }; };
  await analyzeIndices(withZones(FIXTURE_INDICES, EXTRAS), 'm', { run, strategy: '', news: FIXTURE_NEWS, extras: EXTRAS });
  assert.match(prompt, /MARKET EXTRAS/);
  await analyzeIndices(withZones(FIXTURE_INDICES), 'm', { run, strategy: '', news: FIXTURE_NEWS });
  assert.doesNotMatch(prompt, /MARKET EXTRAS/);
});
