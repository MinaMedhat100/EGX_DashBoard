// refresh.js — POST /api/refresh (live fetch + deterministic status) and
//              POST /api/analyze (AI portfolio analysis via headless claude).
import { Router } from 'express';
import { load, save, liquidTickers } from '../services/portfolioStore.js';
import { bridge } from '../services/bridgeClient.js';
import { evaluateStatus, buildAlert } from '../services/statusEngine.js';
import { analyzePortfolio, DEFAULT_MODEL } from '../services/analystService.js';
import { applyAiLevels, recomputeDerived, proposalDiffers } from '../services/levelService.js';
import { gatherNews, latestRegime } from '../services/aiContext.js';
import { portfolioStats } from '../services/portfolioStats.js';
import { ensureTradeId, levelsSnapshot, recordAiRead, todayIso } from '../services/journalService.js';
import { recordJournal } from '../services/journalRecorder.js';

const router = Router();

function fmtDailyChg(price, pct) {
  if (price == null || pct == null) return null;
  const egp = price - price / (1 + pct / 100);
  const s = (n) => (n >= 0 ? '+' : '') + n.toFixed(2);
  return `${s(egp)}  (${s(pct)}%)`;
}

// Merge bridge live data into positions, recompute P&L, status and alerts.
export function applyLive(data, live) {
  for (const p of data.positions) {
    if (!p.is_liquid) continue;
    const d = live?.[p.ticker];
    if (!d || d.error || d.price == null) continue;

    const prevDI = p.indicators
      ? { plus_di: p.indicators.plus_di, minus_di: p.indicators.minus_di }
      : null;

    p.live_price = d.price;
    p.daily_chg = fmtDailyChg(d.price, d.daily_change_pct);
    p.chg_pos = (d.daily_change_pct ?? 0) >= 0;
    p.adx = d.adx; p.plus_di = d.plus_di; p.minus_di = d.minus_di; p.rsi = d.rsi;
    p.macd_histogram = d.macd_histogram; p.ema20 = d.ema20; p.ema50 = d.ema50;
    p.bb_upper = d.bb_upper; p.bb_lower = d.bb_lower;
    p.tv_signal = d.tv_signal ?? p.tv_signal;
    p.mtf = d.mtf ?? null; // multi-timeframe summary (W/D/4H/1H/15m)
    p.indicators = d; // full set (incl. support/resistance) for the analyst

    p.unrealized_pnl = Math.round((d.price - p.avg_cost) * p.shares * 100) / 100;
    p.unrealized_pct = p.avg_cost
      ? Math.round(((d.price - p.avg_cost) / p.avg_cost) * 10000) / 100
      : null;

    const status = evaluateStatus(p, d);
    p.status_key = status;
    p.alert = buildAlert(p, d, status, prevDI);
  }
  data.last_refresh = new Date().toISOString();
  return data;
}

router.post('/refresh', async (_req, res, next) => {
  try {
    const data = await load();
    const tickers = liquidTickers(data);
    const live = await bridge.refreshPrices(tickers);
    applyLive(data, live);
    await save(data);
    res.json({
      ok: true,
      last_refresh: data.last_refresh,
      positions: data.positions,
      source: 'mcp-bridge',
    });
  } catch (e) { next(e); }
});

router.post('/analyze', async (req, res, next) => {
  try {
    const model = req.body?.model || DEFAULT_MODEL;
    const data = await load();
    const tickers = data.positions.filter((p) => p.is_liquid).map((p) => p.ticker);
    const stats = portfolioStats(data.positions);
    const [news, regime] = await Promise.all([gatherNews(tickers), latestRegime()]);
    const { analyses, book } = await analyzePortfolio(data.positions, model, { news, regime, book_stats: stats });
    const analyzed_at = new Date().toISOString();
    // New (pending) positions adopt the AI's levels; existing ones surface a proposal
    // to Apply — but only when a level actually moved (no chip on unchanged levels).
    const proposals = {};
    const journaled = []; // { p, before, applied } for each position the AI read
    for (const p of data.positions) {
      if (!analyses[p.ticker]) continue;
      const before = levelsSnapshot(p);
      p.ai = { ...analyses[p.ticker], model, analyzed_at };
      const result = applyAiLevels(p);
      if (result.applied) recomputeDerived(p);
      else if (result.proposal && proposalDiffers(p, result.proposal)) proposals[p.ticker] = result.proposal;
      ensureTradeId(p, todayIso());
      journaled.push({ p, before, applied: !!result.applied });
    }
    if (book) data.book_ai = { ...book, analyzed_at, model };
    await save(data);
    const journal_warning = journaled.length
      ? await recordJournal((j) => {
        for (const { p, before, applied } of journaled) recordAiRead(j, p, 'refresh_all', before, applied);
      })
      : null;
    res.json({
      ok: true, model, analyzed_at, positions: data.positions, book_ai: data.book_ai ?? null, proposals,
      ...(journal_warning ? { journal_warning } : {}),
    });
  } catch (e) { next(e); }
});

export default router;
