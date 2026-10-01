// evidenceService.js — the facts a post-mortem is judged on, computed in code from the trade's
// journal and Yahoo daily bars. Every field is a value or {unknown: reason} — never a guess.
import { idxOnOrAfter, idxOnOrBefore, atrAt, emaAt, pct, round2, basketMove, basketDayMove } from './barMath.js';
import { eventDay, loggedLateDays, readAfterClose } from './journalOrder.js';

export const ATR_PERIOD = 14;
export const AFTER_EXIT_SESSIONS = 10;
export const CORP_ACTION_GAP = 0.25;
const CORP_BASKET_MAX = 0.05;
const FILL_TOLERANCE = 0.005;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const unknown = (reason) => ({ unknown: reason });
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isoOrNull = (d) => (typeof d === 'string' && ISO.test(d) ? d : null);

export function entryPrice(trade) {
  const fixes = (trade.events ?? []).filter((e) => e.kind === 'correction' && isNum(e.to?.avg_cost));
  if (fixes.length) return fixes.at(-1).to.avg_cost;
  return isNum(trade.entry?.price) ? trade.entry.price : null;
}

function normLevels(to) {
  if (!to) return null;
  if (to.lots) {
    return { stop: null, stop_a: to.lots.A?.stop ?? null, stop_b: to.lots.B?.stop ?? null, t1: to.lots.A?.tp ?? null, t2: to.lots.B?.tp ?? null };
  }
  return { stop: to.stop ?? null, stop_a: null, stop_b: null, t1: to.t1 ?? null, t2: to.t2 ?? null };
}
const EMPTY = { stop: null, stop_a: null, stop_b: null, t1: null, t2: null };
const levelEvents = (trade) => (trade.events ?? []).filter((e) => e.kind === 'levels');

export function initialLevels(trade) {
  const en = trade.entry;
  if (en?.levels_known) return { stop: en.stop ?? null, stop_a: null, stop_b: null, t1: en.t1 ?? null, t2: en.t2 ?? null };
  return normLevels(levelEvents(trade)[0]?.to) ?? EMPTY;
}

export function levelsInForce(trade) {
  return normLevels(levelEvents(trade).at(-1)?.to) ?? initialLevels(trade);
}

export function afterExitSessions(trade, bars) {
  const exitDay = isoOrNull(trade.exit?.date);
  if (!exitDay) return null;
  return bars.filter((b) => b.date > exitDay).length;
}

function stopDistance(entry, levels, atr) {
  const d = (s) => round2((entry - s) / atr);
  if (isNum(levels.stop_a) || isNum(levels.stop_b)) {
    const out = {};
    if (isNum(levels.stop_a)) out.A = d(levels.stop_a);
    if (isNum(levels.stop_b)) out.B = d(levels.stop_b);
    return out;
  }
  return isNum(levels.stop) ? d(levels.stop) : unknown('the stop was never recorded');
}

// Where the stop actually sat on a stop-out: the first STOP_OUT fill. Lets rebuilt trades, whose levels
// were never recorded, still show how close the stop was (the 2026-09-21 study measured it this way).
function firstStopOutPrice(trade) {
  const o = (trade.events ?? []).find((e) => e.kind === 'order' && e.type === 'STOP_OUT' && isNum(e.price));
  return o ? o.price : null;
}

function processFacts(trade) {
  const events = trade.events ?? [];
  const exitDay = isoOrNull(trade.exit?.date);
  const log_lag_days = events
    .map((e) => ({ e, days: loggedLateDays(e) }))
    .filter((x) => x.days != null)
    .map(({ e, days }) => ({ type: e.type ?? e.kind, lot: e.lot ?? null, date: e.date, days }));
  const levels_changes = {};
  for (const e of levelEvents(trade)) levels_changes[e.source] = (levels_changes[e.source] ?? 0) + 1;
  return {
    log_lag_days,
    reads_after_close: events.filter((e) => readAfterClose(e, exitDay)).length,
    levels_changes,
    last_stop_vs_ai: lastStopVsAi(trade, exitDay),
  };
}

function compareStop(mine, ai) {
  if (!isNum(mine) || !isNum(ai)) return unknown('stop or AI suggestion not recorded');
  if (Math.round(mine * 100) === Math.round(ai * 100)) return 'equal';
  return mine > ai ? 'tighter' : 'looser';
}

function lastStopVsAi(trade, exitDay) {
  const reads = (trade.events ?? []).filter((e) => e.kind === 'ai_read' && (!exitDay || eventDay(e) <= exitDay));
  const s = reads.at(-1)?.suggested;
  if (!s) return unknown('no AI read before the exit');
  const lv = levelsInForce(trade);
  if (isNum(lv.stop_a) || isNum(lv.stop_b)) {
    return { A: compareStop(lv.stop_a, s.stop_a ?? s.stop), B: compareStop(lv.stop_b, s.stop_b ?? s.stop) };
  }
  return compareStop(lv.stop, s.stop);
}

function cardAge(trade) {
  const opened = isoOrNull(trade.opened_at);
  const scan = trade.card?.scan_as_of?.slice(0, 10);
  if (!opened || !scan) return unknown('no card');
  return Math.round((Date.parse(opened) - Date.parse(scan)) / 86400000);
}

function fillsValidated(trade, bars) {
  const outside = [];
  let checked = 0;
  for (const e of trade.events ?? []) {
    if (e.kind !== 'order' || !isNum(e.price) || !isoOrNull(e.date)) continue;
    const bar = bars.find((b) => b.date === e.date);
    if (!bar) continue;
    checked++;
    if (e.price < bar.low * (1 - FILL_TOLERANCE) || e.price > bar.high * (1 + FILL_TOLERANCE)) {
      outside.push({ date: e.date, price: e.price, low: bar.low, high: bar.high });
    }
  }
  return checked ? { checked, outside } : unknown('no order with a dated bar');
}

function corporateAction(bars, from, to, basket) {
  for (let k = Math.max(from, 1); k <= to; k++) {
    const gap = (bars[k].close - bars[k - 1].close) / bars[k - 1].close;
    if (Math.abs(gap) <= CORP_ACTION_GAP) continue;
    const market = basketDayMove(basket, bars[k].date);
    if (market == null || Math.abs(market) < CORP_BASKET_MAX) return { date: bars[k].date, gap_pct: round2(gap * 100) };
  }
  return false;
}

export function buildEvidence(trade, bars, basket = []) {
  const entry = entryPrice(trade);
  const exitPx = isNum(trade.exit?.price) ? trade.exit.price : null;
  const openDay = isoOrNull(trade.opened_at);
  const exitDay = isoOrNull(trade.exit?.date);
  const ev = {
    entry: { price: entry ?? unknown('entry price not recorded'), card_age_days: cardAge(trade) },
    held: {}, after: {}, process: processFacts(trade), data: {},
  };

  if (!bars?.length) {
    const none = unknown('no price history');
    Object.assign(ev.entry, { atr: none, stop_atr: none, stop_atr_from_fill: none, ema20_atr: none });
    ev.held = none; ev.after = none;
    ev.data = { fills_validated: none, corporate_action: none, bars_through: none };
    return ev;
  }
  ev.data.bars_through = bars.at(-1).date;
  ev.data.fills_validated = fillsValidated(trade, bars);

  const ie = openDay ? idxOnOrAfter(bars, openDay) : null;
  const ix = exitDay ? idxOnOrBefore(bars, exitDay) : null;
  const atr = ie != null ? atrAt(bars, ie, ATR_PERIOD) : null;
  const ema = ie != null ? emaAt(bars, ie, 20) : null;

  ev.entry.atr = atr != null ? round2(atr) : unknown(openDay ? 'not enough history before entry' : 'entry date unknown');
  ev.entry.stop_atr = atr && entry != null ? stopDistance(entry, initialLevels(trade), atr) : unknown('no ATR or entry price');
  const fillStop = firstStopOutPrice(trade);
  ev.entry.stop_atr_from_fill = fillStop == null ? unknown('no stop-out fill')
    : atr && entry != null ? round2((entry - fillStop) / atr) : unknown('no ATR or entry price');
  ev.entry.ema20_atr = atr && ema != null && entry != null ? round2((entry - ema) / atr) : unknown('no EMA20 or ATR at entry');

  if (ie == null || ix == null || ix < ie || entry == null) {
    ev.held = unknown('entry or exit date not found in the price history');
  } else {
    const held = bars.slice(ie, ix + 1);
    const lo = Math.min(...held.map((b) => b.low));
    const hi = Math.max(...held.map((b) => b.high));
    const lv = levelsInForce(trade);
    const touched = (t) => (isNum(t) ? held.some((b) => b.high >= t) : unknown('target not recorded'));
    ev.held = {
      sessions_held: held.length,
      mae_pct: pct(entry, lo), mae_atr: atr ? round2((lo - entry) / atr) : unknown('no ATR'),
      mfe_pct: pct(entry, hi), mfe_atr: atr ? round2((hi - entry) / atr) : unknown('no ATR'),
      t1_touched: touched(lv.t1), t2_touched: touched(lv.t2),
    };
  }

  if (ix == null) {
    ev.after = unknown(exitDay ? 'exit date not found in the price history' : 'exit date unknown');
  } else {
    const after = bars.slice(ix + 1, ix + 1 + AFTER_EXIT_SESSIONS);
    if (after.length < AFTER_EXIT_SESSIONS) {
      ev.after = unknown(`only ${after.length} sessions after the exit so far`);
    } else {
      const loss = entry != null && exitPx != null && exitPx < entry;
      const k = loss ? after.findIndex((b) => b.high >= entry) : -1;
      const market = basket.length ? basketMove(basket, bars[ix].date, after.at(-1).date) : null;
      ev.after = {
        recovered_to_entry: loss ? k >= 0 : unknown('not a loss'),
        sessions_to_recover: loss ? (k >= 0 ? k + 1 : unknown('did not recover within 10 sessions')) : unknown('not a loss'),
        max_gain_after_pct: exitPx != null ? pct(exitPx, Math.max(...after.map((b) => b.high))) : unknown('exit price unknown'),
        move_after_pct: pct(bars[ix].close, after.at(-1).close),
        market_move_after_pct: market ?? unknown('no market basket data'),
      };
    }
  }

  ev.data.corporate_action = ie != null
    ? corporateAction(bars, ie, Math.min((ix ?? ie) + AFTER_EXIT_SESSIONS, bars.length - 1), basket)
    : unknown('entry date unknown');
  return ev;
}
