// levelService.js — pure logic for adopting / proposing / committing position levels.
import { evaluateStatus, buildAlert } from './statusEngine.js';

const round2 = (n) => Math.round(n * 100) / 100;

// Positive finite number or null (treat 0 / NaN / negative as "no value").
function pos(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// New position (levels_source 'pending') -> adopt AI's suggested levels.
// Existing position -> return a proposal, leave real levels untouched.
export function applyAiLevels(position) {
  const ai = position.ai || {};
  const stop = pos(ai.suggested_stop);
  const t1 = pos(ai.suggested_t1);
  const t2 = pos(ai.suggested_t2);
  if (position.levels_source === 'pending') {
    if (stop != null) position.stop_loss = stop;
    if (t1 != null) position.t1_price = t1;
    if (t2 != null) position.t2_price = t2;
    position.levels_source = 'ai';
    return { applied: true };
  }
  return { applied: false, proposal: { stop, t1, t2 } };
}

// User-confirmed levels (confirm chip or manual editor) -> commit + mark manual.
export function commitLevels(position, levels) {
  const stop = pos(levels.stop);
  const t1 = pos(levels.t1);
  const t2 = pos(levels.t2);
  if (stop != null) position.stop_loss = stop;
  if (t1 != null) position.t1_price = t1;
  if (t2 != null) position.t2_price = t2;
  position.levels_source = 'manual';
}

// Recompute P&L + deterministic status/alert from the stored live indicator set.
export function recomputeDerived(position) {
  if (position.live_price > 0 && position.avg_cost) {
    position.unrealized_pnl = round2((position.live_price - position.avg_cost) * position.shares);
    position.unrealized_pct = round2(((position.live_price - position.avg_cost) / position.avg_cost) * 100);
  }
  const live = position.indicators;
  if (live && live.price != null) {
    const status = evaluateStatus(position, live);
    position.status_key = status;
    position.alert = buildAlert(position, live, status, null);
  }
}
