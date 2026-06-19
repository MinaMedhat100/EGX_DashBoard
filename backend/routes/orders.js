// orders.js — POST /api/orders (order-trigger logging with FIFO cost basis).
import { Router } from 'express';
import { load, save } from '../services/portfolioStore.js';
import { applyOrder } from '../services/orderService.js';

const router = Router();

router.post('/orders', async (req, res, next) => {
  try {
    const data = await load();
    const { toasts } = applyOrder(data, req.body || {});
    await save(data);
    res.json({ ok: true, portfolio: data, toast: toasts.join(' · ') });
  } catch (e) {
    next(e);
  }
});

export default router;
