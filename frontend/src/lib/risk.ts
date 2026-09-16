// risk.ts — R-multiple framing (no position sizing / capital needed).
// 1R = initial risk per share (entry - stop). Targets and live P&L expressed in R.
import type { Position } from '../types/portfolio';

export function rMultiple(entry: number, stop: number, target: number): number | null {
  const risk = entry - stop;
  if (!risk || risk <= 0) return null;
  return (target - entry) / risk;
}

export interface PositionR {
  riskPerShare: number; // 1R in EGP/share
  liveR: number; // current unrealized in R (live vs avg)
  stopR: number; // distance above stop in R (>=0 means above stop)
  t1R: number | null;
  t2R: number | null;
}

export function positionR(
  avg: number,
  stop: number,
  live: number,
  t1: number,
  t2: number,
): PositionR | null {
  if (!stop || stop <= 0) return null; // no real stop yet (pending) -> R undefined
  const risk = avg - stop; // initial per-share risk from entry to stop
  if (!risk || risk <= 0) return null; // stop at/above cost -> risk-free, R undefined
  return {
    riskPerShare: risk,
    liveR: (live - avg) / risk,
    stopR: (live - stop) / risk,
    t1R: t1 > 0 ? (t1 - avg) / risk : null,
    t2R: t2 > 0 ? (t2 - avg) / risk : null,
  };
}

export function volatilityPct(
  bbUpper: number | null | undefined,
  bbLower: number | null | undefined,
  price: number | null | undefined,
): number | null {
  if (!bbUpper || !bbLower || !price) return null;
  return ((bbUpper - bbLower) / price) * 100;
}

export function volatilityLabel(pct: number | null): string {
  if (pct == null) return '';
  if (pct < 6) return 'low';
  if (pct < 14) return 'normal';
  return 'high';
}

export function fmtR(r: number | null | undefined): string {
  if (r == null || Number.isNaN(r)) return '—';
  const s = r >= 0 ? '+' : '';
  return `${s}${r.toFixed(1)}R`;
}

/**
 * Book open risk in EGP — a TS mirror of backend/services/portfolioStats.js `open_risk_egp`.
 * Keep in exact numeric parity with the Node source of truth: liquid positions only, per-lot for
 * brackets, and a stop above cost contributes zero rather than a negative.
 */
export function openRiskEgp(positions: Position[]): number {
  let total = 0;
  for (const p of positions || []) {
    if (!p.is_liquid) continue;
    if (p.brackets) {
      for (const l of p.brackets.lots) {
        if (l.tp_hit || l.stopped) continue;
        if (l.stop > 0) total += Math.max(0, p.avg_cost - l.stop) * l.shares;
      }
    } else if (p.stop_loss > 0) {
      total += Math.max(0, p.avg_cost - p.stop_loss) * p.shares;
    }
  }
  return total;
}
