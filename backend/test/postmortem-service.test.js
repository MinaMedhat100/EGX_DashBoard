import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strategyForPostmortem, buildPostmortemPrompt, validatePostmortem, analyzeTrade } from '../services/postmortemService.js';

const STRAT = '# S\n## Entry Rules\nbuy pullbacks\n## Realized P&L Log (as of May 2026)\nBRKT +500\n## Risk\nrisk 1%\n';
const trade = {
  trade_id: 'BRKT-1', ticker: 'BRKT',
  events: [
    { kind: 'order', type: 'STOP_OUT', date: '2026-09-21', at: '2026-10-01T10:00:00Z', price: 9 },
    { kind: 'ai_read', at: '2026-09-28T00:00:00Z', analyzed_at: '2026-09-20T00:00:00Z', thesis: 'x'.repeat(900), key_risk: 'k' },
  ],
};
const good = {
  verdict: 'normal_variance', stage: 'management', summary: 's', evidence: ['a', 'b', 'c', 'd', 'e', 'f'],
  counterfactual: 'none', lesson: { category: 'stop_placement', text: 't', applies_to_winners: false }, confidence: 9,
};

test('strategyForPostmortem drops only the realized P&L log section', () => {
  const s = strategyForPostmortem(STRAT);
  assert.ok(!s.includes('BRKT +500'));
  assert.ok(s.includes('buy pullbacks') && s.includes('risk 1%'));
});

test('prompt: strategy, events in real order, trimmed thesis, note, evidence', () => {
  const p = buildPostmortemPrompt({ strategy: 'STRAT', trade, note: 'stop was not active', evidence: { entry: { atr: 1 } } });
  assert.ok(p.includes('STRAT'));
  assert.ok(p.indexOf('"ai_read"') < p.indexOf('"STOP_OUT"'));
  assert.ok(!p.includes('x'.repeat(601)));
  assert.ok(p.includes('stop was not active'));
  assert.ok(p.includes('"atr":1'));
  const none = buildPostmortemPrompt({ strategy: 'S', trade, note: null, evidence: {} });
  assert.ok(none.includes('(no note)'));
});

test('validatePostmortem: clamps, trims, unknown category → none, corporate override', () => {
  const r = validatePostmortem(good, { data: { corporate_action: false } });
  assert.equal(r.confidence, 5);
  assert.equal(r.evidence.length, 5);
  const odd = validatePostmortem({ ...good, lesson: { ...good.lesson, category: 'vibes' } }, {});
  assert.equal(odd.lesson.category, 'none');
  assert.equal(odd.lesson.category_raw, 'vibes');
  const corp = validatePostmortem(good, { data: { corporate_action: { date: '2026-09-01', gap_pct: -50 } } });
  assert.equal(corp.verdict, 'missing_data');
  assert.equal(corp.verdict_raw, 'normal_variance');
  assert.throws(() => validatePostmortem({ ...good, verdict: 'great' }, {}), /verdict/);
  assert.throws(() => validatePostmortem({ ...good, stage: 'later' }, {}), /stage/);
});

test('analyzeTrade: isolated call, sums cost, retries once on unreadable output', async () => {
  const calls = [];
  const replies = ['not json at all', JSON.stringify(good)];
  const run = async (prompt, model, opts) => { calls.push(opts); return { text: replies.shift(), cost_usd: 0.1 }; };
  const out = await analyzeTrade({ trade, evidence: {}, strategy: 'S', note: null }, { run, model: 'm' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].isolated, true);
  assert.equal(calls[0].envelope, true);
  assert.equal(out.cost_usd, 0.2);
  assert.equal(out.model, 'm');
  assert.equal(out.result.verdict, 'normal_variance');
});

test('analyzeTrade: fails after the second unreadable reply', async () => {
  const run = async () => ({ text: '{"verdict":"nope"}', cost_usd: 0.1 });
  await assert.rejects(analyzeTrade({ trade, evidence: {}, strategy: 'S', note: null }, { run, model: 'm' }), /could not be read/);
});
