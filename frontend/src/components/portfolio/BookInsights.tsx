import type { PortfolioData } from '../../types/portfolio';
import { bookStats } from '../../lib/bookStats';
import { GlowCard } from '../common/GlowCard';
import { fmtNum, timeAgo } from '../../lib/format';

export function BookInsights({ data }: { data: PortfolioData }) {
  const s = bookStats(data.positions);
  const book = data.book_ai;
  if (!s.count) return null;
  return (
    <GlowCard className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-[11px] uppercase tracking-wide text-txt-secondary">Book</span>
        <span>Open risk <b className="font-mono text-status-red">{fmtNum(s.open_risk_egp, 0)} EGP</b></span>
        {s.largest && (
          <span>Largest <b className="font-mono">{s.largest.ticker}</b> <span className="text-txt-secondary">({s.largest.pct}%)</span></span>
        )}
        {s.unprotected.length > 0 && (
          <span className="text-status-orange">{s.unprotected.length} unprotected: {s.unprotected.join(', ')}</span>
        )}
      </div>
      {book ? (
        <div className="space-y-1.5 text-sm border-t border-border pt-2">
          {book.posture && <p className="text-txt-primary">{book.posture}</p>}
          {book.concentration && <p className="text-[12px] text-txt-secondary">🏷 {book.concentration}</p>}
          {book.clusters && book.clusters.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {book.clusters.map((c, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-surface border border-border text-txt-secondary">{c}</span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 text-[12px]">
            {book.strongest?.ticker && <span className="text-status-green">↑ {book.strongest.ticker} — {book.strongest.why}</span>}
            {book.weakest?.ticker && <span className="text-status-red">↓ {book.weakest.ticker} — {book.weakest.why}</span>}
          </div>
          {book.risk_note && <p className="text-[11px] text-txt-secondary">⚠ {book.risk_note}</p>}
          {book.analyzed_at && <div className="text-[10px] text-txt-secondary">AI read {timeAgo(book.analyzed_at)}</div>}
        </div>
      ) : (
        <div className="text-[12px] text-txt-secondary border-t border-border pt-2">Run Refresh to get book insights.</div>
      )}
    </GlowCard>
  );
}
