// portfolio.js — GET /api/portfolio
import { Router } from 'express';
import { load } from '../services/portfolioStore.js';

const router = Router();

router.get('/portfolio', async (_req, res, next) => {
  try {
    res.json(await load());
  } catch (e) { next(e); }
});

export default router;
