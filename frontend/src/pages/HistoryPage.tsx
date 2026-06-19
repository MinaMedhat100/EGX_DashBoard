import type { PortfolioData } from '../types/portfolio';
import { GlowCard } from '../components/common/GlowCard';
import { fmtNum, fmtEgp } from '../lib/format';

const TYPE_COLOR: Record<string, string> = {
  'STOP-OUT': '#ef4444',
  SELL: '#22c55e',
  BUY: '#06b6d4',
  'BUY (add)': '#a855f7',
};

function pnlClass(v: number | null) {
  if (v == null) return 'text-txt-secondary';
  return v >= 0 ? 'text-status-green' : 'text-status-red';
}

export function HistoryPage({ data }: { data: PortfolioData }) {
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
            <tr className="text-[11px] uppercase text-txt-secondary text-left border-b border-white/10">
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
              <tr key={e.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-1.5 pr-3 whitespace-nowrap text-txt-secondary">{e.date}</td>
                <td className="pr-3">
                  <span className="text-[11px] font-semibold" style={{ color: TYPE_COLOR[e.type] ?? '#94a3b8' }}>
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
            <tr className="text-[11px] uppercase text-txt-secondary text-left border-b border-white/10">
              <th className="py-1.5 pr-3">Ticker</th>
              <th className="pr-3">Exit Date</th>
              <th className="pr-3">Type</th>
              <th className="pr-3 text-right">Shares</th>
              <th className="pr-3 text-right">Exit</th>
              <th className="pr-3 text-right">Avg Cost</th>
              <th className="text-right">P&L</th>
            </tr>
          </thead>
          <tbody>
            {data.exited_positions.map((e, i) => (
              <tr key={`${e.ticker}-${i}`} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-1.5 pr-3 font-semibold">
                  {e.ticker}
                  {e.approximate && <span className="text-txt-secondary text-[10px] ml-1">~</span>}
                </td>
                <td className="pr-3 text-txt-secondary whitespace-nowrap">{e.exit_date}</td>
                <td className="pr-3">
                  <span className="text-[11px] font-semibold" style={{ color: TYPE_COLOR[e.exit_type] ?? '#94a3b8' }}>
                    {e.exit_type}
                  </span>
                </td>
                <td className="pr-3 text-right font-mono">{e.shares?.toLocaleString() ?? '—'}</td>
                <td className="pr-3 text-right font-mono">{fmtNum(e.exit_price)}</td>
                <td className="pr-3 text-right font-mono">{fmtNum(e.avg_cost)}</td>
                <td className={`text-right font-mono ${pnlClass(e.realized_pnl)}`}>{fmtEgp(e.realized_pnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlowCard>
    </div>
  );
}
