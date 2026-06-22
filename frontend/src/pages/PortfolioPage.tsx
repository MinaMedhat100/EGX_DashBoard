import type { PortfolioData, LevelProposal } from '../types/portfolio';
import { PortfolioSummary } from '../components/portfolio/PortfolioSummary';
import { AlertBanner } from '../components/portfolio/AlertBanner';
import { PositionCard } from '../components/portfolio/PositionCard';

export function PortfolioPage({
  data,
  refreshing,
  onLogOrder,
  aiUpdating,
  proposals,
  onApplyLevels,
  onDismissProposal,
  staleTicker,
  onRefreshAll,
  onDismissStale,
}: {
  data: PortfolioData;
  refreshing: boolean;
  onLogOrder: (ticker: string) => void;
  aiUpdating: string | null;
  proposals: Record<string, LevelProposal>;
  onApplyLevels: (ticker: string, levels: { stop: number; t1: number; t2: number }) => void;
  onDismissProposal: (ticker: string) => void;
  staleTicker: string | null;
  onRefreshAll: () => void;
  onDismissStale: () => void;
}) {
  return (
    <div className="space-y-5">
      <PortfolioSummary data={data} />
      <AlertBanner positions={data.positions} />
      {staleTicker && (
        <div className="flex items-center justify-between gap-3 text-sm rounded-lg px-3 py-2 bg-accent-cyan/10 border border-accent-cyan/30">
          <span className="text-txt-secondary">
            Only <span className="text-txt-primary font-semibold">{staleTicker}</span> was refreshed — other positions may be stale.
          </span>
          <span className="flex items-center gap-2 shrink-0">
            <button onClick={onRefreshAll} className="btn-primary px-3 py-1 text-xs">Refresh all</button>
            <button onClick={onDismissStale} className="text-txt-secondary hover:text-txt-primary text-xs">Dismiss</button>
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {data.positions.map((p) => (
          <PositionCard
            key={p.ticker}
            p={p}
            refreshing={refreshing}
            onLogOrder={onLogOrder}
            deadlineDate={data.deadline_date}
            updating={aiUpdating === p.ticker}
            proposal={proposals[p.ticker]}
            onApplyLevels={onApplyLevels}
            onDismissProposal={onDismissProposal}
          />
        ))}
      </div>
    </div>
  );
}
