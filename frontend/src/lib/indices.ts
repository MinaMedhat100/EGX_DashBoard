// Pure helpers for the Indices page (v2.9.0): zone ladder labels, tones, scenario markers.
import type { IndexAi, IndexLikely, IndexNewsItem, IndexTone, IndexZone, NewsPool, ZoneSource } from '../types/portfolio';

const TONE_CLASS: Record<IndexTone, string> = {
  bull: 'text-status-green border-status-green/40 bg-status-green/10',
  bear: 'text-status-red border-status-red/40 bg-status-red/10',
  neutral: 'text-status-yellow border-status-yellow/40 bg-status-yellow/10',
};

export function toneClass(tone?: string): string {
  return TONE_CLASS[tone as IndexTone] ?? TONE_CLASS.neutral;
}

export function zoneDots(n: number): string {
  const k = Math.min(3, Math.max(1, Math.round(n)));
  return '●'.repeat(k) + '○'.repeat(3 - k);
}

export function fmtLevel(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function zoneRange(z: IndexZone): string {
  const lo = fmtLevel(z.lo);
  const hi = fmtLevel(z.hi);
  return lo === hi ? lo : `${lo}–${hi}`;
}

export function distText(z: IndexZone): string {
  if (z.role === 'at_price') return 'at price';
  const sign = z.dist_pct > 0 ? '+' : '';
  return `${sign}${z.dist_pct.toFixed(2)}% · ${Math.abs(z.dist_atr).toFixed(1)} ATR`;
}

export function sourceLabel(s: ZoneSource): string {
  return `${s.name} ${s.tf}`;
}

// A snapshot from before v2.9.0: only a thesis paragraph, no sections.
export function isLegacy(ai: IndexAi): boolean {
  return !ai.trend_momentum?.length && !ai.scenarios?.bull && !ai.scenarios?.bear;
}

const gap = (v: number, z: IndexZone) => (v < z.lo ? z.lo - v : v > z.hi ? v - z.hi : 0);

// Zone id → '🐂' / '🐻' / '🐂🐻' for the zones the scenario trigger levels fall in (or sit nearest to).
export function scenarioMarks(ai: IndexAi | null | undefined, zones: IndexZone[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!ai?.scenarios || !zones.length) return out;
  for (const [side, mark] of [['bull', '🐂'], ['bear', '🐻']] as const) {
    const s = ai.scenarios[side];
    if (!s || s.off_zone || typeof s.level !== 'number') continue;
    const best = [...zones].sort((a, b) => gap(s.level, a) - gap(s.level, b))[0];
    out[best.id] = (out[best.id] ?? '') + mark;
  }
  return out;
}

export function costText(c: number | null | undefined): string | null {
  return c == null ? null : `AI read · $${c.toFixed(2)}`;
}

export function pickTab(saved: string | null, names: string[]): string | null {
  if (saved && names.includes(saved)) return saved;
  return names[0] ?? null;
}

// ── News & likely scenario (v2.10.0) ────────────────────────────────────────
export interface NewsRow extends IndexNewsItem { impact: IndexTone; why: string; }

// The AI's picks joined to the shared pool, in the AI's order; ids the pool doesn't have are dropped.
export function newsRows(ai: IndexAi | null | undefined, pool: NewsPool): NewsRow[] {
  const byId = new Map((pool?.items || []).map((i) => [i.id, i]));
  return (ai?.news || []).flatMap((p) => {
    const it = byId.get(p.id);
    return it ? [{ ...it, impact: p.impact, why: p.why }] : [];
  });
}

// legacy = a snapshot from before v2.10.0 (no pool); failed = every search failed.
export function newsState(pool: NewsPool, ai: IndexAi | null | undefined): 'legacy' | 'failed' | 'empty' | 'rows' {
  if (!pool) return 'legacy';
  if (pool.error) return 'failed';
  return newsRows(ai, pool).length ? 'rows' : 'empty';
}

// Age at viewing time (a snapshot can be days old); the stored age is the fallback for undated items.
export function newsAge(item: IndexNewsItem, now: number = Date.now()): string | null {
  const t = item.time ? Date.parse(item.time) : NaN;
  if (Number.isNaN(t)) return item.age ?? null;
  const h = Math.floor((now - t) / (60 * 60 * 1000));
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function impactMark(impact?: string): '▲' | '▼' | '•' {
  return impact === 'bull' ? '▲' : impact === 'bear' ? '▼' : '•';
}

const LIKELY_SIDE: Record<IndexLikely['side'], [string, string]> = {
  bull: ['🐂', 'Bull'],
  bear: ['🐻', 'Bear'],
  range: ['↔', 'Range'],
};
const LIKELY_CONF: Record<IndexLikely['confidence'], string> = { low: 'Low', medium: 'Medium', high: 'High' };

export function likelyLabel(l: IndexLikely | null | undefined): string | null {
  const side = l && LIKELY_SIDE[l.side];
  if (!side) return null;
  return `${side[0]} ${side[1]} · ${LIKELY_CONF[l.confidence] ?? 'Low'}`;
}

export function likelyMark(l: IndexLikely | null | undefined): string | null {
  return (l && LIKELY_SIDE[l.side]?.[0]) ?? null;
}

export function rangeBetween(zones: IndexZone[]): string | null {
  const sup = zones.filter((z) => z.role === 'support').sort((a, b) => b.hi - a.hi)[0];
  const res = zones.filter((z) => z.role === 'resistance').sort((a, b) => a.lo - b.lo)[0];
  return sup && res ? `between ${sup.id} and ${res.id}` : null;
}
