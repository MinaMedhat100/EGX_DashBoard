// frontend/src/lib/brackets.ts — TS mirror of backend/services/bracketService.js (pure fns the UI needs).
// Keep in exact numeric parity with the Node source of truth.
import type { Opportunity } from '../types/portfolio';

export interface BracketPlan {
  split: [number, number];
  split_reason: string;
  lot_a: { pct: number; tp: number | null; stop: number | null };
  lot_b: { pct: number; tp: number | null; stop: number | null };
  rr_a: number | null;
  rr_b: number | null;
}
const r2 = (n: number) => Math.round(n * 100) / 100;

export function bracketPlan(o: Opportunity, splitAPct?: number): BracketPlan {
  const a = splitAPct ?? o.split?.[0] ?? 50;
  const b = 100 - a;
  const entry = o.entry_zone?.[1] ?? o.entry_zone?.[0] ?? null;
  const rr = (tp?: number | null) =>
    entry != null && o.stop != null && entry > o.stop && tp != null ? r2((tp - entry) / (entry - o.stop)) : null;
  return {
    split: [a, b], split_reason: o.split_reason || '',
    lot_a: { pct: a, tp: o.t1 ?? null, stop: o.stop ?? null },
    lot_b: { pct: b, tp: o.t2 ?? null, stop: o.stop ?? null },
    rr_a: rr(o.t1), rr_b: rr(o.t2),
  };
}
