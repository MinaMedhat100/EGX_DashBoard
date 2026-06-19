import type { PortfolioData } from '../../types/portfolio';
import { fmtNum, fmtEgp } from '../../lib/format';

function Kpi({ className, label, value, sub }: { className: string; label: string; value: string; sub: string }) {
  return (
    <div className={`${className} rounded-2xl p-5 shadow-glow relative overflow-hidden`}>
      <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10 blur-2xl" />
      <div className="text-white/80 text-xs uppercase tracking-wide font-medium">{label}</div>
      <div className="text-white text-2xl font-extrabold mt-1 tabular-nums">{value}</div>
      <div className="text-white/70 text-[11px] mt-1">{sub}</div>
    </div>
  );
}

export function PortfolioSummary({ data }: { data: PortfolioData }) {
  const invested = data.positions.reduce((s, p) => s + p.avg_cost * p.shares, 0);
  const unrealized = data.positions.reduce((s, p) => s + (p.unrealized_pnl ?? 0), 0);
  const up = unrealized >= 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Kpi
        className="gradient-purple"
        label="Total Invested"
        value={`${fmtNum(invested, 0)} EGP`}
        sub={`${data.positions.length} positions`}
      />
      <Kpi className="gradient-cyan" label="Realized P&L" value={fmtEgp(data.realized_pnl)} sub="cumulative" />
      <Kpi
        className={up ? 'gradient-green' : 'gradient-magenta'}
        label="Unrealized P&L"
        value={fmtEgp(unrealized)}
        sub="liquid positions (live)"
      />
    </div>
  );
}
