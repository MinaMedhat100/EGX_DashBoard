import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opportunityPrompt, finalizeOpportunities } from '../services/analystService.js';

const cands = [{ ticker: 'AAA' }, { ticker: 'BBB' }, { ticker: 'CCC' }];

test('market prompt asks for up to 8 and has no sector-echo rule', () => {
  const p = opportunityPrompt(cands, {}, [], '', 'market');
  assert.match(p, /up to 8 best/i);
  assert.doesNotMatch(p, /HAND-PICKED/);
});

test('watchlist prompt ranks all, excludes nothing, and adds the sector-echo rule', () => {
  const p = opportunityPrompt(cands, {}, [], '', 'watchlist');
  assert.match(p, /HAND-PICKED/);
  assert.match(p, /do not cap/i);
  assert.match(p, /"sector"/);
  assert.match(p, /AAA/);
  assert.match(p, /CCC/);
});

test('finalizeOpportunities caps market to 8 but keeps all in watchlist mode', () => {
  const arr = Array.from({ length: 12 }, (_, i) => ({ ticker: `T${i}` }));
  assert.equal(finalizeOpportunities(arr, 'market').length, 8);
  assert.equal(finalizeOpportunities(arr, 'watchlist').length, 12);
});
