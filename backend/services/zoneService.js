// zoneService.js — merge an index's daily + weekly price levels into scored support/resistance zones (v2.9.0).
// Pure. Levels come from the bridge's extract_levels: [{ name, tf: 'D' | 'W', value }]. Code builds the zones so
// every number on the Indices page traces back to a real level; the AI only explains them.

export const ZONE_MERGE_ATR = 0.5; // neighbouring levels this close (in daily ATRs) are one zone
export const ZONES_PER_SIDE = 5;
export const WEEKLY_WEIGHT = 2; // a weekly level counts double: slower, watched by more traders

const r2 = (n) => Math.round(n * 100) / 100;

export function zoneGap(value, zone) {
  if (value < zone.lo) return zone.lo - value;
  if (value > zone.hi) return value - zone.hi;
  return 0;
}

const usable = (ls) => (ls || []).filter((l) => l && Number.isFinite(l.value) && l.value > 0);
const byValue = (a, b) => a.value - b.value;

// Neighbouring levels (sorted) within the merge distance form one group.
function chain(sorted, tol) {
  const groups = [];
  for (const l of sorted) {
    const g = groups[groups.length - 1];
    if (g && l.value - g.hi <= tol) {
      g.sources.push(l);
      g.hi = l.value;
    } else {
      groups.push({ lo: l.value, hi: l.value, sources: [l] });
    }
  }
  return groups;
}

// One turning point seen on both daily and weekly bars (or as the year high) is one level: keep the weekly copy.
function onePerPoint(levels) {
  const byPoint = new Map();
  for (const l of levels) {
    const key = r2(l.value);
    const had = byPoint.get(key);
    if (!had || (had.tf !== 'W' && l.tf === 'W')) byPoint.set(key, l);
  }
  return [...byPoint.values()];
}

// extra (v2.11.0, ESTHMR swing levels) is added after the zones are built: a level within the merge distance of a
// zone joins the nearest one, the rest form zones of their own. So extra levels never join two zones into one.
export function buildZones(levels, price, atr, extra = []) {
  if (!(price > 0) || !(atr > 0)) return [];
  const tol = ZONE_MERGE_ATR * atr + 1e-9;
  const groups = chain(usable(levels).sort(byValue), tol);

  const edges = groups.map(({ lo, hi }) => ({ lo, hi }));
  const loose = [];
  for (const l of onePerPoint(usable(extra))) {
    let best = -1;
    edges.forEach((e, i) => {
      const gap = zoneGap(l.value, e);
      if (gap <= tol && (best < 0 || gap < zoneGap(l.value, edges[best]))) best = i;
    });
    if (best < 0) { loose.push(l); continue; }
    const g = groups[best];
    g.sources.push(l);
    g.lo = Math.min(g.lo, l.value);
    g.hi = Math.max(g.hi, l.value);
  }
  for (const g of groups) g.sources.sort(byValue);
  groups.push(...chain(loose.sort(byValue), tol));

  const zones = groups.map((g) => {
    const score = g.sources.reduce((s, x) => s + (x.tf === 'W' ? WEEKLY_WEIGHT : 1), 0);
    const role = g.lo <= price && price <= g.hi ? 'at_price' : g.lo > price ? 'resistance' : 'support';
    const edge = role === 'resistance' ? g.lo : role === 'support' ? g.hi : price;
    return {
      lo: r2(g.lo), hi: r2(g.hi), mid: r2((g.lo + g.hi) / 2),
      sources: g.sources.map(({ name, tf, value }) => ({ name, tf, value })),
      score,
      dots: score <= 1 ? 1 : score <= 3 ? 2 : 3,
      role,
      dist_pct: r2(((edge - price) / price) * 100),
      dist_atr: r2((edge - price) / atr),
    };
  });

  const resistances = zones.filter((z) => z.role === 'resistance').sort((a, b) => a.lo - b.lo).slice(0, ZONES_PER_SIDE);
  const supports = zones.filter((z) => z.role === 'support').sort((a, b) => b.hi - a.hi).slice(0, ZONES_PER_SIDE);
  const atPrice = zones.filter((z) => z.role === 'at_price');
  return [...resistances, ...atPrice, ...supports]
    .sort((a, b) => b.hi - a.hi)
    .map((z, i) => ({ id: `Z${i + 1}`, ...z }));
}

export function nearestZone(zones, role) {
  return (zones || [])
    .filter((z) => z.role === role)
    .sort((a, b) => Math.abs(a.dist_atr) - Math.abs(b.dist_atr))[0] ?? null;
}
