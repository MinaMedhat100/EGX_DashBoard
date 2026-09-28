// journal.ts — timeline formatting for the trade journal (v2.6.0).
import type { JournalEvent, JournalLevels, TradeJournal } from '../types/portfolio';
import { fmtNum } from './format';

type AiRead = Extract<JournalEvent, { kind: 'ai_read' }>;
type OrderEvent = Extract<JournalEvent, { kind: 'order' }>;
export type TimelineItem = { key: string; event: JournalEvent; repeats: AiRead[] };

const same = (a?: number | null, b?: number | null) =>
  (a == null && b == null) || (a != null && b != null && Math.round(a * 100) === Math.round(b * 100));

function sameRead(a: AiRead, b: AiRead) {
  return a.recommendation === b.recommendation && a.conviction === b.conviction &&
    (['stop', 'stop_a', 'stop_b', 't1', 't2'] as const).every((k) => same(a.suggested[k], b.suggested[k]));
}

/** Consecutive AI reads that changed nothing fold into the first ("×4 reads, no change"). */
export function collapseReads(events: JournalEvent[]): TimelineItem[] {
  const out: TimelineItem[] = [];
  events.forEach((e, i) => {
    const last = out[out.length - 1];
    if (e.kind === 'ai_read' && last && last.event.kind === 'ai_read' && sameRead(last.event, e)) {
      last.repeats.push(e);
      return;
    }
    out.push({ key: `${i}-${e.at}`, event: e, repeats: [] });
  });
  return out;
}

/** MM-DD for ISO dates; legacy dates ("Jun 10, 2026") are shown as they are. */
export function shortDate(e: JournalEvent): string {
  const d = ('date' in e && e.date) || e.at;
  return /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(5, 10) : d;
}

const SOURCE: Record<string, string> = {
  ai_initial: 'AI set',
  ai_apply: 'AI apply',
  manual: 'manual edit',
  breakeven_at_t1: 'break-even at T1',
  seeded: 'levels when the journal started',
};
export const levelsSourceLabel = (s: string) => SOURCE[s] ?? s;

export function levelsText(from: JournalLevels | null, to: JournalLevels): string {
  const parts: string[] = [];
  const move = (label: string, a?: number | null, b?: number | null) => {
    if (from && same(a, b)) return;
    parts.push(from ? `${label} ${fmtNum(a ?? null)} → ${fmtNum(b ?? null)}` : `${label} ${fmtNum(b ?? null)}`);
  };
  if (to.lots) {
    for (const id of Object.keys(to.lots).sort()) {
      const a = from?.lots?.[id];
      const b = to.lots[id];
      move(`Stop ${id}`, a?.stop, b.stop);
      move(`${id === 'A' ? 'T1' : 'T2'} (Lot ${id})`, a?.tp, b.tp);
    }
  } else {
    move('Stop', from?.stop, to.stop);
    move('T1', from?.t1, to.t1);
    move('T2', from?.t2, to.t2);
  }
  return parts.join(' · ') || 'no change';
}

export function suggestedText(e: AiRead): string {
  const s = e.suggested;
  const stop = s.stop_a != null || s.stop_b != null
    ? `stop A ${fmtNum(s.stop_a)} / B ${fmtNum(s.stop_b)}`
    : `stop ${fmtNum(s.stop)}`;
  return `suggests ${stop}, T1 ${fmtNum(s.t1)}, T2 ${fmtNum(s.t2)}`;
}

const ORDER: Record<string, string> = { BUY_ADD: 'ADD', SELL: 'SELL', STOP_OUT: 'STOP-OUT' };
export function orderText(e: OrderEvent): string {
  const lot = e.lot ? ` Lot ${e.lot}` : '';
  const sh = e.shares != null ? ` ${e.shares.toLocaleString()}sh` : '';
  const pnl = e.realized_pnl != null ? ` · ${e.realized_pnl >= 0 ? '+' : ''}${fmtNum(e.realized_pnl, 0)}` : '';
  return `${ORDER[e.type] ?? e.type}${lot}${sh} @ ${fmtNum(e.price)}${pnl}`;
}

export const ORIGIN_LABEL: Record<TradeJournal['origin'], string> = {
  card: 'logged from card',
  no_card: 'manual entry',
  seeded: 'seeded',
  reconstructed: 'reconstructed',
};

/** How old the card was when the trade was entered — half of the ALUM story. */
export function cardAgeText(t: TradeJournal): string | null {
  if (!t.card?.scan_as_of || !t.opened_at) return null;
  const days = Math.round((Date.parse(t.opened_at) - Date.parse(t.card.scan_as_of.slice(0, 10))) / 86400000);
  if (!Number.isFinite(days)) return null;
  return days <= 0 ? 'card from the day of entry' : `card ${days} day${days > 1 ? 's' : ''} old when bought`;
}
