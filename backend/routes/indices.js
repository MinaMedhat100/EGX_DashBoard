// indices.js — GET /api/indices (cached snapshot) + POST /api/indices/refresh (fetch + AI + cache).
import { Router } from 'express';
import { bridge } from '../services/bridgeClient.js';
import { analyzeIndices, DEFAULT_MODEL } from '../services/analystService.js';
import * as indicesStore from '../services/indicesStore.js';

const router = Router();

router.get('/indices', async (_req, res, next) => {
  try {
    res.json({ snapshot: await indicesStore.load() });
  } catch (e) { next(e); }
});

router.post('/indices/refresh', async (req, res, next) => {
  try {
    const model = req.body?.model || DEFAULT_MODEL;

    // Bridge failure must not throw away a good cache.
    let data;
    try {
      data = await bridge.indices();
    } catch (e) {
      const cached = await indicesStore.load();
      return res.status(200).json({ ok: false, error: `bridge: ${e.message}`, snapshot: cached });
    }

    const indices = data.indices || [];
    let merged = { indices: indices.map((x) => ({ ...x, ai: null })), overall: null };
    try {
      merged = await analyzeIndices(indices, model); // AI failure → keep data, ai null
    } catch { /* AI unavailable */ }

    const snapshot = {
      timestamp: new Date().toISOString(),
      model,
      overall: merged.overall,
      indices: merged.indices,
    };
    await indicesStore.save(snapshot);
    res.json({ ok: true, snapshot });
  } catch (e) { next(e); }
});

export default router;
