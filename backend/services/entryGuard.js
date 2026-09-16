// entryGuard.js — deterministic entry-discipline checks on the opportunity that actually ships.
// The AI writes the *condition* (wait_for); the board computes the *numbers*, so what the card
// shows cannot be hallucinated. Nothing here blocks an order.

// How far above the zone top price must sit before we call it "above the zone". A few piastres of
// drift should not raise a note.
export const ENTRY_GAP_MIN_PCT = 0.5;

const num = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null);
const r2 = (n) => Math.round(n * 100) / 100;
const zoneTop = (zone) => (Array.isArray(zone) ? (num(zone[1]) ?? num(zone[0])) : null);

/** Price above the top of the entry zone by more than the tolerance -> {level, above_pct}. */
export function entryGuard(entryZone, price) {
  const top = zoneTop(entryZone);
  const p = num(price);
  if (top == null || p == null || top <= 0) return null;
  const abovePct = ((p - top) / top) * 100;
  if (abovePct <= ENTRY_GAP_MIN_PCT) return null;
  return { level: r2(top), above_pct: r2(abovePct) };
}

/**
 * Did the entry zone chase price upward since the prior read? True when the zone top rose, price
 * rose, and the zone now sits at or above price — ALUM's Aug 25->28 pattern, where "wait for a
 * pullback" quietly became "buy at the market".
 */
export function entryZoneChasing(entryZone, price, prior) {
  const top = zoneTop(entryZone);
  const p = num(price);
  const priorTop = zoneTop(prior?.entry_zone);
  const priorPrice = num(prior?.price);
  if (top == null || p == null || priorTop == null || priorPrice == null) return false;
  return top > priorTop && p > priorPrice && top >= p * 0.995;
}

/** Attach the board-computed entry numbers to each opportunity, by ticker. Mutates in place. */
export function annotateEntries(opportunities, priceByTicker, priors = {}) {
  for (const o of opportunities || []) {
    if (!o || !o.ticker) continue;
    const key = String(o.ticker).toUpperCase();
    const price = num(priceByTicker?.[key]);
    if (price != null) o.price = price;
    o.entry_guard = entryGuard(o.entry_zone, price);
    if (entryZoneChasing(o.entry_zone, price, priors?.[key])) {
      const flags = Array.isArray(o.overextension) ? o.overextension : [];
      if (!flags.includes('entry_zone_chasing')) flags.push('entry_zone_chasing');
      o.overextension = flags;
    }
  }
  return opportunities;
}
