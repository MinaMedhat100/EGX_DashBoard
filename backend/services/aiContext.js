// aiContext.js — best-effort gathering of AI decision context (news + regime). Never throws.
import { getNews, newsForQuery } from './newsService.js';
import * as indicesStore from './indicesStore.js';

export const REGIME_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000; // regime older than 2 days -> "unknown"
const NEWS_CAP = 4;

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
  (items || []).slice(0, NEWS_CAP).map((i) => ({ headline: i.headline, age: relAge(i.time, now) }));

export async function gatherNews(tickers, fetch = getNews, now = Date.now()) {
  const uniq = [...new Set((tickers || []).map((t) => (t || '').toUpperCase()).filter(Boolean))];
  const out = {};
  await Promise.all(uniq.map(async (t) => {
    try { out[t] = compact(await fetch(t), now); } catch { out[t] = []; }
  }));
  return out;
}

export async function goldMacroNews(fetch = newsForQuery, now = Date.now()) {
  try { return compact(await fetch('gold price forecast Fed dollar DXY'), now); } catch { return []; }
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
