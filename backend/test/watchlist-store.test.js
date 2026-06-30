import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { normalizeTickers, load, save } from '../services/watchlistStore.js';

test('normalizeTickers uppercases, trims, dedupes, drops blanks, preserves order', () => {
  assert.deepEqual(
    normalizeTickers(['comi', ' swdy ', 'COMI', '', '  ', 'egas']),
    ['COMI', 'SWDY', 'EGAS'],
  );
});

test('normalizeTickers accepts a comma/newline string', () => {
  assert.deepEqual(normalizeTickers('comi, swdy\negas'), ['COMI', 'SWDY', 'EGAS']);
});

test('load returns empty list when the file is missing', async () => {
  const file = path.join(tmpdir(), `wl-${randomUUID()}.json`);
  assert.deepEqual(await load(file), { tickers: [] });
});

test('save then load round-trips the normalized list', async () => {
  const file = path.join(tmpdir(), `wl-${randomUUID()}.json`);
  try {
    const saved = await save(['comi', 'comi', 'swdy'], file);
    assert.deepEqual(saved, { tickers: ['COMI', 'SWDY'] });
    assert.deepEqual(await load(file), { tickers: ['COMI', 'SWDY'] });
  } finally {
    await rm(file, { force: true });
  }
});
