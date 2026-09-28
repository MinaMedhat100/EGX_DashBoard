// journalBackfill.js — rebuild journal records for trades that predate the journal (v2.6.0).
// Pure: takes the portfolio data and scan-history runs, returns what it would write. The CLI in
// backend/scripts/backfill-journal.js does the I/O. Everything rebuilt is labelled by origin, and
// what can't be matched is reported rather than guessed.
import { newTradeId, levelsSnapshot, aiReadEvent } from './journalService.js';

export const CARD_LOOKBACK_DAYS = 7;
export const EXIT_MATCH_DAYS = 3;

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const DAY_MS = 86400000;
const n = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
const atOf = (date, now) => (date ? `${date}T12:00:00.000Z` : now);

export function normDate(s) {
  const str = String(s ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const m = str.match(/^([A-Za-z]{3,9})\.? (\d{1,2}), (\d{4})$/);
  if (!m) return null;
  const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (!mon) return null;
  return `${m[3]}-${String(mon).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

export function parseLogType(type) {
  const t = String(type || '');
  const lot = (t.match(/Lot ([AB])/) || [])[1] ?? null;
  if (t === 'BUY' || t === 'BUY (bracket)') return { kind: 'buy', orderType: null, lot: null, bracket: t === 'BUY (bracket)' };
  if (t === 'BUY (add)') return { kind: 'add', orderType: 'BUY_ADD', lot: null, bracket: false };
  if (t.startsWith('SELL')) return { kind: 'exit', orderType: 'SELL', lot, bracket: false };
  if (t.startsWith('STOP-OUT')) return { kind: 'exit', orderType: 'STOP_OUT', lot, bracket: false };
  if (t === 'CORRECT') return { kind: 'correct', orderType: null, lot: null, bracket: false };
  return { kind: null, orderType: null, lot: null, bracket: false };
}

function shell(ticker, opened_at, origin) {
  return {
    trade_id: null, ticker, status: 'open', opened_at, closed_at: null, origin, card_source: null,
    entry: null, card: null, events: [], exit: null,
  };
}

function unknownPlan(price, shares, mode) {
  return { price: n(price), shares: n(shares), mode, split: null, stop: null, t1: null, t2: null, levels_known: false };
}

function correctionFrom(e) {
  const m = String(e.notes || '').match(/from (\d+(?:\.\d+)?)sh @ (\d+(?:\.\d+)?)/);
  return m ? { shares: Number(m[1]), avg_cost: Number(m[2]) } : null;
}

// `date` is the normalised exit date, or null when the legacy text can't be read ("~May–Jun 2026") —
// the record then keeps that text so the timeline shows what was written rather than nothing.
function finishClosed(trade, x, date) {
  trade.status = 'closed';
  trade.closed_at = date;
  trade.exit = { date: date ?? x.exit_date ?? null, price: n(x.exit_price), type: x.exit_type, realized_pnl: n(x.realized_pnl), approximate: !!x.approximate };
}

// The old log sometimes records an add before its buy on the same day. Within one date, process buys,
// then adds, then corrections, then exits (a same-day stop-out and re-buy merge into one trade — the
// conservative reading — rather than pairing an add or exit with no trade open).
const SAME_DAY_RANK = { buy: 0, add: 1, correct: 2, exit: 3 };
const dayRank = (e) => SAME_DAY_RANK[parseLogType(e.type).kind] ?? 4;

// An exited_positions record that is really a partial exit of a longer trade (older versions wrote those
// there): it matches one of the trade's own sell / stop-out events exactly.
function isPartialOf(trade, c) {
  const type = c.x.exit_type === 'STOP-OUT' ? 'STOP_OUT' : 'SELL';
  return trade.events.some((e) => e.kind === 'order' && e.type === type && e.date === c.date
    && n(e.shares) === n(c.x.shares) && n(e.price) != null && Math.round(e.price * 100) === Math.round(n(c.x.exit_price) * 100));
}

// One ticker's log entries, oldest first, with a running share count: a buy opens a trade, adds raise
// the count, sells/stop-outs lower it, and the trade closes when it reaches zero.
function walkTicker(ticker, entries, now) {
  const closed = [];
  const notes = [];
  let cur = null;
  let count = 0;
  for (const e of entries) {
    const p = parseLogType(e.type);
    const date = e.date_iso;
    if (p.kind === 'buy' && !cur) {
      cur = shell(ticker, date, 'reconstructed');
      cur.entry = unknownPlan(e.price, e.shares, p.bracket ? 'bracket' : 'classic');
      count = n(e.shares) ?? 0;
    } else if ((p.kind === 'buy' || p.kind === 'add') && cur) {
      cur.events.push({ at: atOf(date, now), kind: 'order', type: 'BUY_ADD', lot: null, shares: n(e.shares), price: n(e.price), date, realized_pnl: null });
      count += n(e.shares) ?? 0;
    } else if (p.kind === 'exit' && cur) {
      cur.events.push({ at: atOf(date, now), kind: 'order', type: p.orderType, lot: p.lot, shares: n(e.shares), price: n(e.price), date, realized_pnl: n(e.realized_pnl) });
      count -= n(e.shares) ?? count; // an exit with no share count closes the trade
      if (count <= 0) {
        closed.push({ trade: cur, closeDate: date });
        cur = null;
        count = 0;
      }
    } else if (p.kind === 'correct' && cur) {
      cur.events.push({ at: atOf(date, now), kind: 'correction', from: correctionFrom(e), to: { shares: n(e.total_shares ?? e.shares), avg_cost: n(e.price) }, date });
    } else if (p.kind === 'add' || p.kind === 'exit' || p.kind === 'correct') {
      notes.push(`${ticker} ${e.type} on ${date ?? e.date} has no open trade in the log`);
    }
  }
  return { closed, open: cur, notes };
}

function matchCard(runs, ticker, openedAt) {
  const newestFirst = [...(runs || [])].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  for (const run of newestFirst) {
    const day = String(run.timestamp || '').slice(0, 10);
    if (!day || day > openedAt || daysBetween(day, openedAt) > CARD_LOOKBACK_DAYS) continue;
    const opp = (run.opportunities || []).find((o) => o.ticker === ticker);
    if (opp) return { ...JSON.parse(JSON.stringify(opp)), scan_run_id: run.id, scan_as_of: run.timestamp };
  }
  return null;
}

export function buildBackfill(data, runs = [], { today, now, idFor = newTradeId } = {}) {
  const trades = [];
  const unmatched = [];
  const entries = (data.action_log || []).slice().reverse() // the log is newest-first
    .map((e, seq) => ({ ...e, date_iso: normDate(e.date), seq }));
  const byTicker = new Map();
  for (const e of entries) {
    if (!byTicker.has(e.ticker)) byTicker.set(e.ticker, []);
    byTicker.get(e.ticker).push(e);
  }
  const exits = (data.exited_positions || []).map((x, index) => ({ x, index, date: normDate(x.exit_date), used: false }));
  const openByTicker = new Map();

  for (const [ticker, list] of byTicker) {
    list.sort((a, b) => (a.date_iso ?? '').localeCompare(b.date_iso ?? '') || dayRank(a) - dayRank(b) || a.seq - b.seq);
    const { closed, open, notes } = walkTicker(ticker, list, now);
    unmatched.push(...notes);
    for (const { trade, closeDate } of closed) {
      const match = exits
        .filter((c) => !c.used && c.x.ticker === ticker && c.date && closeDate && Math.abs(daysBetween(closeDate, c.date)) <= EXIT_MATCH_DAYS)
        .sort((a, b) => Math.abs(daysBetween(closeDate, a.date)) - Math.abs(daysBetween(closeDate, b.date)))[0];
      if (!match) {
        unmatched.push(`${ticker} closed ${closeDate} in the log, but no exited position matches`);
        continue;
      }
      match.used = true;
      finishClosed(trade, match.x, match.date);
      trades.push({ trade, target: { kind: 'exit', index: match.index } });
    }
    if (open) openByTicker.set(ticker, open);
  }

  // legacy partial-exit records belong to the trade they were part of (closed trades, and open trades
  // that are still held — an open trade that isn't held never gets an id, so it can't own a record)
  const held = new Set((data.positions || []).map((p) => p.ticker));
  const owners = [
    ...trades.map((t) => t.trade),
    ...[...openByTicker].filter(([t]) => held.has(t)).map(([, trade]) => trade),
  ];
  const partials = [];
  for (const c of exits) {
    if (c.used || !c.date) continue;
    const owner = owners.find((t) => t.ticker === c.x.ticker && isPartialOf(t, c));
    if (!owner) continue;
    c.used = true;
    partials.push({ index: c.index, trade: owner });
  }

  // exits whose buy never made it into the log (legacy entries)
  for (const c of exits) {
    if (c.used) continue;
    const t = shell(c.x.ticker, null, 'reconstructed');
    t.entry = unknownPlan(c.x.avg_cost, c.x.shares, null);
    finishClosed(t, c.x, c.date);
    trades.push({ trade: t, target: { kind: 'exit', index: c.index } });
  }

  // open positions: rebuilt orders so far + today's AI read + today's levels (the plan is unknown)
  for (const pos of data.positions || []) {
    const walked = openByTicker.get(pos.ticker);
    openByTicker.delete(pos.ticker);
    const t = walked ?? shell(pos.ticker, null, 'seeded');
    t.origin = 'seeded';
    if (!t.entry) t.entry = unknownPlan(pos.avg_cost, pos.shares, pos.brackets ? 'bracket' : 'classic');
    if (pos.ai) t.events.push({ at: now, ...aiReadEvent(pos, 'seeded') });
    t.events.push({ at: now, kind: 'levels', source: 'seeded', from: null, to: levelsSnapshot(pos) });
    trades.push({ trade: t, target: { kind: 'position', ticker: pos.ticker } });
  }
  for (const [ticker] of openByTicker) unmatched.push(`${ticker} is still open in the log, but not held`);

  for (const { trade } of trades) {
    // an open position's journal starts today; a closed trade with no readable date is 'undated'
    trade.trade_id = idFor(trade.ticker, trade.opened_at ?? trade.closed_at ?? (trade.status === 'open' ? today : 'undated'));
    if (trade.opened_at) {
      const card = matchCard(runs, trade.ticker, trade.opened_at);
      if (card) {
        trade.card = card;
        trade.card_source = 'scan_history_match'; // NOT 'logged': the board recommended it, nobody clicked it
      }
    }
  }
  return { trades, partials, unmatched };
}

// Idempotence: skip anything whose position/exit already carries a trade_id, or whose id is known.
export function pendingTrades(data, journal, built) {
  const known = new Set((journal.trades || []).map((t) => t.trade_id));
  return built.trades.filter(({ trade, target }) => {
    if (known.has(trade.trade_id)) return false;
    if (target.kind === 'exit') return !data.exited_positions[target.index]?.trade_id;
    return !data.positions.find((p) => p.ticker === target.ticker)?.trade_id;
  });
}

export function pendingPartials(data, built) {
  return (built.partials || []).filter(({ index }) => !data.exited_positions[index]?.trade_id);
}

export function applyBackfill(data, journal, built) {
  const todo = pendingTrades(data, journal, built);
  const links = pendingPartials(data, built);
  for (const { trade, target } of todo) {
    if (target.kind === 'exit') data.exited_positions[target.index].trade_id = trade.trade_id;
    else data.positions.find((p) => p.ticker === target.ticker).trade_id = trade.trade_id;
    journal.trades.push(trade);
  }
  for (const { index, trade } of links) data.exited_positions[index].trade_id = trade.trade_id;
  return { added: todo.length, linked: links.length };
}
