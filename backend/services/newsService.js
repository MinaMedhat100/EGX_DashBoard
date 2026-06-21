// newsService.js — best-effort EGX news via Google News RSS (auth-free), merged with bridge news.
// (yahoo-finance2 v2.14 here exposes no search/news method, and Yahoo rate-limits, so we don't use it.)
import { bridge } from './bridgeClient.js';

// Known EGX ticker -> company name (better news queries). Unknowns fall back to "<TICKER> EGX".
const EGX_NAMES = {
  RAYA: 'Raya Holding',
  SIPC: 'Sinai Pharmaceuticals',
  ALUM: 'Aluminium Products Egypt',
  CANA: 'Canal Sugar',
  COMI: 'Commercial International Bank Egypt',
  TMGH: 'Talaat Mostafa Group',
  FWRY: 'Fawry Egypt',
  EFIH: 'EFG Hermes',
  JUFO: 'Juhayna Egypt',
  OCDI: 'SODIC Egypt',
  OBRI: 'Orascom Egypt',
  BIOC: 'Egypt stock',
  BAL: 'Balad Real Estate Egypt',
  CCB: 'Cairo Capital Brokerage Egypt',
  EGX30ETF: 'EGX 30 index',
};

function decode(s) {
  return s
    ? s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .trim()
    : s;
}

function parseRss(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) && items.length < 10) {
    const block = m[1];
    const pick = (re) => {
      const x = re.exec(block);
      return x ? x[1] : null;
    };
    const title = decode(pick(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/));
    const link = pick(/<link>([\s\S]*?)<\/link>/);
    const pub = pick(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const source = decode(pick(/<source[^>]*>([\s\S]*?)<\/source>/));
    if (title) items.push({ title, link, pub, source });
  }
  return items;
}

async function googleNews(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRss(xml).map((it) => {
      let headline = it.title;
      if (it.source && headline.endsWith(` - ${it.source}`)) {
        headline = headline.slice(0, -(it.source.length + 3));
      }
      return {
        headline,
        time: it.pub && !Number.isNaN(Date.parse(it.pub)) ? new Date(it.pub).toISOString() : null,
        url: it.link,
        sentiment: null,
        source: it.source ? `google:${it.source}` : 'google',
      };
    });
  } catch {
    return [];
  }
}

export async function getNews(ticker) {
  const key = (ticker || '').toUpperCase();
  const name = EGX_NAMES[key];
  const query = name ? `${name} Egypt stock` : `${ticker} EGX Egypt stock`;

  const collected = [...(await googleNews(query))];

  // bridge (MCP financial_news) — usually empty for EGX, merge whatever exists.
  try {
    const b = await bridge.news(ticker);
    for (const i of b.items || []) {
      collected.push({ headline: i.headline, time: i.time, url: i.url, sentiment: i.sentiment, source: 'mcp' });
    }
  } catch {
    /* bridge optional */
  }

  // dedupe by headline prefix, cap at 5
  const seen = new Set();
  const out = [];
  for (const item of collected) {
    const k = (item.headline || '').toLowerCase().slice(0, 60);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
    if (out.length >= 5) break;
  }
  return out;
}
