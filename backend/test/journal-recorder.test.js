import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordJournal } from '../services/journalRecorder.js';
import { emptyJournal } from '../services/journalService.js';

function memStore(delayMs = 0) {
  let doc = emptyJournal();
  const wait = () => new Promise((r) => setTimeout(r, delayMs));
  return {
    get doc() { return doc; },
    async loadJournal() { await wait(); return JSON.parse(JSON.stringify(doc)); },
    async saveJournal(j) { await wait(); doc = j; },
  };
}

test('recordJournal applies and saves, returning null', async () => {
  const s = memStore();
  const w = await recordJournal((j) => j.trades.push({ trade_id: 'T1' }), s);
  assert.equal(w, null);
  assert.equal(s.doc.trades.length, 1);
});

test('a failing store returns a warning instead of throwing', async () => {
  const w = await recordJournal(() => {}, {
    loadJournal: async () => { throw new Error('disk full'); },
    saveJournal: async () => {},
  });
  assert.match(w, /Trade journal not updated: disk full/);
});

test('concurrent writes are serialised so neither is lost', async () => {
  const s = memStore(5);
  await Promise.all([
    recordJournal((j) => j.trades.push({ trade_id: 'A' }), s),
    recordJournal((j) => j.trades.push({ trade_id: 'B' }), s),
  ]);
  assert.deepEqual(s.doc.trades.map((t) => t.trade_id).sort(), ['A', 'B']);
});
