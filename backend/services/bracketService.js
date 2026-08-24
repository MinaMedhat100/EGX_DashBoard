// backend/services/bracketService.js — pure two-lot bracket lifecycle (Node source of truth;
// mirrored in frontend/src/lib/brackets.ts). Consumers branch on `position.brackets`.
const round2 = (n) => Math.round(n * 100) / 100;

function lot(id, target, shares, tp_price, stop) {
  return { id, target, shares, tp_price, stop, tp_hit: false, stopped: false, stop_raised: false, exit_price: null, exit_date: null };
}

export function makeBracket(entryPrice, totalShares, splitAPct, stop, t1, t2) {
  const total = Math.max(2, Math.trunc(totalShares));
  const a = Math.min(total - 1, Math.max(1, Math.ceil((total * splitAPct) / 100))); // Lot A takes the extra
  const b = total - a;
  return { entry_price: entryPrice, lots: [lot('A', 'T1', a, t1, stop), lot('B', 'T2', b, t2, stop)] };
}

export function openLots(brackets) {
  return (brackets?.lots || []).filter((l) => !l.tp_hit && !l.stopped);
}

export function isFullyExited(brackets) {
  return openLots(brackets).length === 0;
}

export function bracketRealized(lot, avgCost) {
  return round2(((lot.exit_price ?? 0) - avgCost) * lot.shares);
}

export function syncBracketSummary(pos) {
  const open = openLots(pos.brackets);
  const a = pos.brackets.lots.find((l) => l.id === 'A');
  const b = pos.brackets.lots.find((l) => l.id === 'B');
  pos.shares = open.reduce((s, l) => s + l.shares, 0);
  const stops = open.map((l) => l.stop).filter((s) => s > 0);
  pos.stop_loss = stops.length ? Math.min(...stops) : 0;
  if (a) { pos.t1_price = a.tp_price; pos.t1_hit = !!a.tp_hit; }
  if (b) { pos.t2_price = b.tp_price; pos.t2_hit = !!b.tp_hit; }
  return pos;
}

export function raiseLotStop(pos, lotId, newStop) {
  const l = pos.brackets.lots.find((x) => x.id === lotId);
  if (l && !l.tp_hit && !l.stopped) { l.stop = newStop; l.stop_raised = true; }
  return syncBracketSummary(pos);
}

export function settleLot(pos, lotId, fill, avgCost) {
  const l = pos.brackets.lots.find((x) => x.id === lotId);
  if (!l || l.tp_hit || l.stopped) return { realized: 0, lot: null };
  if (fill.kind === 'tp') l.tp_hit = true; else l.stopped = true;
  l.exit_price = fill.price;
  l.exit_date = fill.date;
  const realized = bracketRealized(l, avgCost);
  syncBracketSummary(pos);
  return { realized, lot: l };
}
