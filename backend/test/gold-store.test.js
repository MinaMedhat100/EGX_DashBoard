import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { emptyGoldState, load, save } from '../services/goldStore.js';

test('emptyGoldState is a flat, position-less state', () => {
  assert.deepEqual(emptyGoldState(), {
    snapshot: null, position: null, realized_pnl_usd: 0, action_log: [],
  });
});

test('load returns the empty state when the file is missing', async () => {
  const file = path.join(tmpdir(), `gold-${randomUUID()}.json`);
  assert.deepEqual(await load(file), emptyGoldState());
});

test('save then load round-trips the state', async () => {
  const file = path.join(tmpdir(), `gold-${randomUUID()}.json`);
  const state = { snapshot: { timestamp: 't' }, position: { shares: 2, avg_cost: 4000 }, realized_pnl_usd: 12.5, action_log: [{ id: 'x' }] };
  try {
    assert.deepEqual(await save(state, file), state);
    assert.deepEqual(await load(file), state);
  } finally {
    await rm(file, { force: true });
  }
});
