// lessons.ts — text helpers for the Lessons page (v2.8.0). Pure; tested with node --test.
import type { BacklogState, LessonCategory, LessonCoverage } from '../types/portfolio';

export function coverageText(c: LessonCoverage): string {
  return `${c.closed} closed · ${c.reviewed} reviewed · ${c.unreviewed} not reviewed · ${c.waiting} waiting · ${c.failed} failed`;
}

export function problemSummary(c: Pick<LessonCategory, 'count' | 'winners'>): string {
  if (!c.count) return 'no problem trades';
  const base = `${c.count} problem trade${c.count > 1 ? 's' : ''}`;
  return c.winners ? `${base} (${c.winners} still made money)` : base;
}

export function backlogText(b: BacklogState): string | null {
  if (b.running) return `Reviewing ${b.done + b.skipped + 1} / ${b.total}…`;
  if (!b.finished_at) return null;
  if (b.error) return `Stopped after ${b.done} review${b.done === 1 ? '' : 's'} at ${b.failed_on}: ${b.error}`;
  return `Backlog review finished: ${b.done} reviewed, ${b.skipped} skipped`;
}

export function noiseSummary(m: { checked: number; inside: number; recovered: number }): string {
  if (!m.checked) return 'No reviewed trade has a known stop distance yet';
  return `${m.inside} of ${m.checked} reviewed trades had a stop under 1.5× ATR; ${m.recovered} came back to the entry within 10 sessions`;
}
