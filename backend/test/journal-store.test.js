import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadJournal, saveJournal } from '../services/journalStore.js';

async function tmpFile() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'journal-'));
  return path.join(dir, 'journal.json');
}

test('loadJournal: a missing file is an empty journal', async () => {
  assert.deepEqual(await loadJournal(await tmpFile()), { version: 1, trades: [] });
});

test('saveJournal then loadJournal round-trips', async () => {
  const file = await tmpFile();
  const j = { version: 1, trades: [{ trade_id: 'BRKT-2026-09-01-aaaa', events: [] }] };
  await saveJournal(j, file);
  assert.deepEqual(await loadJournal(file), j);
});

test('loadJournal: a corrupt file throws instead of silently starting over', async () => {
  const file = await tmpFile();
  await writeFile(file, '{not json', 'utf-8');
  await assert.rejects(loadJournal(file));
  await writeFile(file, '{"version":1}', 'utf-8');
  await assert.rejects(loadJournal(file), /no trades array/);
});
