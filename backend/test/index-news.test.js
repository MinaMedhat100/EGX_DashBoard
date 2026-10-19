import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexNews, INDEX_NEWS_QUERIES, INDEX_NEWS_MAX_AGE_DAYS, INDEX_NEWS_CAP } from '../services/aiContext.js';

const NOW = Date.parse('2026-10-18T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (days) => new Date(NOW - days * DAY).toISOString();
const item = (headline, days, source = 'google:Reuters') =>
  ({ headline, time: days == null ? null : ago(days), url: days == null ? null : `https://news.example/${encodeURIComponent(headline)}`, sentiment: null, source });
const Q = INDEX_NEWS_QUERIES;
const byQuery = (map) => async (q) => ({ items: map[q] || [], error: null });

test('constants', () => {
  assert.equal(Q.length, 5);
  assert.deepEqual(Q, ['Egyptian stock exchange EGX', 'EGX30 Egyptian Exchange', 'Egypt central bank interest rate', 'Egyptian pound dollar', 'Egypt economy IMF']);
  assert.equal(INDEX_NEWS_MAX_AGE_DAYS, 14);
  assert.equal(INDEX_NEWS_CAP, 12);
});

test('merges the queries, dedupes, drops stale, sorts newest first, numbers N1…', async () => {
  const r = await indexNews(byQuery({
    [Q[0]]: [item('Egypt stocks slump on regional jitters', 0), item('An old story', 20)],
    [Q[1]]: [item('EGYPT STOCKS SLUMP ON REGIONAL JITTERS', 0.5), item('EGX30 drops 2.6%', 0.2)],
    [Q[2]]: [item('Central bank holds rates', 10)],
    [Q[3]]: [item('Undated piece', null)],
  }), NOW);
  assert.equal(r.error, null);
  assert.deepEqual(r.items.map((i) => [i.id, i.headline]), [
    ['N1', 'Egypt stocks slump on regional jitters'],
    ['N2', 'EGX30 drops 2.6%'],
    ['N3', 'Central bank holds rates'],
    ['N4', 'Undated piece'],
  ]);
  assert.equal(r.items[0].source, 'Reuters');
  assert.equal(r.items[0].age, 'just now');
  assert.equal(r.items[2].age, '10d');
  assert.equal(r.items[3].time, null);
  assert.equal(r.items[3].url, null);
  assert.equal(r.items[3].age, null);
});

test('14-day cut-off', async () => {
  const r = await indexNews(byQuery({ [Q[0]]: [item('Inside the window', 13.9), item('Outside the window', 14.1)] }), NOW);
  assert.deepEqual(r.items.map((i) => i.headline), ['Inside the window']);
});

test('caps at 12', async () => {
  const many = Array.from({ length: 20 }, (_, i) => item(`Distinct headline number ${i}`, i * 0.1));
  const r = await indexNews(byQuery({ [Q[0]]: many }), NOW);
  assert.equal(r.items.length, 12);
  assert.equal(r.items[11].id, 'N12');
});

test('every query failing is an error; one failing is not', async () => {
  const allFail = await indexNews(async () => ({ items: [], error: 'news feed HTTP 503' }), NOW);
  assert.deepEqual(allFail, { items: [], error: 'news lookup failed' });
  const allThrow = await indexNews(async () => { throw new Error('offline'); }, NOW);
  assert.deepEqual(allThrow, { items: [], error: 'news lookup failed' });
  const oneFails = await indexNews(async (q) => {
    if (q === Q[0]) throw new Error('offline');
    return { items: [], error: null };
  }, NOW);
  assert.deepEqual(oneFails, { items: [], error: null });
});
