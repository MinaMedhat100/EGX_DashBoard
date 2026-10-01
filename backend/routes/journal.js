// journal.js — the trade journal API: one trade's record, the post-mortem summary for History,
// the user's note, and manual post-mortem runs.
import { Router } from 'express';
import { loadJournal } from '../services/journalStore.js';
import { findTrade, setNote, postmortemSummary } from '../services/journalService.js';
import { recordJournal } from '../services/journalRecorder.js';
import { postmortems, POSTMORTEM_COST_HINT } from '../services/postmortemRunner.js';
import { POSTMORTEM_MODEL } from '../services/postmortemService.js';

const router = Router();

// Registered before /journal/:trade_id so "summary" is not read as a trade id.
router.get('/journal/summary', async (req, res, next) => {
  try {
    res.json({ ok: true, trades: postmortemSummary(await loadJournal()), cost_hint_usd: POSTMORTEM_COST_HINT, model: POSTMORTEM_MODEL });
  } catch (e) { next(e); }
});

router.get('/journal/:trade_id', async (req, res, next) => {
  try {
    const trade = findTrade(await loadJournal(), req.params.trade_id);
    if (!trade) return res.status(404).json({ ok: false, error: 'no journal for this trade' });
    res.json({ ok: true, trade });
  } catch (e) { next(e); }
});

router.put('/journal/:trade_id/note', async (req, res, next) => {
  try {
    const id = req.params.trade_id;
    if (!findTrade(await loadJournal(), id)) return res.status(404).json({ ok: false, error: 'no journal for this trade' });
    let note = null;
    const warning = await recordJournal((j) => { note = setNote(j, id, req.body?.text ?? ''); });
    if (warning) return res.status(500).json({ ok: false, error: warning });
    res.json({ ok: true, note });
  } catch (e) { next(e); }
});

router.post('/journal/:trade_id/postmortem', async (req, res, next) => {
  try {
    let r;
    try { r = await postmortems.runTrade(req.params.trade_id, { manual: true }); }
    catch (e) { return res.status(503).json({ ok: false, error: `price history unavailable: ${e.message}` }); }
    if (r.status !== 200) return res.status(r.status).json({ ok: false, error: r.error, due_estimate: r.due_estimate ?? null });
    res.json({ ok: true, postmortem: r.postmortem });
  } catch (e) { next(e); }
});

export default router;
