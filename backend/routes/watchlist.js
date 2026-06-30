// watchlist.js — GET/PUT /api/watchlist (the single saved opportunity watchlist).
import { Router } from 'express';
import { load, save } from '../services/watchlistStore.js';

const router = Router();

router.get('/watchlist', async (_req, res, next) => {
  try { res.json(await load()); } catch (e) { next(e); }
});

router.put('/watchlist', async (req, res, next) => {
  try { res.json(await save(req.body?.tickers || [])); } catch (e) { next(e); }
});

export default router;
