// positions.js — targeted single-ticker AI refresh + level confirmation.
import { Router } from 'express';
import { load, save, getPosition } from '../services/portfolioStore.js';
import { bridge } from '../services/bridgeClient.js';
import { applyLive } from './refresh.js';
import { analyzePortfolio, DEFAULT_MODEL } from '../services/analystService.js';
import { applyAiLevels, commitLevels, recomputeDerived } from '../services/levelService.js';
import { correctEntry } from '../services/orderService.js';
import { gatherNews, latestRegime } from '../services/aiContext.js';
import {
  ensureTradeId, tradeRef, levelsSnapshot, levelsChanged, recordAiRead, appendEvent, applyOrderJournal, todayIso,
} from '../services/journalService.js';
import { recordJournal } from '../services/journalRecorder.js';

const router = Router();

// Refresh live data + run the AI for ONE ticker. New positions adopt the AI's
// levels; existing positions get a proposal to confirm. Best-effort: a bridge or
// AI failure leaves the position untouched (still 'pending' if new) and reports it.
router.post('/positions/:ticker/refresh-ai', async (req, res, next) => {
  try {
    const ticker = (req.params.ticker || '').toUpperCase();
    const model = req.body?.model || DEFAULT_MODEL;
    const data = await load();
    const posn = getPosition(data, ticker);
    if (!posn) return res.status(404).json({ ok: false, error: `position ${ticker} not found` });

    let live_error = null;
    if (posn.is_liquid) {
      try {
        const live = await bridge.refreshPrices([ticker]);
        applyLive(data, live); // only this ticker updates; others are skipped
      } catch (e) { live_error = e.message; }
    }

    let result = { applied: false };
    const before = levelsSnapshot(posn);
    let analyzed = false;
    try {
      const [news, regime] = await Promise.all([gatherNews([ticker]), latestRegime()]);
      const { analyses } = await analyzePortfolio([posn], model, { news, regime });
      if (analyses[ticker]) {
        posn.ai = { ...analyses[ticker], model, analyzed_at: new Date().toISOString() };
        result = applyAiLevels(posn);
        recomputeDerived(posn);
        analyzed = true;
        ensureTradeId(posn, todayIso());
      } else {
        result = { applied: false, error: 'AI returned no analysis' };
      }
    } catch (e) {
      result = { applied: false, error: e.message };
    }

    await save(data);
    const journal_warning = analyzed
      ? await recordJournal((j) => recordAiRead(j, posn, 'refresh_one', before, !!result.applied))
      : null;
    res.json({ ok: true, position: posn, live_error, ...result, ...(journal_warning ? { journal_warning } : {}) });
  } catch (e) { next(e); }
});

// Commit user-confirmed levels (confirm chip or manual editor).
router.post('/positions/:ticker/apply-levels', async (req, res, next) => {
  try {
    const ticker = (req.params.ticker || '').toUpperCase();
    const { stop, stop_a, stop_b, t1, t2, source } = req.body || {};
    const data = await load();
    const posn = getPosition(data, ticker);
    if (!posn) return res.status(404).json({ ok: false, error: `position ${ticker} not found` });
    const before = levelsSnapshot(posn);
    commitLevels(posn, { stop, stop_a, stop_b, t1, t2 }); // bracket-aware: per-lot stops, open lots only
    recomputeDerived(posn);
    const after = levelsSnapshot(posn);
    const changed = levelsChanged(before, after);
    if (changed) ensureTradeId(posn, todayIso());
    await save(data);
    const journal_warning = changed
      ? await recordJournal((j) => appendEvent(j, tradeRef(posn), {
        kind: 'levels', source: source === 'ai' ? 'ai_apply' : 'manual', from: before, to: after,
      }))
      : null;
    res.json({ ok: true, position: posn, ...(journal_warning ? { journal_warning } : {}) });
  } catch (e) { next(e); }
});

// Correct a fat-finger entry: override shares + avg_cost, recompute status/alert, persist.
router.post('/positions/:ticker/correct-entry', async (req, res, next) => {
  try {
    const ticker = (req.params.ticker || '').toUpperCase();
    const { shares, avg_cost } = req.body || {};
    const data = await load();
    const date = new Date().toISOString().slice(0, 10);
    const { toasts, journal } = correctEntry(data, { ticker, shares, avg_cost, date });
    recomputeDerived(getPosition(data, ticker)); // shares changed -> refresh status/alert
    await save(data);
    const journal_warning = await recordJournal((j) => applyOrderJournal(j, journal));
    res.json({ ok: true, portfolio: data, toast: toasts.join(' · '), ...(journal_warning ? { journal_warning } : {}) });
  } catch (e) { next(e); }
});

export default router;
