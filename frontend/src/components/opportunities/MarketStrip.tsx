import type { MarketOverview } from '../../types/portfolio';
import { GlowCard } from '../common/GlowCard';

function Mini({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <GlowCard className="p-4">
      <div className="text-[11px] uppercase tracking-wide text-txt-secondary">{label}</div>
      <div className="text-xl font-extrabold mt-0.5 capitalize" style={{ color }}>
        {value}
      </div>
      <div className="text-[11px] text-txt-secondary mt-0.5">{sub}</div>
    </GlowCard>
  );
}

export function MarketStrip({ data }: { data: MarketOverview | null }) {
  if (!data) return null;
  const dirColor =
    data.direction === 'Bullish' ? '#22c55e' : data.direction === 'Bearish' ? '#ef4444' : '#eab308';
  const top = data.top_sectors?.[0];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Mini
        label="EGX Market"
        value={data.direction}
        sub={`avg ${data.change_pct >= 0 ? '+' : ''}${data.change_pct}% · ${data.breadth.advancing}↑ ${data.breadth.declining}↓`}
        color={dirColor}
      />
      <Mini label="Sentiment" value={data.sentiment} sub={`${data.total_analyzed ?? ''} stocks scanned`} color="#06b6d4" />
      <Mini
        label="Top Active Sector"
        value={top ? top.sector.replace(/_/g, ' ') : '—'}
        sub={top ? `${top.strong_count} strong · avg score ${top.avg_score}` : ''}
        color="#a855f7"
      />
    </div>
  );
}
