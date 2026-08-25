// orderService.js — order-trigger logging with FIFO cost basis.
// Mutates the portfolio data object in place (caller persists). Per prompt.md Step 6.
import { v4 as uuid } from 'uuid';
import { makeBracket, syncBracketSummary, settleLot, isFullyExited, openLots, raiseLotStop } from './bracketService.js';

const ILLIQUID = new Set(['EGX30ETF', 'BAL', 'CCB']);
const round2 = (n) => Math.round(n * 100) / 100;

function httpErr(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function recompute(pos) {
  if (pos.live_price > 0 && pos.avg_cost) {
    pos.unrealized_pnl = round2((pos.live_price - pos.avg_cost) * pos.shares);
    pos.unrealized_pct = round2(((pos.live_price - pos.avg_cost) / pos.avg_cost) * 100);
  }
}

// bracketRealizedSafe — a settled lot has `exit_price`; an open one contributes 0.
function bracketRealizedSafe(lot, avgCost) {
  return lot.exit_price == null ? 0 : Math.round(((lot.exit_price - avgCost) * lot.shares) * 100) / 100;
}

function logEntry(e) {
  return {
    id: uuid().slice(0, 12),
    date: e.date,
    type: e.type,
    ticker: e.ticker,
    shares: e.shares ?? null,
    price: e.price ?? null,
    new_avg_cost: e.new_avg_cost ?? null,
    total_shares: e.total_shares ?? null,
    fifo_cost: e.fifo_cost ?? null,
    realized_pnl: e.realized_pnl ?? null,
    notes: e.notes ?? '',
  };
}

function makeNewPosition(order, date) {
  const { ticker, shares, price } = order;
  return {
    ticker,
    avg_cost: price,
    live_price: price,
    shares,
    stop_loss: Number(order.stop_loss) || 0,
    stop_raised: false,
    levels_source: 'pending',
    t1_hit: false,
    t2_hit: false,
    t1_fill_price: null,
    t1_fill_date: null,
    t2_fill_price: null,
    t2_fill_date: null,
    t1_price: Number(order.t1_price) || 0,
    t2_price: Number(order.t2_price) || 0,
    position_label: `${shares}sh — entered ${date} @ ${price}`,
    daily_chg: null,
    chg_pos: null,
    status_key: 'yellow',
    tv_signal: '—',
    analysis_notes: order.notes || '', // empty -> the card's "Analysis notes" section hides itself
    add_zone: '',
    sell_plan: '',
    unrealized_pnl: 0,
    unrealized_pct: 0,
    is_liquid: !ILLIQUID.has(ticker),
    adx: null, plus_di: null, minus_di: null, rsi: null,
    macd_histogram: null, ema20: null, ema50: null, bb_upper: null, bb_lower: null,
    alert: null,
    ai: null,
  };
}

function makeBracketPosition(order, date) {
  const base = makeNewPosition(order, date); // reuse classic scaffold (identity, indicators=null, ai=null)
  base.brackets = makeBracket(
    order.price, Number(order.shares), Number(order.split) || 50,
    Number(order.stop_loss) || 0, Number(order.t1_price) || 0, Number(order.t2_price) || 0,
  );
  base.levels_source = 'manual';
  base.position_label = `${order.shares}sh bracket — entered ${date} @ ${order.price}`;
  syncBracketSummary(base);
  return base;
}

/**
 * calcFifoCost — the avg_cost stored is already the FIFO cost of the remaining shares
 * (per the existing workflow), so it IS the cost basis for the exited shares unless the
 * user overrides it in the modal.
 */
function calcFifoCost(position, override) {
  return override != null && override !== '' ? Number(override) : position.avg_cost;
}

export function applyOrder(data, order) {
  const type = order.type;
  const ticker = (order.ticker || '').toUpperCase();
  const shares = Number(order.shares);
  const price = Number(order.price);
  const date = order.date || new Date().toISOString().slice(0, 10);
  const notes = order.notes || '';
  const toasts = [];

  if (!type || !ticker) throw httpErr(400, 'type and ticker are required');

  const idx = data.positions.findIndex((p) => p.ticker === ticker);
  const pos = idx >= 0 ? data.positions[idx] : null;

  // Lot-keyed bracket exits derive their share count from the lot itself, so `shares`
  // isn't part of the order payload for them — exempt that case from the classic guard.
  const isBracketExit = pos?.brackets && (type === 'SELL' || type === 'STOP_OUT');
  if (type !== 'BUY_NEW' && type !== 'BUY_ADD' && !isBracketExit && (!shares || shares <= 0)) {
    throw httpErr(400, 'shares must be a positive number');
  }

  // ── BUY (new position) ──────────────────────────────────────────────────────
  if (type === 'BUY_NEW') {
    if (pos) throw httpErr(400, `${ticker} already held — use "Add to position"`);
    if (!shares || !price) throw httpErr(400, 'shares and price required');
    if (order.mode === 'bracket') {
      if (shares < 2) throw httpErr(400, 'a bracket entry needs at least 2 shares');
      data.positions.push(makeBracketPosition({ ...order, ticker, shares, price }, date));
      data.action_log.unshift(logEntry({ type: 'BUY (bracket)', ticker, shares, price, new_avg_cost: price, total_shares: shares, notes, date }));
      toasts.push(`Opened ${ticker} bracket: ${shares}sh @ ${price} (split ${order.split || 50}/${100 - (order.split || 50)})`);
      return { toasts };
    }
    data.positions.push(makeNewPosition({ ...order, ticker, shares, price }, date));
    data.action_log.unshift(
      logEntry({ type: 'BUY', ticker, shares, price, new_avg_cost: price, total_shares: shares, notes, date }),
    );
    toasts.push(`Opened ${ticker}: ${shares}sh @ ${price}`);
    return { toasts };
  }

  if (!pos) throw httpErr(404, `position ${ticker} not found`);

  // ── bracketed position exits (lot-keyed) ────────────────────────────────────
  if (pos.brackets && (type === 'SELL' || type === 'STOP_OUT')) {
    if (!price) throw httpErr(400, 'price required');
    const kind = type === 'STOP_OUT' ? 'stop' : 'tp';
    const wanted = (order.lot || (type === 'SELL' ? 'A' : 'ALL')).toUpperCase();
    if (wanted !== 'A' && wanted !== 'B' && wanted !== 'ALL') throw httpErr(400, 'lot must be A, B, or ALL');
    const ids = wanted === 'ALL' ? openLots(pos.brackets).map((l) => l.id) : [wanted];
    if (!ids.length) throw httpErr(400, 'no open lots to settle');
    for (const id of ids) {
      const { realized, lot } = settleLot(pos, id, { kind, price, date }, pos.avg_cost);
      if (!lot) continue;
      data.realized_pnl = round2(data.realized_pnl + realized);
      const label = kind === 'tp' ? `SELL (Lot ${id} @ ${lot.target})` : `STOP-OUT (Lot ${id})`;
      data.action_log.unshift(logEntry({ type: label, ticker, shares: lot.shares, price, fifo_cost: kind === 'stop' ? pos.avg_cost : null, new_avg_cost: pos.avg_cost, total_shares: pos.shares, realized_pnl: realized, notes, date }));
      toasts.push(`${ticker}: Lot ${id} ${kind === 'tp' ? 'banked @ ' + lot.target : 'stopped'} @ ${price} (${realized >= 0 ? '+' : ''}${realized} EGP)`);
    }
    if (isFullyExited(pos.brackets)) {
      const realizedTotal = pos.brackets.lots.reduce((s, l) => s + bracketRealizedSafe(l, pos.avg_cost), 0);
      data.exited_positions.unshift({ ticker, exit_date: date, exit_price: price, shares: pos.brackets.lots.reduce((s, l) => s + l.shares, 0), avg_cost: pos.avg_cost, realized_pnl: round2(realizedTotal), exit_type: ids.length && kind === 'stop' ? 'STOP-OUT' : 'SELL', approximate: false });
      data.positions.splice(idx, 1);
      toasts.push(`${ticker} fully exited`);
    } else {
      const a = pos.brackets.lots.find((l) => l.id === 'A');
      const b = pos.brackets.lots.find((l) => l.id === 'B');
      const bankedA = ids.includes('A') && kind === 'tp' && a && a.tp_hit;
      if (bankedA && b && !b.tp_hit && !b.stopped && !b.stop_raised && pos.avg_cost > 0 && b.stop < pos.avg_cost) {
        if (order.raise_stop_be) {
          raiseLotStop(pos, 'B', pos.avg_cost);
          toasts.push(`Lot B stop raised to break-even ${pos.avg_cost}`);
        } else {
          toasts.push(`Raise Lot B stop ${b.stop} → ${pos.avg_cost} (break-even) in ThndrX`);
        }
      }
      pos.position_label = `${pos.shares}sh runner — Lot ${ids.join('/')} ${kind === 'tp' ? 'banked' : 'stopped'} @ ${price}`;
      recompute(pos);
    }
    return { toasts };
  }

  // ── BUY (add to existing) ───────────────────────────────────────────────────
  if (type === 'BUY_ADD') {
    // A ThndrX bracket is set per-lot at entry; the classic re-average would write avg_cost/shares
    // directly and desync the lots. Adding to a bracket is a future "new bracket" flow — block it here.
    if (pos.brackets) throw httpErr(400, 'Add-to-position is not supported for a ThndrX bracket (its lots are set at entry). Open a separate bracket instead.');
    if (!shares || !price) throw httpErr(400, 'shares and price required');
    const total = pos.shares + shares;
    const newAvg = round2((pos.avg_cost * pos.shares + price * shares) / total);
    pos.avg_cost = newAvg;
    pos.shares = total;
    pos.position_label = `${total}sh — avg ${newAvg} (added ${shares}@${price} ${date})`;
    recompute(pos);
    data.action_log.unshift(
      logEntry({ type: 'BUY (add)', ticker, shares, price, new_avg_cost: newAvg, total_shares: total, notes, date }),
    );
    toasts.push(`${ticker}: averaged to ${newAvg} over ${total}sh`);
    return { toasts };
  }

  // ── exits: STOP-OUT / SELL ──────────────────────────────────────────────────
  if (type !== 'STOP_OUT' && type !== 'SELL') throw httpErr(400, `unknown order type ${type}`);
  if (!price) throw httpErr(400, 'price required');

  const qty = Math.min(shares, pos.shares);
  const isStop = type === 'STOP_OUT';
  const cost = isStop ? calcFifoCost(pos, order.fifo_cost) : pos.avg_cost;
  const realized = round2((price - cost) * qty);
  data.realized_pnl = round2(data.realized_pnl + realized);
  pos.shares -= qty;

  if (type === 'SELL') {
    if (order.target === 'T2') {
      pos.t2_hit = true;
      pos.t2_fill_price = price;
      pos.t2_fill_date = date;
    } else {
      pos.t1_hit = true;
      pos.t1_fill_price = price;
      pos.t1_fill_date = date;
    }
    // Raise stop to break-even (avg cost) when requested (default-on checkbox in the modal).
    if (order.raise_stop_be && pos.shares > 0 && pos.avg_cost > 0) {
      pos.stop_loss = pos.avg_cost;
      pos.stop_raised = true;
      toasts.push(`Stop raised to break-even ${pos.avg_cost}`);
    } else if (order.target !== 'T2') {
      toasts.push(`T1 filled — consider raising stop to break-even ${pos.avg_cost}`);
    }
  }

  data.action_log.unshift(
    logEntry({
      type: isStop ? 'STOP-OUT' : 'SELL',
      ticker,
      shares: qty,
      price,
      fifo_cost: isStop ? cost : null,
      new_avg_cost: pos.shares > 0 ? pos.avg_cost : null,
      total_shares: pos.shares,
      realized_pnl: realized,
      notes,
      date,
    }),
  );

  if (pos.shares <= 0) {
    data.exited_positions.unshift({
      ticker,
      exit_date: date,
      exit_price: price,
      shares: qty,
      avg_cost: cost,
      realized_pnl: realized,
      exit_type: isStop ? 'STOP-OUT' : 'SELL',
      approximate: false,
    });
    data.positions.splice(idx, 1);
    toasts.push(`${ticker} fully exited (${realized >= 0 ? '+' : ''}${realized} EGP realized)`);
  } else {
    if (isStop) {
      pos.position_label = `${pos.shares}sh runner (${qty}sh stopped@${price})`;
    } else {
      const tgt = order.target === 'T2' ? 'T2' : 'T1';
      pos.position_label = `${pos.shares}sh runner — ${tgt} filled ${qty}@${price}`;
    }
    recompute(pos);
    toasts.push(`${ticker}: ${qty}sh ${isStop ? 'stopped' : 'sold'}@${price} (${realized >= 0 ? '+' : ''}${realized} EGP), ${pos.shares}sh remain`);
  }

  return { toasts };
}

// correctEntry — fix a fat-finger entry: override shares + avg_cost directly (not FIFO),
// recompute P&L, and record a CORRECT audit entry. Caller recomputes status/alert.
export function correctEntry(data, { ticker, shares, avg_cost, date }) {
  const t = (ticker || '').toUpperCase();
  const s = Number(shares);
  const c = round2(Number(avg_cost));
  if (!(s > 0) || !(c > 0)) throw httpErr(400, 'shares and avg_cost must be positive');
  const pos = data.positions.find((p) => p.ticker === t);
  if (!pos) throw httpErr(404, `position ${t} not found`);
  const from = { shares: pos.shares, avg_cost: pos.avg_cost };
  pos.shares = s;
  pos.avg_cost = c;
  pos.position_label = `${s}sh — corrected ${date} @ ${c}`;
  if (pos.live_price > 0) {
    pos.unrealized_pnl = round2((pos.live_price - c) * s);
    pos.unrealized_pct = round2(((pos.live_price - c) / c) * 100);
  }
  data.action_log.unshift(
    logEntry({
      type: 'CORRECT', ticker: t, shares: s, price: c, new_avg_cost: c, total_shares: s,
      notes: `entry corrected from ${from.shares}sh @ ${from.avg_cost}`, date,
    }),
  );
  return { toasts: [`${t}: entry corrected to ${s}sh @ ${c}`] };
}
