// lessonService.js — learning loop slice 3 (v2.8.0): count post-mortem lesson categories across trades,
// in code, no AI. A category is flagged when FLAG_AT trades with a problem verdict share it. Trades
// with the same category but a harmless verdict are listed as "also seen". Computed on read.
import { CATEGORIES } from './postmortemService.js';
import { STOP_ATR_MULT } from './levelService.js';

export const FLAG_AT = 3;
export const PROBLEM_VERDICTS = ['process_error', 'user_deviation'];
const LESSON_CATEGORIES = CATEGORIES.filter((c) => c !== 'none');

const reviewedTrades = (journal) => journal.trades.filter(
  (t) => t.status === 'closed' && t.postmortem?.status === 'done' && t.postmortem.result,
);

function row(t) {
  const r = t.postmortem.result;
  return {
    trade_id: t.trade_id, ticker: t.ticker, closed_at: t.closed_at ?? t.exit?.date ?? null,
    verdict: r.verdict, stage: r.stage, pnl: t.exit?.realized_pnl ?? null, lesson: r.lesson?.text ?? '',
  };
}

function category(c, done) {
  const mine = done.filter((t) => t.postmortem.result.lesson?.category === c);
  if (!mine.length) return null;
  const isProblem = (t) => PROBLEM_VERDICTS.includes(t.postmortem.result.verdict);
  const problems = mine.filter(isProblem).map(row);
  const stages = { entry: 0, management: 0, exit: 0, none: 0 };
  for (const p of problems) stages[p.stage] = (stages[p.stage] ?? 0) + 1;
  return {
    category: c, count: problems.length, flagged: problems.length >= FLAG_AT,
    winners: problems.filter((p) => p.pnl > 0).length, stages,
    problems, also_seen: mine.filter((t) => !isProblem(t)).map(row),
  };
}

// Stop distance in ATRs from the post-mortem evidence: the recorded stop (bracket: the closer lot),
// else where the stop-out actually filled. null when unknown.
function stopDistance(ev) {
  const s = ev?.entry?.stop_atr;
  if (typeof s === 'number') return s;
  if (s && typeof s === 'object' && !('unknown' in s)) {
    const v = Object.values(s).filter((x) => typeof x === 'number');
    if (v.length) return Math.min(...v);
  }
  const f = ev?.entry?.stop_atr_from_fill;
  return typeof f === 'number' ? f : null;
}

function stopInsideNoise(done) {
  let checked = 0;
  const trades = [];
  for (const t of done) {
    const ev = t.postmortem.evidence;
    const d = stopDistance(ev);
    if (d == null) continue;
    checked++;
    if (d > 0 && d < STOP_ATR_MULT) { // ≤ 0 = a stop trailed to/above the entry: not "inside noise"
      const a = ev.after ?? {};
      trades.push({
        trade_id: t.trade_id, ticker: t.ticker, stop_atr: d, recovered: a.recovered_to_entry === true,
        sessions: typeof a.sessions_to_recover === 'number' ? a.sessions_to_recover : null,
      });
    }
  }
  return { checked, inside: trades.length, recovered: trades.filter((x) => x.recovered).length, trades };
}

function coverage(journal) {
  const c = { closed: 0, reviewed: 0, waiting: 0, failed: 0, unreviewed: 0 };
  for (const t of journal.trades) {
    if (t.status !== 'closed') continue;
    c.closed++;
    const s = t.postmortem?.status;
    if (!s) c.unreviewed++;
    else if (s === 'done') c.reviewed++;
    else if (s === 'waiting' || s === 'running') c.waiting++;
    else c.failed++;
  }
  return c;
}

export function buildLessons(journal) {
  const done = reviewedTrades(journal);
  const categories = LESSON_CATEGORIES.map((c) => category(c, done)).filter(Boolean)
    .sort((a, b) => (b.flagged - a.flagged) || (b.count - a.count)
      || (b.also_seen.length - a.also_seen.length) || a.category.localeCompare(b.category));
  return { flag_at: FLAG_AT, categories, measured: { stop_inside_noise: stopInsideNoise(done) }, coverage: coverage(journal) };
}
