import type { PortfolioData } from '../types/portfolio';
import { PortfolioSummary } from '../components/portfolio/PortfolioSummary';
import { AlertBanner } from '../components/portfolio/AlertBanner';
import { PositionCard } from '../components/portfolio/PositionCard';

export function PortfolioPage({
  data,
  refreshing,
  onLogOrder,
}: {
  data: PortfolioData;
  refreshing: boolean;
  onLogOrder: (ticker: string) => void;
}) {
  return (
    <div className="space-y-5">
      <PortfolioSummary data={data} />
      <AlertBanner positions={data.positions} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {data.positions.map((p) => (
          <PositionCard
            key={p.ticker}
            p={p}
            refreshing={refreshing}
            onLogOrder={onLogOrder}
            deadlineDate={data.deadline_date}
          />
        ))}
      </div>
    </div>
  );
}
