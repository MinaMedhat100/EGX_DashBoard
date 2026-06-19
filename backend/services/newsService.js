// newsService.js — Yahoo Finance (primary, EGX = "<TICKER>.CA") merged with bridge news.
import yahooFinance from 'yahoo-finance2';
import { bridge } from './bridgeClient.js';

// silence yahoo-finance2's one-time survey/notice logging
try { yahooFinance.suppressNotices?.(['yahooSurvey', 'ripHistorical']); } catch { /* noop */ }

async function yahooNews(query) {
  try {
    const r = await yahooFinance.search(query, { newsCount: 6, quotesCount: 0, enableFuzzyQuery: false });
    return (r.news || []).map((n) => ({
      headline: n.title,
      time: n.providerPublishTime ? new Date(n.providerPublishTime).toISOString() : null,
      url: n.link,
      sentiment: null,
      source: `yahoo:${n.publisher || 'news'}`,
    }));
  } catch {
    return [];
  }
}

export async function getNews(ticker) {
  const collected = [];

  // Yahoo: EGX symbols carry a .CA suffix; fall back to the bare ticker.
  collected.push(...(await yahooNews(`${ticker}.CA`)));
  if (collected.length === 0) collected.push(...(await yahooNews(ticker)));

  // Bridge (MCP financial_news) — usually empty for EGX, but merge whatever exists.
  try {
    const b = await bridge.news(ticker);
    for (const i of b.items || []) {
      collected.push({ headline: i.headline, time: i.time, url: i.url, sentiment: i.sentiment, source: 'mcp' });
    }
  } catch { /* bridge optional */ }

  // dedupe by headline prefix, cap at 5
  const seen = new Set();
  const out = [];
  for (const item of collected) {
    const key = (item.headline || '').toLowerCase().slice(0, 60);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= 5) break;
  }
  return out;
}
