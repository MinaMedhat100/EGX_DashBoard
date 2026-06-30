import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indicesPrompt, mergeIndexAi } from '../services/analystService.js';

test('indicesPrompt lists each index and asks for a regime JSON', () => {
  const p = indicesPrompt([{ index: 'EGX30' }, { index: 'EGX70' }], '');
  assert.match(p, /EGX30/);
  assert.match(p, /EGX70/);
  assert.match(p, /regime/);
  assert.match(p, /Risk-On/);
});

test('mergeIndexAi attaches ai by index name and carries overall', () => {
  const indices = [{ index: 'EGX30', level: 1 }, { index: 'EGX70', level: 2 }];
  const ai = { indices: [{ index: 'EGX30', regime: 'Risk-On' }], overall: { regime: 'Neutral' } };
  const out = mergeIndexAi(indices, ai);
  assert.equal(out.indices[0].ai.regime, 'Risk-On');
  assert.equal(out.indices[1].ai, null);
  assert.equal(out.overall.regime, 'Neutral');
});

test('mergeIndexAi tolerates a null AI result', () => {
  const out = mergeIndexAi([{ index: 'EGX30' }], null);
  assert.equal(out.indices[0].ai, null);
  assert.equal(out.overall, null);
});
