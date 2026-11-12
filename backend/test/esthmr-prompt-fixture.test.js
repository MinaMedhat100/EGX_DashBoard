import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { indicesPrompt, withZones } from '../services/analystService.js';
import { FIXTURE_INDICES, FIXTURE_STRATEGY, FIXTURE_NEWS } from './fixtures/indices-prompt-input.js';

// The prompt with ESTHMR off (v2.10.0 plus the v2.11.0 index-count line); stored as JSON so git's line-ending conversion can't change it.
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/indices-prompt-esthmr-off.json', import.meta.url), 'utf-8'));

test('ESTHMR-off prompt fixture matches the current prompt byte for byte', () => {
  const p = indicesPrompt(withZones(FIXTURE_INDICES), FIXTURE_STRATEGY, FIXTURE_NEWS);
  assert.equal(p, FIXTURE.prompt);
});
