// market.js — GET /api/market-overview (forward to bridge).
import { Router } from 'express';
import { bridge } from '../services/bridgeClient.js';

const router = Router();

router.get('/market-overview', async (_req, res, next) => {
  try {
    res.json(await bridge.marketOverview());
  } catch (e) { next(e); }
});

export default router;
