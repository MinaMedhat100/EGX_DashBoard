// levelService.js — pure logic for adopting / proposing / committing position levels.
import { evaluateStatus, buildAlert } from './statusEngine.js';
import { openLots, syncBracketSummary } from './bracketService.js';

const round2 = (n) => Math.round(n * 100) / 100;

// Positive finite number or null (treat 0 / NaN / negative as "no value").
function pos(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Open-lot-aware AI proposal for a bracketed position. Maps ai.suggested_* to the OPEN lots:
// stop -> every open lot; t1 -> Lot A only if open; t2 -> Lot B only if open. Returns the proposal
// only when a mapped level actually differs from the current open-lot value, else null.
export function bracketProposal(position) {
  const ai = position.ai || {};
  const open = openLots(position.brackets);
  if (!open.length) return null;
  const a = position.brackets.lots.find((l) => l.id === 'A');
  const b = position.brackets.lots.find((l) => l.id === 'B');
  const aOpen = open.some((l) => l.id === 'A');
  const bOpen = open.some((l) => l.id === 'B');
  const stop = pos(ai.suggested_stop);
  const t1 = aOpen ? pos(ai.suggested_t1) : null;
  const t2 = bOpen ? pos(ai.suggested_t2) : null;
  const curStop = Math.min(...open.map((l) => l.stop));
  const diff =
    (stop != null && round2(stop) !== round2(curStop)) ||
    (t1 != null && a && round2(t1) !== round2(a.tp_price)) ||
    (t2 != null && b && round2(t2) !== round2(b.tp_price));
  return diff ? { stop, t1, t2 } : null;
}

// New position (levels_source 'pending') -> adopt AI's suggested levels.
// Existing position -> return a proposal, leave real levels untouched.
export function applyAiLevels(position) {
  // Bracketed positions manage stop/targets per OPEN lot; return an open-lot-aware proposal
  // (verify at entry, manage the runner later) — never a classic whole-position apply.
  if (position.brackets) {
    const proposal = bracketProposal(position);
    return proposal ? { applied: false, proposal } : { applied: false };
  }
  const ai = position.ai || {};
  const stop = pos(ai.suggested_stop);
  const t1 = pos(ai.suggested_t1);
  const t2 = pos(ai.suggested_t2);
  if (position.levels_source === 'pending') {
    if (stop == null) return { applied: false, error: 'AI returned no stop' };
    position.stop_loss = stop;
    if (t1 != null) position.t1_price = t1;
    if (t2 != null) position.t2_price = t2;
    position.levels_source = 'ai';
    return { applied: true };
  }
  return { applied: false, proposal: { stop, t1, t2 } };
}

// True if any of the proposal's non-null levels differs from the position's
// stored stop/t1/t2 (compared at 2dp). Used to decide whether a full Refresh
// should surface an "Apply AI levels" chip — no chip when nothing actually moved.
export function proposalDiffers(position, proposal) {
  if (!proposal) return false;
  const pairs = [
    [proposal.stop, position.stop_loss],
    [proposal.t1, position.t1_price],
    [proposal.t2, position.t2_price],
  ];
  return pairs.some(([next, cur]) => next != null && round2(next) !== round2(cur ?? 0));
}

// User-confirmed levels (confirm chip or manual editor) -> commit + mark manual.
// Bracketed positions write only to their OPEN lots (the real, editable ThndrX orders): stop to
// every open lot, t1 to Lot A / t2 to Lot B when open; closed lots untouched; then resync mirrors.
export function commitLevels(position, levels) {
  const stop = pos(levels.stop);
  const t1 = pos(levels.t1);
  const t2 = pos(levels.t2);
  if (position.brackets) {
    for (const l of openLots(position.brackets)) {
      if (stop != null) l.stop = stop;
      if (l.id === 'A' && t1 != null) l.tp_price = t1;
      if (l.id === 'B' && t2 != null) l.tp_price = t2;
    }
    syncBracketSummary(position);
    return;
  }
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
