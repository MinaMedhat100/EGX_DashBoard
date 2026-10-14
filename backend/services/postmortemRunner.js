// postmortemRunner.js — runs the post-mortem for one trade (manual or scheduled) and keeps its
// status on the journal record. The AI call runs OUTSIDE the journal write queue; only status flips
// and the final result go through recordJournal, so trading is never blocked.
import { bars as defaultBars, MARKET_BASKET } from './barsService.js';
import { buildEvidence, afterExitSessions, AFTER_EXIT_SESSIONS } from './evidenceService.js';
import { analyzeTrade } from './postmortemService.js';
import { recordJournal } from './journalRecorder.js';
import { loadJournal } from './journalStore.js';
import { findTrade, setPostmortem, isAutoEligible, dueEstimate } from './journalService.js';
import { strategyText } from './analystService.js';

export const MAX_PER_CHECK = 3;
export const STALE_MS = 15 * 60 * 1000;
export const POSTMORTEM_COST_HINT = Number(process.env.POSTMORTEM_COST_HINT || 0.15); // spike 2026-10-01: $0.08 per bare call; a full review adds evidence + reply

const isStaleRunning = (pm, now) => pm?.status === 'running' && now - Date.parse(pm.started_at ?? 0) > STALE_MS;

function needsAutoRun(pm, now) {
  if (!pm) return true;
  if (pm.status === 'waiting') return true;
  if (pm.status === 'failed') return (pm.attempts ?? 0) < 2;
  return isStaleRunning(pm, now);
}

// Rebuilt trades (never auto-run) still to review: no post-mortem yet, or a failed one.
export function backlogCandidates(journal) {
  return journal.trades
    .filter((t) => t.status === 'closed' && !isAutoEligible(t) && (!t.postmortem || t.postmortem.status === 'failed'))
    .map((t) => t.trade_id);
}

export function createPostmortemRunner({
  load = loadJournal, record = recordJournal, bars = defaultBars, basketTickers = MARKET_BASKET,
  strategy = strategyText, analyze = analyzeTrade, now = () => new Date(),
} = {}) {
  const inFlight = new Set();
  let ticking = false;

  async function loadBasket() {
    const out = [];
    for (const t of basketTickers) {
      try { const r = await bars.getBars(t); if (r.bars) out.push(r.bars); }
      catch (e) { console.error('[postmortem] basket', t, e.message); }
    }
    return out;
  }

  const save = (id, patch) => record((j) => setPostmortem(j, id, patch));

  // → {status, postmortem?, error?, due_estimate?}; also {ran: true} when the AI was called.
  async function runTrade(tradeId, { manual = false } = {}) {
    const trade = findTrade(await load(), tradeId);
    if (!trade) return { status: 404, error: 'no journal for this trade' };
    if (trade.status !== 'closed') return { status: 409, error: 'the trade is not fully closed' };
    const t = now();
    if (inFlight.has(tradeId) || (trade.postmortem?.status === 'running' && !isStaleRunning(trade.postmortem, t))) {
      return { status: 409, error: 'a post-mortem is already running for this trade' };
    }

    let tradeBars = [];
    const got = await bars.getBars(trade.ticker); // network errors propagate: caller decides
    if (got.none) {
      if (!manual) { await save(tradeId, { status: 'no_bars' }); return { status: 409, error: 'no Yahoo history for this ticker' }; }
    } else {
      tradeBars = got.bars;
      const after = afterExitSessions(trade, tradeBars);
      if (after != null && after < AFTER_EXIT_SESSIONS) {
        const due = dueEstimate(trade.exit.date);
        await save(tradeId, { status: 'waiting', due_estimate: due });
        return { status: 409, error: `waiting for ${AFTER_EXIT_SESSIONS} sessions after the exit (${after} so far)`, due_estimate: due };
      }
    }

    inFlight.add(tradeId);
    try {
      await save(tradeId, { status: 'running', started_at: t.toISOString() });
      const evidence = buildEvidence(trade, tradeBars, await loadBasket());
      try {
        const { result, cost_usd, model } = await analyze({ trade, evidence, strategy: await strategy(), note: trade.note?.text ?? null });
        const patch = {
          status: 'done', ran_at: now().toISOString(), model, cost_usd, evidence, result, error: null,
          attempts: 0, runs: (trade.postmortem?.runs ?? 0) + 1,
        };
        await save(tradeId, patch);
        return { status: 200, ran: true, postmortem: { ...(trade.postmortem ?? {}), ...patch } };
      } catch (e) {
        const patch = { status: 'failed', error: e.message, attempts: (trade.postmortem?.attempts ?? 0) + 1, evidence };
        await save(tradeId, patch);
        return { status: 502, ran: true, error: e.message };
      }
    } finally {
      inFlight.delete(tradeId);
    }
  }

  async function tick() {
    if (ticking) return { ran: 0, checked: 0, skipped: 'busy' };
    ticking = true;
    let ran = 0, checked = 0;
    try {
      const t = now();
      const due = (await load()).trades.filter((tr) => isAutoEligible(tr) && needsAutoRun(tr.postmortem, t));
      for (const tr of due) {
        if (ran >= MAX_PER_CHECK) break;
        checked++;
        try {
          const r = await runTrade(tr.trade_id, { manual: false });
          if (r.ran) ran++;
        } catch (e) {
          console.error('[postmortem] check', tr.trade_id, e.message); // Yahoo down: try next check
        }
      }
      return { ran, checked };
    } finally {
      ticking = false;
    }
  }

  // Bulk review of the rebuilt backlog (v2.8.0): one at a time, stop at the first Claude error so a
  // usage limit can't burn through the list. Progress lives in memory; the Lessons page polls it.
  const backlog = { running: false, total: 0, done: 0, skipped: 0, failed_on: null, error: null, started_at: null, finished_at: null };

  async function runBacklog() {
    if (backlog.running) return { status: 409, error: 'a backlog review is already running' };
    const ids = backlogCandidates(await load());
    if (!ids.length) return { status: 200, started: false, total: 0 };
    Object.assign(backlog, { running: true, total: ids.length, done: 0, skipped: 0, failed_on: null, error: null, started_at: now().toISOString(), finished_at: null });
    const job = (async () => {
      try {
        for (const id of ids) {
          let r;
          try { r = await runTrade(id, { manual: true }); }
          catch (e) { backlog.error = `price history unavailable: ${e.message}`; backlog.failed_on = id; break; }
          if (r.status === 200) backlog.done++;
          else if (r.status === 502) { backlog.error = r.error; backlog.failed_on = id; break; }
          else backlog.skipped++;
        }
      } finally {
        backlog.running = false;
        backlog.finished_at = now().toISOString();
      }
    })();
    return { status: 200, started: true, total: ids.length, job };
  }

  const backlogState = () => ({ ...backlog });

  return { runTrade, tick, runBacklog, backlogState };
}

export function startPostmortemScheduler(runner, { firstDelayMs = 60_000, everyMs = 6 * 3600_000 } = {}) {
  const go = () => runner.tick().then((r) => { if (r.ran) console.log(`[postmortem] ran ${r.ran}`); }).catch((e) => console.error('[postmortem]', e.message));
  const first = setTimeout(go, firstDelayMs);
  const every = setInterval(go, everyMs);
  first.unref?.(); every.unref?.();
  return () => { clearTimeout(first); clearInterval(every); };
}

export const postmortems = createPostmortemRunner();
