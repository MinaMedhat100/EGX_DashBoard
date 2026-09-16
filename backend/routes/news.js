// news.js — GET /api/news/:ticker (Yahoo + bridge merge).
import { Router } from 'express';
import { getNewsResult } from '../services/newsService.js';

const router = Router();

router.get('/news/:ticker', async (req, res, next) => {
  try {
    const { items, error } = await getNewsResult(req.params.ticker);
    res.json({ ticker: req.params.ticker, items, count: items.length, error: error ?? null });
  } catch (e) { next(e); }
});

export default router;
