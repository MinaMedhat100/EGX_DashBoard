import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { TradeJournal, JournalEvent } from '../../types/portfolio';
import { fmtNum, fmtEgp } from '../../lib/format';
import {
  collapseReads, shortDate, levelsText, levelsSourceLabel, suggestedText, orderText, ORIGIN_LABEL, cardAgeText,
} from '../../lib/journal';

function EventLine({ e, repeats }: { e: JournalEvent; repeats: number }) {
  const [open, setOpen] = useState(false);
  const date = <span className="text-txt-secondary">{shortDate(e)}</span>;
  if (e.kind === 'ai_read') {
    return (
      <div>
        <button onClick={() => setOpen((o) => !o)} className="text-left hover:text-txt-primary">
          {date} · {fmtNum(e.price)} · <b>{e.recommendation ?? '—'}</b>
          {e.conviction != null ? ` ${e.conviction}/5` : ''} · {suggestedText(e)}
          {repeats > 0 && <span className="text-txt-secondary"> · ×{repeats + 1} reads, no change</span>}
        </button>
        {open && (
          <div className="text-txt-secondary whitespace-pre-wrap mt-0.5 ml-4">
            {e.thesis}{e.key_risk ? `\n⚠ ${e.key_risk}` : ''}
          </div>
        )}
      </div>
    );
  }
  if (e.kind === 'levels') {
    return <div>{date} · {levelsText(e.from, e.to)} · <span className="text-txt-secondary">{levelsSourceLabel(e.source)}</span></div>;
  }
  if (e.kind === 'order') return <div>{date} · {orderText(e)}</div>;
  if (e.kind === 'correction') {
    return (
      <div>
        {date} · Entry corrected {e.from ? `${e.from.shares}sh @ ${e.from.avg_cost}` : '?'} → {e.to.shares ?? '?'}sh @ {e.to.avg_cost ?? '?'}
      </div>
    );
  }
  return <div className="text-status-yellow">{date} · ⚠ {e.note}</div>;
}

export function JournalTimeline({ tradeId }: { tradeId: string }) {
  const [trade, setTrade] = useState<TradeJournal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showThesis, setShowThesis] = useState(false);

  useEffect(() => {
    let live = true;
    api.getJournal(tradeId)
      .then((r) => { if (live) setTrade(r.trade); })
      .catch((e) => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [tradeId]);

  if (error) return <div className="mt-2 text-xs text-txt-secondary">Journal unavailable ({error}).</div>;
  if (!trade) return <div className="mt-2 text-xs text-txt-secondary">Loading journal…</div>;

  const en = trade.entry;
  const items = collapseReads(trade.events);
  const hasReads = trade.events.some((e) => e.kind === 'ai_read');
  const age = cardAgeText(trade);

  return (
    <div className="mt-2 rounded-lg px-3 py-2 bg-surface border border-border text-[11px] font-mono space-y-1">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 items-center">
        <span className="px-1.5 rounded bg-accent-purple/15 text-accent-purple-lt">{ORIGIN_LABEL[trade.origin] ?? trade.origin}</span>
        {trade.card_source === 'scan_history_match' && (
          <span className="px-1.5 rounded border border-border text-txt-secondary">card matched from scan history</span>
        )}
        <span className="text-txt-secondary">{trade.events.length} events</span>
      </div>
      <div>
        Plan: {en?.price != null ? `entry ${fmtNum(en.price)}` : 'entry ?'}
        {en?.levels_known
          ? ` · stop ${fmtNum(en.stop)} · T1 ${fmtNum(en.t1)} · T2 ${fmtNum(en.t2)}${en.split != null ? ` · split ${en.split}/${100 - en.split}` : ''}`
          : ' · plan not recorded'}
      </div>
      {trade.card && (
        <div>
          <button onClick={() => setShowThesis((s) => !s)} className="text-left hover:text-txt-primary">
            Card: score {trade.card.score ?? '—'} · conviction {trade.card.conviction ?? '—'}/5
            {trade.card.overextension?.length ? ` · ⚠ ${trade.card.overextension.join(', ')}` : ''}
            {trade.card.wait_for ? ` · wait for ${trade.card.wait_for}` : ''}
            {age ? ` · ${age}` : ''}
          </button>
          {showThesis && trade.card.thesis && (
            <div className="text-txt-secondary whitespace-pre-wrap mt-0.5 ml-4">{trade.card.thesis}</div>
          )}
        </div>
      )}
      {!hasReads && <div className="text-txt-secondary">No AI reads were recorded for this trade.</div>}
      {items.map((it) => <EventLine key={it.key} e={it.event} repeats={it.repeats.length} />)}
      {trade.exit && (
        <div className={trade.exit.realized_pnl != null && trade.exit.realized_pnl < 0 ? 'text-status-red' : 'text-status-green'}>
          {trade.exit.date?.slice(5) ?? '—'} · Closed {trade.exit.type} @ {fmtNum(trade.exit.price)}
          {trade.exit.realized_pnl != null ? ` · ${fmtEgp(trade.exit.realized_pnl)}` : ''}
        </div>
      )}
    </div>
  );
}
