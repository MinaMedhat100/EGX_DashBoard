// Pure helpers for the Indices page (v2.9.0): zone ladder labels, tones, scenario markers.
import type { IndexAi, IndexTone, IndexZone, ZoneSource } from '../types/portfolio';

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
