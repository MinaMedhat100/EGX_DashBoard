// scan.js — POST /api/scan-opportunities (bridge screener -> AI ranking).
import { Router } from 'express';
import { load } from '../services/portfolioStore.js';
import { bridge } from '../services/bridgeClient.js';
import { analyzeOpportunities, DEFAULT_MODEL } from '../services/analystService.js';
import { gatherNews, latestRegime } from '../services/aiContext.js';
import { appendRun, listRuns, getRun, clearRuns } from '../services/scanHistoryStore.js';

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
    let opportunities = [];
    let fallback = false;
    let aiError = null;
    // Skip the AI call entirely when the screener returned nothing (e.g. pre-market).
    if (candidates && candidates.length) {
      try {
        const [news, regime] = await Promise.all([
          gatherNews((candidates || []).map((c) => c.ticker)), latestRegime(),
        ]);
        opportunities = await analyzeOpportunities(candidates, market, exclude, model, { context: { news, regime } });
        if (!opportunities?.length) throw new Error('empty AI result');
      } catch (e) {
        aiError = aiFailureReason(e);
        console.error(`[scan] AI ranking failed, using deterministic fallback: ${e?.message ?? e}`);
        opportunities = deterministicRank(scan.candidates, 8, aiError);
        fallback = true;
      }
    }

    // attach the bridge's multi-timeframe summary to each opportunity (by ticker)
    const mtfByTicker = new Map(
      (scan.candidates || []).map((c) => [c.ticker, c.indicators?.mtf ?? null]),
    );
    for (const o of opportunities) {
      if (o && o.ticker && mtfByTicker.has(o.ticker)) o.mtf = mtfByTicker.get(o.ticker);
    }

    const run = await appendRun({
      params,
      model,
      opportunities,
      market,
      ai_fallback: fallback,
      ai_error: aiError,
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
    let opportunities = [];
    let fallback = false;
    let aiError = null;
    if (candidates.length) {
      try {
        const [news, regime] = await Promise.all([
          gatherNews(candidates.map((c) => c.ticker)), latestRegime(),
        ]);
        opportunities = await analyzeOpportunities(candidates, market, [], model, { mode: 'watchlist', context: { news, regime } });
        if (!opportunities?.length) throw new Error('empty AI result');
      } catch (e) {
        aiError = aiFailureReason(e);
        console.error(`[scan-watchlist] AI ranking failed, using deterministic fallback: ${e?.message ?? e}`);
        opportunities = deterministicRank(candidates, candidates.length, aiError); // no cap for watchlist
        fallback = true;
      }
    }

    // attach passes_filter + mtf onto each opportunity by ticker
    const byTicker = new Map(candidates.map((c) => [c.ticker, c]));
    for (const o of opportunities) {
      const c = byTicker.get(o.ticker);
      if (c) {
        o.passes_filter = c.passes_filter;
        o.mtf = c.indicators?.mtf ?? null;
      }
    }

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
