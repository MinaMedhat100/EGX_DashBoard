// journalService.js — pure trade-journal logic (no I/O). Learning loop, slice 1 (v2.6.0).
// The journal records DECISIONS, not prices: the card acted on, every AI read, every level change,
// every order. One record per trade (trade_id), so it survives the position being deleted on close.
import { randomBytes } from 'node:crypto';

export const JOURNAL_VERSION = 1;

const round2 = (n) => Math.round(n * 100) / 100;
// a number, or null — never 0 for "absent"
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
// a price level: 0 / negative / absent all mean "no level"
const lvl = (v) => (Number(v) > 0 ? Number(v) : null);

export function emptyJournal() {
  return { version: JOURNAL_VERSION, trades: [] };
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function randomSuffix(bytes = randomBytes(4)) {
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function newTradeId(ticker, date, suffix = randomSuffix()) {
  return `${String(ticker).toUpperCase()}-${date}-${suffix}`;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// A position that predates the journal (or whose id was lost) adopts an id the first time anything
// is recorded for it. The caller persists the position.
export function ensureTradeId(position, date = todayIso()) {
  if (!position.trade_id) position.trade_id = newTradeId(position.ticker, date);
  return position.trade_id;
}

export function tradeRef(position, date = todayIso()) {
  return { trade_id: position.trade_id, ticker: position.ticker, date };
}

export function findTrade(journal, tradeId) {
  return (journal.trades || []).find((t) => t.trade_id === tradeId) || null;
}

// Levels as the trader sees them: classic stop/T1/T2, or per lot for a ThndrX bracket (each lot is its
// own order with its own stop — v2.5.2).
export function levelsSnapshot(position) {
  if (position.brackets) {
    const lots = {};
    for (const l of position.brackets.lots || []) {
      lots[l.id] = { stop: lvl(l.stop), tp: lvl(l.tp_price), open: !l.tp_hit && !l.stopped };
    }
    return { lots };
  }
  return { stop: lvl(position.stop_loss), t1: lvl(position.t1_price), t2: lvl(position.t2_price) };
}

const same = (a, b) => (a == null && b == null) || (a != null && b != null && round2(a) === round2(b));

// Did any stop or target move (2 dp)? A lot opening/closing is an order, not a level change.
export function levelsChanged(a, b) {
  if (!a || !b) return a !== b;
  if (a.lots || b.lots) {
    const ids = new Set([...Object.keys(a.lots || {}), ...Object.keys(b.lots || {})]);
    for (const id of ids) {
      const x = a.lots?.[id];
      const y = b.lots?.[id];
      if (!x || !y) return true;
      if (!same(x.stop, y.stop) || !same(x.tp, y.tp)) return true;
    }
    return false;
  }
  return !same(a.stop, b.stop) || !same(a.t1, b.t1) || !same(a.t2, b.t2);
}

export function aiReadEvent(position, source) {
  const ai = position.ai || {};
  const ind = position.indicators || {};
  return {
    kind: 'ai_read',
    source,
    price: num(position.live_price),
    indicators: {
      adx: num(ind.adx ?? position.adx),
      plus_di: num(ind.plus_di ?? position.plus_di),
      minus_di: num(ind.minus_di ?? position.minus_di),
      rsi: num(ind.rsi ?? position.rsi),
      atr: num(ind.atr),
      ema20: num(ind.ema20 ?? position.ema20),
      ema50: num(ind.ema50 ?? position.ema50),
    },
    recommendation: ai.recommendation ?? null,
    conviction: num(ai.conviction),
    thesis: ai.thesis ?? '',
    key_risk: ai.key_risk ?? '',
    action_line: ai.action_line ?? '',
    suggested: {
      stop: num(ai.suggested_stop),
      stop_a: num(ai.suggested_stop_a),
      stop_b: num(ai.suggested_stop_b),
      t1: num(ai.suggested_t1),
      t2: num(ai.suggested_t2),
    },
    stop_guard: ai.stop_guard ?? null,
    vs_prior: ai.vs_prior ?? null,
    change_reason: ai.change_reason ?? '',
    model: ai.model ?? null,
    analyzed_at: ai.analyzed_at ?? null,
  };
}

function tradeShell({ trade_id, ticker, date, origin, card_source = null }) {
  return {
    trade_id,
    ticker: String(ticker).toUpperCase(),
    status: 'open',
    opened_at: date ?? null,
    closed_at: null,
    origin,
    card_source,
    entry: null,
    card: null,
    events: [],
    exit: null,
  };
}

export function openTrade(journal, { trade_id, ticker, date, entry, card = null, card_source = null, origin = null }) {
  const existing = findTrade(journal, trade_id);
  if (existing) return existing; // idempotent: a retried write never duplicates a trade
  const t = tradeShell({
    trade_id, ticker, date,
    origin: origin ?? (card ? 'card' : 'no_card'),
    card_source: card_source ?? (card ? 'logged' : null),
  });
  t.entry = entry ?? null;
  t.card = card;
  journal.trades.push(t);
  return t;
}

// A record that should exist but doesn't (a failed write, or a position older than the journal):
// recreate it and SAY so, rather than pretend the timeline is complete.
export function ensureTrade(journal, ref, at = new Date().toISOString()) {
  const found = findTrade(journal, ref.trade_id);
  if (found) return found;
  const t = tradeShell({ trade_id: ref.trade_id, ticker: ref.ticker, date: ref.date, origin: 'seeded' });
  t.events.push({ at, kind: 'gap', note: 'Journal resumed here; earlier events were not recorded.' });
  journal.trades.push(t);
  return t;
}

export function appendEvent(journal, ref, event, at = new Date().toISOString()) {
  const t = ensureTrade(journal, ref, at);
  t.events.push({ at, ...event });
  return t;
}

export function closeTrade(journal, ref, exit, at = new Date().toISOString()) {
  const t = ensureTrade(journal, ref, at);
  t.status = 'closed';
  t.closed_at = exit.date ?? null;
  t.exit = {
    date: exit.date ?? null,
    price: num(exit.price),
    type: exit.type,
    realized_pnl: num(exit.realized_pnl),
    approximate: !!exit.approximate,
  };
  return t;
}

// The card rides along with a BUY_NEW only, and only for the ticker it was scanned for — the Log
// window already drops it otherwise; this is the backstop. Returns a deep copy (the card is frozen).
export function acceptCard(order) {
  const card = order?.card;
  if (!card || typeof card !== 'object') return null;
  if (order.type !== 'BUY_NEW') return null;
  if (String(card.ticker || '').toUpperCase() !== String(order.ticker || '').toUpperCase()) return null;
  return JSON.parse(JSON.stringify(card));
}

// Turn applyOrder's / correctEntry's `journal` report into journal writes.
export function applyOrderJournal(journal, report, { card = null, at = new Date().toISOString() } = {}) {
  if (!report?.trade_id) return;
  const ref = { trade_id: report.trade_id, ticker: report.ticker, date: report.date };
  if (report.open) openTrade(journal, { ...ref, entry: report.open.entry, card });
  for (const e of report.events || []) appendEvent(journal, ref, e, at);
  if (report.exit) closeTrade(journal, ref, report.exit, at);
}

// One AI read of a position, plus the levels it set when it adopted them (a pending position's
// first read). `before` is levelsSnapshot(position) taken before applyAiLevels ran.
export function recordAiRead(journal, position, source, before, applied, at = new Date().toISOString()) {
  const ref = tradeRef(position);
  appendEvent(journal, ref, aiReadEvent(position, source), at);
  const after = levelsSnapshot(position);
  if (applied && levelsChanged(before, after)) {
    appendEvent(journal, ref, { kind: 'levels', source: 'ai_initial', from: before, to: after }, at);
  }
}
