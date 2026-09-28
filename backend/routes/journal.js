// journal.js — GET /api/journal/:trade_id (one trade's journal, fetched when its timeline is opened).
import { Router } from 'express';
import { loadJournal } from '../services/journalStore.js';
import { findTrade } from '../services/journalService.js';

const router = Router();

router.get('/journal/:trade_id', async (req, res, next) => {
  try {
    const trade = findTrade(await loadJournal(), req.params.trade_id);
    if (!trade) return res.status(404).json({ ok: false, error: 'no journal for this trade' });
    res.json({ ok: true, trade });
  } catch (e) { next(e); }
});

export default router;
