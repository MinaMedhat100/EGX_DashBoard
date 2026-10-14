// lessons.js — learning loop slice 3: repeated lessons (computed on read) and the backlog review.
import { Router } from 'express';
import { loadJournal } from '../services/journalStore.js';
import { buildLessons } from '../services/lessonService.js';
import { postmortems, backlogCandidates, POSTMORTEM_COST_HINT } from '../services/postmortemRunner.js';
import { POSTMORTEM_MODEL } from '../services/postmortemService.js';

const router = Router();

router.get('/lessons', async (_req, res, next) => {
  try {
    const journal = await loadJournal();
    res.json({
      ok: true, ...buildLessons(journal), remaining: backlogCandidates(journal).length,
      backlog: postmortems.backlogState(), cost_hint_usd: POSTMORTEM_COST_HINT, model: POSTMORTEM_MODEL,
    });
  } catch (e) { next(e); }
});

router.post('/lessons/analyse-remaining', async (_req, res, next) => {
  try {
    const r = await postmortems.runBacklog();
    if (r.status === 409) return res.status(409).json({ ok: false, error: r.error });
    r.job?.catch((e) => console.error('[lessons] backlog', e.message));
    res.json({ ok: true, started: r.started, total: r.total });
  } catch (e) { next(e); }
});

export default router;
