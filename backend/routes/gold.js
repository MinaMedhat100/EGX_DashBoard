// gold.js — Goldx tab: analyze (bridge + AI, cache), get, order, apply-levels. Self-contained.
import { Router } from 'express';
import * as goldStore from '../services/goldStore.js';
import { applyGoldOrder } from '../services/goldOrderService.js';
import { analyzeGold, DEFAULT_MODEL } from '../services/analystService.js';
import { goldMacroNews } from '../services/aiContext.js';
import { bridge } from '../services/bridgeClient.js';
import { evaluateStatus, buildAlert } from '../services/statusEngine.js';

const round2 = (n) => Math.round(n * 100) / 100;

// Merge fresh gold indicators onto the open position + recompute status/P&L (USD/oz).
function applyGoldLive(position, ind, mtf) {
  if (!position || !ind || ind.error || ind.price == null) return position;
  const prevDI = position.indicators
    ? { plus_di: position.indicators.plus_di, minus_di: position.indicators.minus_di } : null;
  position.live_price = ind.price;
  position.indicators = { ...ind, mtf };
  position.mtf = mtf ?? null;
  position.unrealized_pnl = round2((ind.price - position.avg_cost) * position.shares);
  position.unrealized_pct = position.avg_cost
    ? round2(((ind.price - position.avg_cost) / position.avg_cost) * 100) : null;
  const status = evaluateStatus(position, position.indicators);
  position.status_key = status;
  position.alert = buildAlert(position, position.indicators, status, prevDI);
  return position;
}

const router = Router();

router.get('/gold', async (_req, res, next) => {
  try {
    const s = await goldStore.load();
    res.json({ snapshot: s.snapshot, position: s.position, realized_pnl_usd: s.realized_pnl_usd });
  } catch (e) { next(e); }
});

router.post('/gold/analyze', async (req, res, next) => {
  try {
    const model = req.body?.model || DEFAULT_MODEL;
    const s = await goldStore.load();

    let data;
    try { data = await bridge.goldAnalysis(); }
    catch (e) { return res.status(200).json({ ok: false, error: `bridge: ${e.message}`, snapshot: s.snapshot, position: s.position }); }

    // update the open position's live indicators before the AI reviews it
    if (s.position) applyGoldLive(s.position, data.indicators, data.mtf);

    let ai = null;
    const prior_ai = s.snapshot?.ai ?? null;
    const news = await goldMacroNews();
    try { ai = await analyzeGold({ ...data }, s.position, model, { news, prior_ai }); }
    catch { /* AI unavailable — keep data, ai stays null */ }

    // BUY_NEW just opened a pending position: adopt the AI's suggested levels (v1.3.0 pattern)
    if (s.position && s.position.levels_source === 'pending' && ai
        && (ai.suggested_stop || ai.suggested_t1 || ai.suggested_t2)) {
      s.position.stop_loss = Number(ai.suggested_stop) || s.position.stop_loss;
      s.position.t1_price = Number(ai.suggested_t1) || s.position.t1_price;
      s.position.t2_price = Number(ai.suggested_t2) || s.position.t2_price;
      s.position.levels_source = 'ai';
      applyGoldLive(s.position, data.indicators, data.mtf);
    }
    if (s.position) s.position.ai = ai;

    s.snapshot = {
      indicators: data.indicators, mtf: data.mtf, usd_egp: data.usd_egp, gc_usd: data.gc_usd,
      ai, model, timestamp: new Date().toISOString(),
    };
    await goldStore.save(s);
    res.json({ ok: true, snapshot: s.snapshot, position: s.position, realized_pnl_usd: s.realized_pnl_usd });
  } catch (e) { next(e); }
});

router.post('/gold/order', async (req, res, next) => {
  try {
    const s = await goldStore.load();
    const { toasts } = applyGoldOrder(s, req.body || {});
    await goldStore.save(s);
    res.json({ ok: true, position: s.position, realized_pnl_usd: s.realized_pnl_usd, toasts });
  } catch (e) { next(e); }
});

router.post('/gold/apply-levels', async (req, res, next) => {
  try {
    const s = await goldStore.load();
    if (!s.position) return res.status(404).json({ ok: false, error: 'no open gold position' });
    const { stop, t1, t2 } = req.body || {};
    s.position.stop_loss = Number(stop) || 0;
    s.position.t1_price = Number(t1) || 0;
    s.position.t2_price = Number(t2) || 0;
    s.position.levels_source = 'manual';
    if (s.position.indicators) {
      const status = evaluateStatus(s.position, s.position.indicators);
      s.position.status_key = status;
      s.position.alert = buildAlert(s.position, s.position.indicators, status, null);
    }
    await goldStore.save(s);
    res.json({ ok: true, position: s.position });
  } catch (e) { next(e); }
});

export default router;
