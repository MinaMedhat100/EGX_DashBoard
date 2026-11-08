// Verification-only (v2.11.0 keep-or-drop): removed with scripts/esthmr-ab.js before merge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignLabels, unsupportedNumbers, renderHtml } from '../scripts/esthmr-ab.js';

test('assignLabels: both paths, opposite for opposite draws', () => {
  const a = assignLabels(() => 0.1);
  const b = assignLabels(() => 0.9);
  assert.deepEqual(new Set(Object.values(a)), new Set(['today', 'esthmr']));
  assert.deepEqual(new Set(Object.values(b)), new Set(['today', 'esthmr']));
  assert.notEqual(a.A, b.A);
});

test('unsupportedNumbers flags figures the prompt never had', () => {
  const prompt = '{"level": 51152.7, "eg": -193.5, "rsi": 45}';
  const indices = [{
    index: 'EGX30',
    ai: {
      headline: 'Holds 51,152.7 after foreigners bought 193.5m; also +193 and 777',
      zones: [{ id: 'Z3', note: 'Z3 held for 3 sessions' }],
      key_support: 51152.7,
      key_resistance: 52000,
    },
  }, { index: 'EGX70', ai: null }];
  const out = unsupportedNumbers(indices, prompt);
  assert.deepEqual(out.map((o) => [o.index, o.path, o.value]), [
    ['EGX30', 'headline', 777],
    ['EGX30', 'key_resistance', 52000],
  ]);
});

const SNAP = (headline) => ({
  overall: { regime: 'Neutral', summary: 'flat' },
  cost_usd: 0.3,
  indices: [{
    index: 'EGX30', level: 1000,
    zones: [{ id: 'Z1', lo: 1100, hi: 1110, role: 'resistance', score: 2, sources: [{ name: 'EMA50', tf: 'D', value: 1100 }] }],
    ai: {
      headline, regime: 'Neutral', trend: 'Neutral',
      trend_momentum: [{ label: 'Daily trend', read: 'Flat', tone: 'neutral', detail: 'd' }],
      breadth: { read: 'Mixed', tone: 'neutral', detail: 'b', leaders: [], laggards: [], note: 'n' },
      zones: [{ id: 'Z1', note: 'cap' }],
      scenarios: { bull: { trigger: 'close above', level: 1110, target: 1200, note: 'x' }, bear: null },
      for_me: { new_entries: 'wait', open_positions: 'hold', watch: 'Z1' },
      news: [{ id: 'N1', impact: 'neutral', why: 'w' }],
      likely: { side: 'range', confidence: 'low', reasons: ['r'] },
    },
  }],
});

test('renderHtml: two reads labelled only A and B, every AI string escaped', () => {
  const html = renderHtml('2026-11-05', { A: SNAP('<script>alert(1)</script>'), B: SNAP('Plain & simple') });
  assert.match(html, /Read A/);
  assert.match(html, /Read B/);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('Plain &amp; simple'));
  assert.ok(!html.includes('EMA50')); // source names are hidden: "Swing high…" would give the ESTHMR read away
  assert.ok(html.includes('1100–1110'));
  assert.ok(html.includes('2026-11-05'));
  assert.ok(!/esthmr|today/i.test(html));
});
