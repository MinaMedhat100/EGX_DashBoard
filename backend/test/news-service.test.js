import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getNews, getNewsResult } from '../services/newsService.js';

const RSS = `<rss><channel><item>
  <title>Egypt aluminium smelter plan advances - Mining Weekly</title>
  <link>https://example.com/a</link>
  <pubDate>Mon, 14 Sep 2026 07:00:00 GMT</pubDate>
  <source>Mining Weekly</source>
</item></channel></rss>`;

async function withFetch(impl, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await fn(); } finally { globalThis.fetch = real; }
}

test('getNewsResult returns items and no error when the feed answers', async () => {
  await withFetch(async () => ({ ok: true, status: 200, text: async () => RSS }), async () => {
    const r = await getNewsResult('ALUM');
    assert.equal(r.error, null);
    assert.equal(r.items[0].headline, 'Egypt aluminium smelter plan advances');
  });
});

test('getNewsResult reports an error when the feed failed and nothing was found', async () => {
  await withFetch(async () => ({ ok: false, status: 503, text: async () => '' }), async () => {
    const r = await getNewsResult('ALUM');
    assert.deepEqual(r.items, []);
    assert.match(r.error, /503/);
  });
});

test('a quiet news week is not an error', async () => {
  const empty = '<rss><channel></channel></rss>';
  await withFetch(async () => ({ ok: true, status: 200, text: async () => empty }), async () => {
    const r = await getNewsResult('ALUM');
    assert.deepEqual(r.items, []);
    assert.equal(r.error, null);
  });
});

test('getNews still returns a bare array', async () => {
  await withFetch(async () => ({ ok: true, status: 200, text: async () => RSS }), async () => {
    const items = await getNews('ALUM');
    assert.ok(Array.isArray(items));
    assert.equal(items.length, 1);
  });
});
