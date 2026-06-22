import type { PortfolioData } from '../../types/portfolio';
import { PriceChange } from '../common/PriceChange';
import { statusDot, timeAgo, fmtEgp, dailyPct, daysUntil } from '../../lib/format';

export type Tab = 'portfolio' | 'opportunities' | 'history';

function NavItem({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition ${
        active ? 'gradient-purple text-white shadow-glow' : 'text-txt-secondary hover:text-txt-primary hover:bg-white/5'
      }`}
    >
      <span>{icon}</span>
      {label}
    </button>
  );
}

function DeadlineCountdown({ date }: { date: string }) {
  const days = daysUntil(date);
  return (
    <div className="text-[11px] font-semibold rounded-lg px-2 py-1.5 bg-status-red/15 border border-status-red/40 text-status-red">
      ⏰ BAL+CCB exit by Jun 24 · {days}d left
    </div>
  );
}

export function Sidebar({
  data,
  tab,
  setTab,
  onRefresh,
  phase,
  onLogTrade,
}: {
  data: PortfolioData | null;
  tab: Tab;
  setTab: (t: Tab) => void;
  onRefresh: () => void;
  phase: 'idle' | 'refreshing' | 'analyzing';
  onLogTrade: () => void;
}) {
  const positions = data?.positions ?? [];
  const refreshLabel =
    phase === 'refreshing' ? '⏳ Refreshing…' : phase === 'analyzing' ? '🧠 AI analyzing…' : '🔄 Refresh Prices';

  return (
    <aside className="w-[220px] shrink-0 h-screen sticky top-0 flex flex-col gap-4 p-4 border-r border-white/5 bg-bg-card/40 backdrop-blur">
      <div className="text-xl font-extrabold text-gradient leading-tight">
        EGX
        <br />
        Dashboard
      </div>

      <nav className="flex flex-col gap-1">
        <NavItem active={tab === 'portfolio'} onClick={() => setTab('portfolio')} icon="📊" label="Portfolio" />
        <NavItem active={tab === 'opportunities'} onClick={() => setTab('opportunities')} icon="🔍" label="Opportunities" />
        <NavItem active={tab === 'history'} onClick={() => setTab('history')} icon="📜" label="History" />
      </nav>

      <div className="border-t border-white/10" />

      <div className="flex-1 overflow-y-auto -mx-1 px-1 min-h-0">
        <div className="text-[10px] uppercase tracking-wide text-txt-secondary mb-1.5 px-1">Positions</div>
        {positions.map((p) => (
          <div key={p.ticker} className="flex items-center justify-between px-1 py-1 text-sm">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: statusDot(p.status_key), boxShadow: `0 0 6px ${statusDot(p.status_key)}` }} />
              {p.ticker}
            </span>
            <PriceChange value={dailyPct(p.daily_chg)} showArrow={false} className="text-xs" />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="text-[11px] text-txt-secondary">
          Last refresh: <span className="text-txt-primary">{timeAgo(data?.last_refresh ?? null)}</span>
        </div>
        <button onClick={onRefresh} disabled={phase !== 'idle'} className="btn-primary w-full">
          {refreshLabel}
        </button>
        <button onClick={onLogTrade} className="btn-ghost w-full">⚡ Log Trade</button>
        <div className="text-xs rounded-lg px-2.5 py-1.5 bg-status-green/10 border border-status-green/30 text-status-green font-medium">
          Realized: {fmtEgp(data?.realized_pnl)}
        </div>
        {data && <DeadlineCountdown date={data.deadline_date} />}
        <div className="text-[10px] text-txt-secondary leading-snug border-t border-white/10 pt-2">
          Thndr: ONE active order per stock — stop-loss OR limit sell, not both.
        </div>
        <div className="text-[10px] text-txt-secondary text-right">v{__APP_VERSION__}</div>
      </div>
    </aside>
  );
}
