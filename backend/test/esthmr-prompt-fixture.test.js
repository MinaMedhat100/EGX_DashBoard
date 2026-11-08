import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { indicesPrompt, withZones } from '../services/analystService.js';
import { FIXTURE_INDICES, FIXTURE_STRATEGY, FIXTURE_NEWS } from './fixtures/indices-prompt-input.js';

// Generated once from v2.10.0; stored as JSON so git's line-ending conversion can't change it.
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/indices-prompt-v2.10.0.json', import.meta.url), 'utf-8'));

test('v2.10.0 prompt fixture matches the current prompt byte for byte', () => {
  const p = indicesPrompt(withZones(FIXTURE_INDICES), FIXTURE_STRATEGY, FIXTURE_NEWS);
  assert.equal(p, FIXTURE.prompt);
});
