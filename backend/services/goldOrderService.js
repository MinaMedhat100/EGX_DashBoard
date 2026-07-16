// goldOrderService.js — order math for the single self-contained gold position (USD/oz).
// Mirrors orderService.js rules, scoped to goldStore state (state.position / realized_pnl_usd).
import { randomUUID } from 'node:crypto';

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
    id: randomUUID().slice(0, 12), date: e.date, type: e.type,
    shares: e.shares ?? null, price: e.price ?? null,
    new_avg_cost: e.new_avg_cost ?? null, total_shares: e.total_shares ?? null,
    realized_pnl: e.realized_pnl ?? null, notes: e.notes ?? '',
  };
}

export function makeGoldPosition(order) {
  const { shares, price, date } = order;
  return {
    avg_cost: price, live_price: price, shares,
    stop_loss: Number(order.stop_loss) || 0, stop_raised: false,
    levels_source: 'pending',
    t1_hit: false, t2_hit: false,
    t1_fill_price: null, t1_fill_date: null, t2_fill_price: null, t2_fill_date: null,
    t1_price: Number(order.t1_price) || 0, t2_price: Number(order.t2_price) || 0,
    position_label: `${shares}oz — entered ${date} @ ${price}`,
    status_key: 'yellow', tv_signal: '—',
    unrealized_pnl: 0, unrealized_pct: 0,
    indicators: null, mtf: null, alert: null, ai: null,
  };
}

export function applyGoldOrder(state, order) {
  const type = order.type;
  const shares = Number(order.shares);
  const price = Number(order.price);
  const date = order.date || new Date().toISOString().slice(0, 10);
  const notes = order.notes || '';
  const toasts = [];

  if (!type) throw httpErr(400, 'type is required');
  const pos = state.position;

  if (type === 'BUY_NEW') {
    if (pos) throw httpErr(400, 'gold position already open — use Add');
    if (!shares || !price) throw httpErr(400, 'shares and price required');
    state.position = makeGoldPosition({ ...order, shares, price, date });
    state.action_log.unshift(logEntry({ type: 'BUY', shares, price, new_avg_cost: price, total_shares: shares, notes, date }));
    toasts.push(`Opened gold: ${shares}oz @ ${price}`);
    return { toasts };
  }

  if (!pos) throw httpErr(404, 'no open gold position');

  if (type === 'BUY_ADD') {
    if (!shares || !price) throw httpErr(400, 'shares and price required');
    const total = pos.shares + shares;
    pos.avg_cost = round2((pos.avg_cost * pos.shares + price * shares) / total);
    pos.shares = total;
    pos.position_label = `${total}oz — avg ${pos.avg_cost} (added ${shares}@${price} ${date})`;
    recompute(pos);
    state.action_log.unshift(logEntry({ type: 'BUY (add)', shares, price, new_avg_cost: pos.avg_cost, total_shares: total, notes, date }));
    toasts.push(`Gold: averaged to ${pos.avg_cost} over ${total}oz`);
    return { toasts };
  }

  if (type !== 'SELL' && type !== 'STOP_OUT') throw httpErr(400, `unknown order type ${type}`);
  if (!shares || !price) throw httpErr(400, 'shares and price required');

  const qty = Math.min(shares, pos.shares);
  const isStop = type === 'STOP_OUT';
  const realized = round2((price - pos.avg_cost) * qty);
  state.realized_pnl_usd = round2(state.realized_pnl_usd + realized);
  pos.shares -= qty;

  if (type === 'SELL') {
    if (order.target === 'T2') { pos.t2_hit = true; pos.t2_fill_price = price; pos.t2_fill_date = date; }
    else { pos.t1_hit = true; pos.t1_fill_price = price; pos.t1_fill_date = date; }
    if (order.raise_stop_be && pos.shares > 0 && pos.avg_cost > 0) {
      pos.stop_loss = pos.avg_cost; pos.stop_raised = true;
      toasts.push(`Stop raised to break-even ${pos.avg_cost}`);
    }
  }

  state.action_log.unshift(logEntry({
    type: isStop ? 'STOP-OUT' : 'SELL', shares: qty, price,
    new_avg_cost: pos.shares > 0 ? pos.avg_cost : null, total_shares: pos.shares,
    realized_pnl: realized, notes, date,
  }));

  if (pos.shares <= 0) {
    state.position = null;
    toasts.push(`Gold fully exited (${realized >= 0 ? '+' : ''}${realized} USD realized)`);
  } else {
    pos.position_label = `${pos.shares}oz runner (${qty}oz ${isStop ? 'stopped' : 'sold'}@${price})`;
    recompute(pos);
    toasts.push(`Gold: ${qty}oz ${isStop ? 'stopped' : 'sold'}@${price} (${realized >= 0 ? '+' : ''}${realized} USD), ${pos.shares}oz remain`);
  }
  return { toasts };
}
