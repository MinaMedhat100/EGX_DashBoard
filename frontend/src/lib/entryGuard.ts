export const ENTRY_DIVERGENCE = 5; // suspect at >= 5x either direction

// Returns the divergence ratio when avg_cost looks like a data-entry error vs the live price,
// else null. Both inputs must be positive finite numbers (illiquid/no-live -> null, no warning).
export function entryPriceSuspect(
  avgCost?: number | null,
  livePrice?: number | null,
  threshold = ENTRY_DIVERGENCE,
): { ratio: number } | null {
  const a = Number(avgCost);
  const l = Number(livePrice);
  if (!(a > 0) || !(l > 0)) return null;
  const ratio = Math.max(a / l, l / a);
  return ratio >= threshold ? { ratio } : null;
}
