// indices.js — GET /api/indices (cached snapshot) + POST /api/indices/refresh (fetch + zones + AI + cache).
import { Router } from 'express';
import { bridge } from '../services/bridgeClient.js';
import { buildIndicesSnapshot, DEFAULT_MODEL } from '../services/analystService.js';
import * as indicesStore from '../services/indicesStore.js';
import { fetchIndexExtras } from '../services/esthmrIndices.js';

const router = Router();

router.get('/indices', async (_req, res, next) => {
  try {
    res.json({ snapshot: await indicesStore.load() });
  } catch (e) { next(e); }
});

router.post('/indices/refresh', async (req, res, next) => {
  try {
    const model = req.body?.model || DEFAULT_MODEL;
    // ESTHMR helper (v2.11.0): started together with the bridge so a Refresh takes no longer. Never rejects.
    const extrasP = fetchIndexExtras();

    // Bridge failure must not throw away a good cache.
    let data;
    try {
      data = await bridge.indices();
    } catch (e) {
      const cached = await indicesStore.load();
      return res.status(200).json({ ok: false, error: `bridge: ${e.message}`, snapshot: cached });
    }

    const snapshot = await buildIndicesSnapshot(data.indices || [], model, { getExtras: () => extrasP });
    await indicesStore.save(snapshot);
    res.json({ ok: true, snapshot });
  } catch (e) { next(e); }
});

export default router;
