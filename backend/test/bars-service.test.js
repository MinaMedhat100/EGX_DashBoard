import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseYahoo, createBarsService } from '../services/barsService.js';

const payload = (rows) => ({
  chart: { result: [{
    timestamp: rows.map((r) => Date.parse(`${r[0]}T07:00:00Z`) / 1000),
    indicators: { quote: [{ open: rows.map((r) => r[1]), high: rows.map((r) => r[2]), low: rows.map((r) => r[3]), close: rows.map((r) => r[4]) }] },
  }] },
});
const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });

test('parseYahoo: oldest first, null bars dropped, UTC dates', () => {
  const bars = parseYahoo(payload([['2026-09-01', 10, 11, 9, 10.5], ['2026-09-02', null, 11, 9, 10], ['2026-09-03', 10, 12, 10, 11]]));
  assert.deepEqual(bars, [
    { date: '2026-09-01', open: 10, high: 11, low: 9, close: 10.5 },
    { date: '2026-09-03', open: 10, high: 12, low: 10, close: 11 },
  ]);
  assert.equal(parseYahoo({ chart: { result: null } }), null);
  assert.equal(parseYahoo({ chart: { result: [{ timestamp: [] }] } }), null);
});

async function tmpFile() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bars-test-'));
  return { dir, file: path.join(dir, 'bars_cache.json') };
}

test('getBars fetches once per day and caches to file atomically', async () => {
  const { dir, file } = await tmpFile();
  let calls = 0, day = '2026-10-01';
  const fetchImpl = async (url) => { calls++; assert.match(url, /BRKT\.CA\?interval=1d&range=2y$/); return okResponse(payload([['2026-09-01', 10, 11, 9, 10.5]])); };
  const svc = createBarsService({ file, fetchImpl, today: () => day });
  assert.equal((await svc.getBars('brkt')).bars.length, 1);
  await svc.getBars('BRKT');
  assert.equal(calls, 1);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(saved.BRKT.fetched_on, '2026-10-01');
  assert.deepEqual(await readdir(dir), ['bars_cache.json']);
  day = '2026-10-02';
  await svc.getBars('BRKT');
  assert.equal(calls, 2);
  const fresh = createBarsService({ file, fetchImpl, today: () => day }); // reads the file cache
  await fresh.getBars('BRKT');
  assert.equal(calls, 2);
});

test('getBars: 404 or empty history is {none:true}; other HTTP errors throw', async () => {
  const { file } = await tmpFile();
  const svc = createBarsService({ file, today: () => '2026-10-01', fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) }) });
  assert.deepEqual(await svc.getBars('CLSC'), { none: true });
  const svc2 = createBarsService({ file, today: () => '2026-10-01', fetchImpl: async () => okResponse({ chart: { result: null } }) });
  assert.deepEqual(await svc2.getBars('MKTA'), { none: true });
  const bad = createBarsService({ file, today: () => '2026-10-01', fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
  await assert.rejects(bad.getBars('MKTB'), /HTTP 500/);
});
