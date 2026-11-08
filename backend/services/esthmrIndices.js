// esthmrIndices.js — fetch the ESTHMR extras for one Indices Refresh (v2.11.0).
// 10 tool calls, all in parallel inside one time budget. Each part succeeds or fails on its own, and this never
// rejects: a failed part is simply missing and named in status.failed. Raw answers are turned into swing levels
// and digests right here and then dropped, so nothing ESTHMR returned is kept as-is.
import { callTool } from './esthmrClient.js';
import { swingLevels, structure } from './swingService.js';
import { flowsDigest, breadthDigest, macroDigest, eventsDigest, cairoDate } from './esthmrDigest.js';

export const ESTHMR_INDEX = { EGX30: 'EGX30', EGX70: 'EGX70EWI', EGX100: 'EGX100EWI' }; // same as the bridge's INDEX_MAP
export const EXTRAS_BUDGET_MS = 12000;
export const MIN_BARS = { D: 60, W: 26 };
const TF = { D: { interval: 'day', days: 365 }, W: { interval: 'week', days: 1095 } };
const DAY_MS = 24 * 60 * 60 * 1000;
const EN = { language: 'en' };

export const PART_NAMES = [
  ...Object.keys(ESTHMR_INDEX).flatMap((ix) => [`history:${ix}:D`, `history:${ix}:W`]),
  'flows', 'breadth', 'macro', 'events',
];

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function cleanBars(points) {
  const byDate = new Map();
  for (const p of Array.isArray(points) ? points : []) {
    if (!p || !isDate(p.date) || !fin(p.high) || !fin(p.low) || !fin(p.close)) continue;
    byDate.set(p.date, { date: p.date, open: fin(p.open) ? p.open : p.close, high: p.high, low: p.low, close: p.close });
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export async function fetchIndexExtras({ call = callTool, now = () => new Date(), budgetMs = EXTRAS_BUDGET_MS } = {}) {
  let timer;
  try {
    const t = now();
    const from = (days) => cairoDate(new Date(t.getTime() - days * DAY_MS));
    const OVER = Symbol('over budget');
    const budget = new Promise((r) => { timer = setTimeout(() => r(OVER), budgetMs); });
    // null = this part failed (threw, odd data, or still running at the budget)
    const run = async (work) => {
      try {
        const v = await Promise.race([Promise.resolve().then(work), budget]);
        return v === OVER ? null : v ?? null;
      } catch {
        return null;
      }
    };

    const series = (ix, tf) => run(async () => {
      const sc = await call('index_history', { index: ESTHMR_INDEX[ix], interval: TF[tf].interval, from: from(TF[tf].days), ...EN });
      const bars = cleanBars(sc?.points);
      return bars.length >= MIN_BARS[tf] ? bars : null;
    });

    const names = Object.keys(ESTHMR_INDEX);
    const [bars, flows, breadth, macro, events] = await Promise.all([
      Promise.all(names.map(async (ix) => {
        const [D, W] = await Promise.all([series(ix, 'D'), series(ix, 'W')]);
        return { ix, D, W };
      })),
      run(async () => flowsDigest(await call('investor_flows', { days: 20, ...EN }))),
      run(async () => breadthDigest(await call('what_moved', { count: 5, ...EN }))),
      run(async () => macroDigest(await call('rates_and_macro', { ...EN }))),
      run(async () => eventsDigest(await call('upcoming_events', { ...EN }), t)),
    ]);

    const history = {};
    for (const { ix, D, W } of bars) {
      if (!D && !W) continue;
      history[ix] = {
        levels: [...(D ? swingLevels(D, 'D') : []), ...(W ? swingLevels(W, 'W') : [])],
        structure: D ? structure(D) : null,
      };
    }
    const got = { flows, breadth, macro, events };
    const failed = PART_NAMES.filter((p) => {
      if (!p.startsWith('history:')) return got[p] == null;
      const [, ix, tf] = p.split(':');
      return !bars.find((b) => b.ix === ix)[tf];
    });
    const parts = {
      ...(Object.keys(history).length ? { history } : {}),
      ...Object.fromEntries(Object.entries(got).filter(([, v]) => v != null)),
    };
    return { parts, status: { ok: failed.length < PART_NAMES.length, failed } };
  } catch {
    return { parts: {}, status: { ok: false, failed: [...PART_NAMES] } };
  } finally {
    clearTimeout(timer);
  }
}
