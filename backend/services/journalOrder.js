// journalOrder.js — real-world ordering of journal events (port of frontend/src/lib/journalOrder.ts,
// v2.6.1). Keep the two in step: the post-mortem must read events in the order the timeline shows.
const DAY = 86400000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;
const TEXT_DAY = /^[A-Za-z]{3,9} \d{1,2}, \d{4}$/; // "Jun 10, 2026" — anything vaguer is not a day

function isoDay(d) {
  if (!d) return null;
  if (ISO_DAY.test(d)) return d.slice(0, 10);
  if (!TEXT_DAY.test(d)) return null;
  const t = Date.parse(d);
  if (!Number.isFinite(t)) return null;
  const x = new Date(t);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function eventDay(e) {
  const happened = e.kind === 'ai_read' ? e.analyzed_at
    : e.kind === 'order' || e.kind === 'correction' ? e.date
    : null;
  return isoDay(happened) ?? e.at.slice(0, 10);
}

export function orderTimeline(events) {
  return events
    .map((e, i) => ({ e, i, d: eventDay(e) }))
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.i - b.i))
    .map((x) => x.e);
}

export function loggedLateDays(e) {
  if (e.kind !== 'order' && e.kind !== 'correction') return null;
  if (!e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return null;
  const days = Math.round((Date.parse(e.at.slice(0, 10)) - Date.parse(e.date)) / DAY);
  return days >= 2 ? days : null;
}

export function readAfterClose(e, exitDate) {
  if (e.kind !== 'ai_read' || !exitDate || !/^\d{4}-\d{2}-\d{2}$/.test(exitDate)) return false;
  return eventDay(e) > exitDate;
}
