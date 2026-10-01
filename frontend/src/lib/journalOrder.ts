// journalOrder.ts — real-world ordering for the trade journal timeline (v2.6.1).
// Events are stored in the order they were saved; a stop logged days after it filled,
// or a backfilled read, would otherwise show out of sequence.
import type { JournalEvent } from '../types/portfolio';

const DAY = 86400000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;
const TEXT_DAY = /^[A-Za-z]{3,9} \d{1,2}, \d{4}$/; // "Jun 10, 2026" — anything vaguer is not a day

/** YYYY-MM-DD for an ISO date or a legacy text date ("Jun 10, 2026"); null when unparseable. */
function isoDay(d: string | null | undefined): string | null {
  if (!d) return null;
  if (ISO_DAY.test(d)) return d.slice(0, 10);
  if (!TEXT_DAY.test(d)) return null;
  const t = Date.parse(d);
  if (!Number.isFinite(t)) return null;
  const x = new Date(t);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/** When the event happened: the analysis time for reads, the trade date for orders and corrections, else the save time. */
export function eventDay(e: JournalEvent): string {
  const happened = e.kind === 'ai_read' ? e.analyzed_at
    : e.kind === 'order' || e.kind === 'correction' ? e.date
    : null;
  return isoDay(happened) ?? e.at.slice(0, 10);
}

/** A copy sorted by eventDay; events on the same day keep their save order. */
export function orderTimeline<T extends JournalEvent>(events: T[]): T[] {
  return events
    .map((e, i) => ({ e, i, d: eventDay(e) }))
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.i - b.i))
    .map((x) => x.e);
}

/** Days between an order's ISO trade date and when it was saved, when that is 2 or more; else null. */
export function loggedLateDays(e: JournalEvent): number | null {
  if (e.kind !== 'order' && e.kind !== 'correction') return null;
  if (!e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return null;
  const days = Math.round((Date.parse(e.at.slice(0, 10)) - Date.parse(e.date)) / DAY);
  return days >= 2 ? days : null;
}

/** True for an AI read analysed after the trade's (ISO) exit day — it described a closed trade. */
export function readAfterClose(e: JournalEvent, exitDate: string | null | undefined): boolean {
  if (e.kind !== 'ai_read' || !exitDate || !/^\d{4}-\d{2}-\d{2}$/.test(exitDate)) return false;
  return eventDay(e) > exitDate;
}
