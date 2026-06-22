// positions.js — targeted single-ticker AI refresh + level confirmation.
import { Router } from 'express';
import { load, save, getPosition } from '../services/portfolioStore.js';
import { bridge } from '../services/bridgeClient.js';
import { applyLive } from './refresh.js';
import { analyzePortfolio, DEFAULT_MODEL } from '../services/analystService.js';
import { applyAiLevels, commitLevels, recomputeDerived } from '../services/levelService.js';

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
    try {
      const aiMap = await analyzePortfolio([posn], model);
      if (aiMap[ticker]) {
        posn.ai = { ...aiMap[ticker], model, analyzed_at: new Date().toISOString() };
        result = applyAiLevels(posn);
        recomputeDerived(posn);
      } else {
        result = { applied: false, error: 'AI returned no analysis' };
      }
    } catch (e) {
      result = { applied: false, error: e.message };
    }

    await save(data);
    res.json({ ok: true, position: posn, live_error, ...result });
  } catch (e) { next(e); }
});

// Commit user-confirmed levels (confirm chip or manual editor).
router.post('/positions/:ticker/apply-levels', async (req, res, next) => {
  try {
    const ticker = (req.params.ticker || '').toUpperCase();
    const { stop, t1, t2 } = req.body || {};
    const data = await load();
    const posn = getPosition(data, ticker);
    if (!posn) return res.status(404).json({ ok: false, error: `position ${ticker} not found` });
    commitLevels(posn, { stop, t1, t2 });
    recomputeDerived(posn);
    await save(data);
    res.json({ ok: true, position: posn });
  } catch (e) { next(e); }
});

export default router;
