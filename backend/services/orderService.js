// orderService.js — order-trigger logging with FIFO cost basis.
// Mutates the portfolio data object in place (caller persists). Per prompt.md Step 6.
import { v4 as uuid } from 'uuid';

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
    t1_hit: false,
    t1_price: Number(order.t1_price) || 0,
    t2_price: Number(order.t2_price) || 0,
    position_label: `${shares}sh — entered ${date} @ ${price}`,
    daily_chg: null,
    chg_pos: null,
    status_key: 'yellow',
    tv_signal: '—',
    analysis_notes: order.notes || 'New position — pending first refresh.',
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
  if (type !== 'BUY_NEW' && type !== 'BUY_ADD' && (!shares || shares <= 0)) {
    throw httpErr(400, 'shares must be a positive number');
  }

  const idx = data.positions.findIndex((p) => p.ticker === ticker);
  const pos = idx >= 0 ? data.positions[idx] : null;

  // ── BUY (new position) ──────────────────────────────────────────────────────
  if (type === 'BUY_NEW') {
    if (pos) throw httpErr(400, `${ticker} already held — use "Add to position"`);
    if (!shares || !price) throw httpErr(400, 'shares and price required');
    data.positions.push(makeNewPosition({ ...order, ticker, shares, price }, date));
    data.action_log.unshift(
      logEntry({ type: 'BUY', ticker, shares, price, new_avg_cost: price, total_shares: shares, notes, date }),
    );
    toasts.push(`Opened ${ticker}: ${shares}sh @ ${price}`);
    return { toasts };
  }

  if (!pos) throw httpErr(404, `position ${ticker} not found`);

  // ── BUY (add to existing) ───────────────────────────────────────────────────
  if (type === 'BUY_ADD') {
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
    if (order.target === 'T2') pos.t2_hit = true;
    else {
      pos.t1_hit = true;
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
    if (isStop) pos.position_label = `${pos.shares}sh runner (${qty}sh stopped@${price})`;
    recompute(pos);
    toasts.push(`${ticker}: ${qty}sh ${isStop ? 'stopped' : 'sold'}@${price} (${realized >= 0 ? '+' : ''}${realized} EGP), ${pos.shares}sh remain`);
  }

  return { toasts };
}
