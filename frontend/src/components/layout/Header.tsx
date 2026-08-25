import type { Tab } from './Sidebar';

const TITLES: Record<Tab, { title: string; sub: string }> = {
  portfolio: { title: 'Portfolio', sub: 'Positions, KPIs, AI analysis & targets' },
  indices: { title: 'EGX Indices Tracker', sub: 'EGX30/70/100 regime, trend & internals' },
  opportunities: { title: 'EGX Market Opportunities', sub: 'Screener results with AI-ranked entries' },
  goldx: { title: 'Goldx — Gold Swing', sub: 'AI gold entries & position (PAXG · USD/oz · Thndr/Binance)' },
  history: { title: 'Trade History', sub: 'Action log & exited positions' },
};

export function Header({ tab, model, bridgeOk }: { tab: Tab; model: string | null; bridgeOk: boolean | null }) {
  const t = TITLES[tab];
  return (
    <header className="flex items-end justify-between mb-5">
      <div>
        <h1 className="text-2xl font-extrabold">{t.title}</h1>
        <p className="text-sm text-txt-secondary">{t.sub}</p>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-txt-secondary">
        {model && (
          <span className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 bg-surface border border-border">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-purple-lt" /> AI: {model}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 bg-surface border border-border">
          <span className={`w-1.5 h-1.5 rounded-full ${bridgeOk ? 'bg-status-green' : 'bg-status-red'}`} />
          MCP {bridgeOk ? 'live' : 'down'}
        </span>
      </div>
    </header>
  );
}
