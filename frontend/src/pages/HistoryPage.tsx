import { Fragment, useState } from 'react';
import type { PortfolioData } from '../types/portfolio';
import { GlowCard } from '../components/common/GlowCard';
import { JournalTimeline } from '../components/journal/JournalTimeline';
import { fmtNum, fmtEgp } from '../lib/format';

const TYPE_COLOR: Record<string, string> = {
  'STOP-OUT': 'rgb(var(--status-red))',
  SELL: 'rgb(var(--status-green))',
  BUY: 'rgb(var(--accent-2))',
  'BUY (add)': 'rgb(var(--status-purple))',
};

function pnlClass(v: number | null) {
  if (v == null) return 'text-txt-secondary';
  return v >= 0 ? 'text-status-green' : 'text-status-red';
}

export function HistoryPage({ data }: { data: PortfolioData }) {
  const [openTrade, setOpenTrade] = useState<string | null>(null);
  const exitedTotal = data.exited_positions.reduce((s, e) => s + (e.realized_pnl ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <GlowCard className="px-5 py-3">
          <div className="text-[11px] uppercase text-txt-secondary">Cumulative Realized P&L</div>
          <div className={`text-xl font-extrabold ${pnlClass(data.realized_pnl)}`}>{fmtEgp(data.realized_pnl)}</div>
        </GlowCard>
        <GlowCard className="px-5 py-3">
          <div className="text-[11px] uppercase text-txt-secondary">Exited Positions Total</div>
          <div className={`text-xl font-extrabold ${pnlClass(exitedTotal)}`}>{fmtEgp(exitedTotal)}</div>
        </GlowCard>
      </div>

      <GlowCard className="p-4 overflow-x-auto">
        <h3 className="font-bold mb-3">Action Log ({data.action_log.length})</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase text-txt-secondary text-left border-b border-border">
              <th className="py-1.5 pr-3">Date</th>
              <th className="pr-3">Type</th>
              <th className="pr-3">Ticker</th>
              <th className="pr-3 text-right">Shares</th>
              <th className="pr-3 text-right">Price</th>
              <th className="pr-3 text-right">P&L</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {data.action_log.map((e) => (
              <tr key={e.id} className="border-b border-border hover:bg-surface">
                <td className="py-1.5 pr-3 whitespace-nowrap text-txt-secondary">{e.date}</td>
                <td className="pr-3">
                  <span className="text-[11px] font-semibold" style={{ color: TYPE_COLOR[e.type] ?? 'rgb(var(--muted))' }}>
                    {e.type}
                  </span>
                </td>
                <td className="pr-3 font-semibold">{e.ticker}</td>
                <td className="pr-3 text-right font-mono">{e.shares?.toLocaleString() ?? '—'}</td>
                <td className="pr-3 text-right font-mono">{fmtNum(e.price)}</td>
                <td className={`pr-3 text-right font-mono ${pnlClass(e.realized_pnl)}`}>
                  {e.realized_pnl == null ? '—' : fmtEgp(e.realized_pnl)}
                </td>
                <td className="text-[11px] text-txt-secondary max-w-[420px] truncate" title={e.notes}>
                  {e.notes}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlowCard>

      <GlowCard className="p-4 overflow-x-auto">
        <h3 className="font-bold mb-3">Exited Positions ({data.exited_positions.length})</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase text-txt-secondary text-left border-b border-border">
              <th className="py-1.5 pr-3">Ticker</th>
              <th className="pr-3">Exit Date</th>
              <th className="pr-3">Type</th>
              <th className="pr-3 text-right">Shares</th>
              <th className="pr-3 text-right">Exit</th>
              <th className="pr-3 text-right">Avg Cost</th>
              <th className="text-right">P&L</th>
              <th className="pl-3" />
            </tr>
          </thead>
          <tbody>
            {data.exited_positions.map((e, i) => (
              <Fragment key={`${e.ticker}-${i}`}>
                <tr className="border-b border-border hover:bg-surface">
                  <td className="py-1.5 pr-3 font-semibold">
                    {e.ticker}
                    {e.approximate && <span className="text-txt-secondary text-[10px] ml-1">~</span>}
                  </td>
                  <td className="pr-3 text-txt-secondary whitespace-nowrap">{e.exit_date}</td>
                  <td className="pr-3">
                    <span className="text-[11px] font-semibold" style={{ color: TYPE_COLOR[e.exit_type] ?? 'rgb(var(--muted))' }}>
                      {e.exit_type}
                    </span>
                  </td>
                  <td className="pr-3 text-right font-mono">{e.shares?.toLocaleString() ?? '—'}</td>
                  <td className="pr-3 text-right font-mono">{fmtNum(e.exit_price)}</td>
                  <td className="pr-3 text-right font-mono">{fmtNum(e.avg_cost)}</td>
                  <td className={`text-right font-mono ${pnlClass(e.realized_pnl)}`}>{fmtEgp(e.realized_pnl)}</td>
                  <td className="pl-3 text-right">
                    {e.trade_id && (
                      <button
                        onClick={() => setOpenTrade((t) => (t === e.trade_id ? null : e.trade_id ?? null))}
                        className="text-[11px] text-accent-purple-lt hover:text-txt-primary whitespace-nowrap"
                      >
                        📓 {openTrade === e.trade_id ? 'Hide' : 'Journal'}
                      </button>
                    )}
                  </td>
                </tr>
                {openTrade && openTrade === e.trade_id && (
                  <tr className="border-b border-border">
                    <td colSpan={8} className="pb-2"><JournalTimeline tradeId={openTrade} /></td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </GlowCard>
    </div>
  );
}
