import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { load, save } from '../services/indicesStore.js';

test('load returns null when no snapshot exists', async () => {
  const file = path.join(tmpdir(), `idx-${randomUUID()}.json`);
  assert.equal(await load(file), null);
});

test('save then load round-trips the snapshot', async () => {
  const file = path.join(tmpdir(), `idx-${randomUUID()}.json`);
  const snap = { timestamp: 't', model: 'opus', overall: { regime: 'Risk-On' }, indices: [{ index: 'EGX30' }] };
  try {
    assert.deepEqual(await save(snap, file), snap);
    assert.deepEqual(await load(file), snap);
  } finally {
    await rm(file, { force: true });
  }
});
