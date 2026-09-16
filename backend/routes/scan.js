// scan.js — POST /api/scan-opportunities (bridge screener -> AI ranking).
import { Router } from 'express';
import { load } from '../services/portfolioStore.js';
import { bridge } from '../services/bridgeClient.js';
import { analyzeOpportunities, DEFAULT_MODEL } from '../services/analystService.js';
import { gatherNews, gatherNewsResults, latestRegime } from '../services/aiContext.js';
import { appendRun, listRuns, getRun, clearRuns, lookupPriorReads } from '../services/scanHistoryStore.js';
import { annotateEntries } from '../services/entryGuard.js';

const router = Router();

// The AI step used to fall back to the deterministic ranking silently, so an expired Claude login,
// a timeout and an unparseable reply all looked identical. Turn the error into a short reason the
// Opportunities page can show next to the fallback.
export function aiFailureReason(err) {
  const msg = String(err?.message ?? err ?? '').trim();
  if (!msg) return 'unknown AI error';
  if (/not logged in|\/login/i.test(msg)) return 'Claude CLI is not logged in — run `claude` in a terminal, then /login';
  if (/timed out/i.test(msg)) return 'Claude analysis timed out';
  if (/spawn claude failed|ENOENT/i.test(msg)) return 'Claude CLI not found on PATH';
  if (/empty AI result|empty model output|no JSON|bad claude envelope|JSON/i.test(msg)) return 'AI returned an unreadable result';
  return msg.slice(0, 160);
}

export function deterministicRank(candidates, cap = 8, reason = null) {
  const thesis = reason
    ? `(deterministic ranking — AI unavailable: ${reason})`
    : '(deterministic ranking — AI analysis unavailable)';
  return (candidates || [])
    .map((c) => ({
      ticker: c.ticker,
      sector: c.sector,
      price: c.indicators?.price,
      overextension: c.overextension ?? [],
      score: c.stock_score,
      tv_signal: c.indicators?.tv_signal,
      adx: c.indicators?.adx,
      plus_di: c.indicators?.plus_di,
      minus_di: c.indicators?.minus_di,
      rsi: c.indicators?.rsi,
      macd: c.indicators?.macd_histogram > 0 ? 'bullish' : 'bearish',
      entry_zone: c.suggested?.entry_zone,
      stop: c.suggested?.stop,
      t1: c.suggested?.t1,
      t2: c.suggested?.t2,
      t1_pct: c.suggested?.t1_pct,
      t2_pct: c.suggested?.t2_pct,
      rr: c.suggested?.rr,
      thesis,
      conviction: 3,
    }))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, cap);
}

router.post('/scan-opportunities', async (req, res, next) => {
  try {
    const body = req.body || {};
    const model = body.model || DEFAULT_MODEL;
    const data = await load();
    const held = data.positions.map((p) => p.ticker);
    const exclude = Array.from(new Set([...(body.exclude_tickers || []), ...held]));

    const params = {
      min_adx: body.min_adx ?? 35,
      min_di_gap: body.min_di_gap ?? 5,
      rsi_min: body.rsi_min ?? 40,
      rsi_max: body.rsi_max ?? 70,
      exclude_tickers: exclude,
      detail_limit: body.detail_limit ?? 12,
    };

    const [scan, market] = await Promise.all([
      bridge.scan(params),
      bridge.marketOverview().catch(() => null),
    ]);

    const candidates = scan.candidates?.length ? scan.candidates : scan.all_scanned;
    const tickers = (candidates || []).map((c) => c.ticker);
    // the AI's own previous read of each name — looked up before the AI call so the deterministic
    // fallback can still annotate a chased entry zone
    const priors = await lookupPriorReads(tickers);
    let opportunities = [];
    let fallback = false;
    let aiError = null;
    let newsUnavailable = false;
    // Skip the AI call entirely when the screener returned nothing (e.g. pre-market).
    if (candidates && candidates.length) {
      try {
        const [newsResults, regime] = await Promise.all([gatherNewsResults(tickers), latestRegime()]);
        const news = {};
        const newsErrors = {};
        for (const [t, r] of Object.entries(newsResults)) {
          news[t] = r.items;
          if (r.error) newsErrors[t] = r.error;
        }
        const failed = Object.keys(newsErrors).length;
        newsUnavailable = failed > 0 && failed === Object.keys(newsResults).length;
        opportunities = await analyzeOpportunities(candidates, market, exclude, model, {
          context: { news, regime, priors, news_errors: newsErrors },
        });
        if (!opportunities?.length) throw new Error('empty AI result');
      } catch (e) {
        aiError = aiFailureReason(e);
        console.error(`[scan] AI ranking failed, using deterministic fallback: ${e?.message ?? e}`);
        opportunities = deterministicRank(scan.candidates, 8, aiError);
        fallback = true;
      }
    }

    // Attach the bridge's per-candidate extras to each opportunity (by ticker). Build the map from
    // `candidates` — the array actually sent to the AI, which falls back to all_scanned when
    // nothing passes the filter — not scan.candidates, which is empty on a no-passers run.
    const byTicker = new Map((candidates || []).map((c) => [c.ticker, c]));
    const priceByTicker = {};
    for (const o of opportunities) {
      const c = o && o.ticker ? byTicker.get(o.ticker) : null;
      if (!c) continue;
      o.mtf = c.indicators?.mtf ?? null;
      o.overextension = c.overextension ?? [];
      if (c.indicators?.price != null) priceByTicker[o.ticker.toUpperCase()] = c.indicators.price;
    }
    annotateEntries(opportunities, priceByTicker, priors);

    const run = await appendRun({
      params,
      model,
      opportunities,
      market,
      ai_fallback: fallback,
      ai_error: aiError,
      news_unavailable: newsUnavailable,
      scanned: scan.scanned_count,
      passed: scan.passed_count,
      mode: 'market',
    });

    res.json({
      ok: true,
      run_id: run.id,
      params,
      opportunities,
      market,
      ai_fallback: fallback,
      ai_error: aiError,
      news_unavailable: newsUnavailable,
      note: scan.note ?? null,
      raw: { scanned: scan.scanned_count, passed: scan.passed_count },
      model,
      mode: 'market',
      timestamp: run.timestamp,
    });
  } catch (e) { next(e); }
});

router.post('/scan-watchlist', async (req, res, next) => {
  try {
    const body = req.body || {};
    const model = body.model || DEFAULT_MODEL;
    const tickers = Array.isArray(body.tickers) ? body.tickers : [];
    if (!tickers.length) return res.status(400).json({ ok: false, error: 'no tickers provided' });

    const params = {
      tickers,
      min_adx: body.min_adx ?? 35,
      min_di_gap: body.min_di_gap ?? 5,
      rsi_min: body.rsi_min ?? 40,
      rsi_max: body.rsi_max ?? 70,
    };

    const [scan, market] = await Promise.all([
      bridge.scanWatchlist(params),
      bridge.marketOverview().catch(() => null),
    ]);

    const candidates = scan.candidates || [];
    // NB: `tickers` above is the REQUESTED watchlist; these are the ones that actually resolved
    const candidateTickers = candidates.map((c) => c.ticker);
    const priors = await lookupPriorReads(candidateTickers);
    let opportunities = [];
    let fallback = false;
    let aiError = null;
    if (candidates.length) {
      try {
        const [news, regime] = await Promise.all([gatherNews(candidateTickers), latestRegime()]);
        opportunities = await analyzeOpportunities(candidates, market, [], model, { mode: 'watchlist', context: { news, regime, priors } });
        if (!opportunities?.length) throw new Error('empty AI result');
      } catch (e) {
        aiError = aiFailureReason(e);
        console.error(`[scan-watchlist] AI ranking failed, using deterministic fallback: ${e?.message ?? e}`);
        opportunities = deterministicRank(candidates, candidates.length, aiError); // no cap for watchlist
        fallback = true;
      }
    }

    // attach passes_filter + mtf + the board's entry numbers onto each opportunity by ticker
    const byTicker = new Map(candidates.map((c) => [c.ticker, c]));
    const priceByTicker = {};
    for (const o of opportunities) {
      const c = o && o.ticker ? byTicker.get(o.ticker) : null;
      if (!c) continue;
      o.passes_filter = c.passes_filter;
      o.mtf = c.indicators?.mtf ?? null;
      o.overextension = c.overextension ?? [];
      if (c.indicators?.price != null) priceByTicker[o.ticker.toUpperCase()] = c.indicators.price;
    }
    annotateEntries(opportunities, priceByTicker, priors);

    const run = await appendRun({
      params, model, opportunities, market, ai_fallback: fallback, ai_error: aiError,
      scanned: scan.scanned_count, passed: scan.passed_count,
      mode: 'watchlist', watchlist_tickers: tickers,
    });

    res.json({
      ok: true, run_id: run.id, params, opportunities, market,
      ai_fallback: fallback, ai_error: aiError, note: scan.note ?? null,
      raw: { scanned: scan.scanned_count, passed: scan.passed_count },
      model, mode: 'watchlist', timestamp: run.timestamp,
    });
  } catch (e) { next(e); }
});

// ── scan history ──────────────────────────────────────────────────────────────
router.get('/scan-history', async (_req, res, next) => {
  try {
    res.json({ runs: await listRuns() });
  } catch (e) { next(e); }
});

router.get('/scan-history/:id', async (req, res, next) => {
  try {
    const run = await getRun(req.params.id);
    if (!run) return res.status(404).json({ ok: false, error: 'run not found' });
    res.json(run);
  } catch (e) { next(e); }
});

router.delete('/scan-history', async (_req, res, next) => {
  try {
    await clearRuns();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
