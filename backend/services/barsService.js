// barsService.js — Yahoo daily bars for EGX tickers (<TICKER>.CA), cached once per day in
// backend/data/bars_cache.json (gitignored). Daily history only: Yahoo's live quote is broken for EGX.
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BARS_FILE = path.join(__dirname, '..', 'data', 'bars_cache.json');

// Market control for "did the whole market move?" — ^CASE30 has no usable Yahoo history.
// All 12 verified on Yahoo 2026-10-01 (496 daily bars each, current to the day).
export const MARKET_BASKET = ['COMI', 'TMGH', 'SWDY', 'EAST', 'ETEL', 'ABUK', 'HRHO', 'FWRY', 'ORAS', 'AMOC', 'JUFO', 'EFIH'];

const yahooUrl = (t) => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}.CA?interval=1d&range=2y`;
const isoToday = () => new Date().toISOString().slice(0, 10);

export function parseYahoo(payload) {
  const res = payload?.chart?.result?.[0];
  if (!res?.timestamp?.length) return null;
  const q = res.indicators?.quote?.[0] ?? {};
  const bars = [];
  res.timestamp.forEach((ts, i) => {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if ([o, h, l, c].some((v) => v == null)) return;
    bars.push({ date: new Date(ts * 1000).toISOString().slice(0, 10), open: o, high: h, low: l, close: c });
  });
  return bars.length ? bars : null;
}

export function createBarsService({ file = BARS_FILE, fetchImpl = globalThis.fetch, today = isoToday } = {}) {
  let cache = null;
  let saving = Promise.resolve();

  async function load() {
    if (cache) return cache;
    try { cache = JSON.parse(await readFile(file, 'utf-8')); }
    catch (e) {
      if (e.code !== 'ENOENT') console.error('[bars] cache unreadable, starting fresh:', e.message);
      cache = {};
    }
    return cache;
  }

  function save() {
    saving = saving.then(async () => {
      const tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify(cache), 'utf-8');
      await rename(tmp, file);
    });
    return saving;
  }

  async function getBars(ticker) {
    const t = String(ticker).toUpperCase();
    const c = await load();
    const hit = c[t];
    if (hit && hit.fetched_on === today()) return hit.none ? { none: true } : { bars: hit.bars };
    const r = await fetchImpl(yahooUrl(t), { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok && r.status !== 404) throw new Error(`yahoo ${t}: HTTP ${r.status}`);
    const bars = r.ok ? parseYahoo(await r.json()) : null;
    c[t] = bars ? { fetched_on: today(), bars } : { fetched_on: today(), none: true };
    await save();
    return bars ? { bars } : { none: true };
  }

  return { getBars };
}

export const bars = createBarsService();
