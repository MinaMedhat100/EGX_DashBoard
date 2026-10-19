// aiContext.js — best-effort gathering of AI decision context (news + regime). Never throws.
import { getNews, getNewsResult, newsForQuery, newsForQueryResult } from './newsService.js';
import * as indicesStore from './indicesStore.js';

export const REGIME_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000; // regime older than 2 days -> "unknown"
const NEWS_CAP = 4;

// A 431-day-old article reached a prompt in August 2026. Older than this is history, not a
// catalyst. NOTE: this filter is for the PROMPT path only — /api/news still shows everything,
// because a two-month-old headline is still worth reading.
export const NEWS_MAX_AGE_DAYS = 30;
const NEWS_MAX_AGE_MS = NEWS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

function fresh(item, now) {
  if (!item?.time) return true; // undated -> keep it, age shows as null
  const t = Date.parse(item.time);
  return Number.isNaN(t) ? true : now - t <= NEWS_MAX_AGE_MS;
}

export function relAge(iso, now = Date.now()) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const h = Math.floor((now - t) / (60 * 60 * 1000));
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const compact = (items, now = Date.now()) =>
  (items || [])
    .filter((i) => fresh(i, now))
    .slice(0, NEWS_CAP)
    .map((i) => ({ headline: i.headline, age: relAge(i.time, now) }));

// { TICKER: { items, error } } — used where the caller wants to know a lookup failed.
export async function gatherNewsResults(tickers, fetch = getNewsResult, now = Date.now()) {
  const uniq = [...new Set((tickers || []).map((t) => (t || '').toUpperCase()).filter(Boolean))];
  const out = {};
  await Promise.all(uniq.map(async (t) => {
    try {
      const r = await fetch(t);
      // an injected fetch may return a bare array (tests, and getNews itself) — normalize
      const norm = Array.isArray(r) ? { items: r, error: null } : (r || { items: [], error: null });
      out[t] = { items: compact(norm.items, now), error: norm.error ?? null };
    } catch {
      out[t] = { items: [], error: null };
    }
  }));
  return out;
}

// { TICKER: items[] } — the shape every prompt builder already expects. Unchanged.
export async function gatherNews(tickers, fetch = getNews, now = Date.now()) {
  const res = await gatherNewsResults(tickers, fetch, now);
  const out = {};
  for (const [k, v] of Object.entries(res)) out[k] = v.items;
  return out;
}

export async function goldMacroNews(fetch = newsForQuery, now = Date.now()) {
  try { return compact(await fetch('gold price forecast Fed dollar DXY'), now); } catch { return []; }
}

// ── Indices news pool (v2.10.0) ──────────────────────────────────────────────
// Index-name searches return years-old articles for EGX70/100 (probe, Oct 2026); market-wide and macro
// searches return fresh ones. One shared pool; the AI decides which headlines matter for which index.
export const INDEX_NEWS_QUERIES = [
  'Egyptian stock exchange EGX',
  'EGX30 Egyptian Exchange',
  'Egypt central bank interest rate',
  'Egyptian pound dollar',
  'Egypt economy IMF',
];
export const INDEX_NEWS_MAX_AGE_DAYS = 14;
export const INDEX_NEWS_CAP = 12;

export async function indexNews(fetch = newsForQueryResult, now = Date.now()) {
  const maxAge = INDEX_NEWS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const results = await Promise.all(INDEX_NEWS_QUERIES.map(async (q) => {
    try {
      const r = await fetch(q);
      return r && !r.error ? (r.items || []) : null; // null = this query failed
    } catch {
      return null;
    }
  }));
  if (results.every((r) => r === null)) return { items: [], error: 'news lookup failed' };

  const seen = new Set();
  const kept = [];
  for (const it of results.filter(Boolean).flat()) {
    const key = (it?.headline || '').toLowerCase().slice(0, 60);
    if (!key || seen.has(key)) continue;
    const t = it.time ? Date.parse(it.time) : NaN;
    if (!Number.isNaN(t) && now - t > maxAge) continue;
    seen.add(key);
    kept.push({ it, t });
  }
  kept.sort((a, b) => (Number.isNaN(b.t) ? -Infinity : b.t) - (Number.isNaN(a.t) ? -Infinity : a.t));
  return {
    items: kept.slice(0, INDEX_NEWS_CAP).map(({ it }, i) => ({
      id: `N${i + 1}`,
      headline: it.headline,
      source: (it.source || '').replace(/^google:/, '') || null,
      age: relAge(it.time, now),
      time: it.time ?? null,
      url: it.url ?? null,
    })),
    error: null,
  };
}

export async function latestRegime(load = indicesStore.load, now = Date.now()) {
  let snap;
  try { snap = await load(); } catch { return null; }
  if (!snap || !snap.overall || !snap.overall.regime) return null;
  const as_of = snap.timestamp ?? null;
  const t = as_of ? Date.parse(as_of) : NaN;
  const stale = Number.isNaN(t) ? true : now - t > REGIME_MAX_AGE_MS;
  return { regime: snap.overall.regime, summary: snap.overall.summary ?? '', as_of, stale };
}
