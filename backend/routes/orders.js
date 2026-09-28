// orders.js — POST /api/orders (order-trigger logging with FIFO cost basis).
import { Router } from 'express';
import { load, save } from '../services/portfolioStore.js';
import { applyOrder } from '../services/orderService.js';
import { acceptCard, applyOrderJournal } from '../services/journalService.js';
import { recordJournal } from '../services/journalRecorder.js';

const router = Router();

router.post('/orders', async (req, res, next) => {
  try {
    const body = req.body || {};
    const data = await load();
    const { toasts, journal } = applyOrder(data, body);
    await save(data);
    // after the save: the journal never blocks trading (a failure comes back as journal_warning)
    const card = acceptCard(body);
    const journal_warning = journal ? await recordJournal((j) => applyOrderJournal(j, journal, { card })) : null;
    res.json({ ok: true, portfolio: data, toast: toasts.join(' · '), ...(journal_warning ? { journal_warning } : {}) });
  } catch (e) {
    next(e);
  }
});

export default router;
