import type { IndexData } from '../../types/portfolio';
import { GlowCard } from '../common/GlowCard';
import { MtfBadge } from '../common/MtfBadge';
import { fmtNum, fmtPct } from '../../lib/format';

export function regimeColor(regime?: string) {
  if (!regime) return 'rgb(var(--muted))';
  if (/on/i.test(regime)) return 'rgb(var(--status-green))';
  if (/off/i.test(regime)) return 'rgb(var(--status-red))';
  return 'rgb(var(--status-yellow))';
}

export function IndexTile({ d, active, onSelect }: { d: IndexData; active: boolean; onSelect: () => void }) {
  const up = (d.change_pct ?? 0) >= 0;
  const headline = d.ai?.headline || d.ai?.thesis || '';
  return (
    <GlowCard
      hover
      onClick={onSelect}
      className={`p-3 cursor-pointer border-2 ${active ? 'border-accent-cyan' : 'border-transparent'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base font-extrabold">{d.index}</span>
          <MtfBadge mtf={d.mtf} />
        </div>
        <div className="text-right">
          <div className="font-mono font-bold">{d.level == null ? 'n/a' : fmtNum(d.level)}</div>
          <div className={`text-xs font-semibold ${up ? 'text-status-green' : 'text-status-red'}`}>
            {d.change_pct == null ? '' : `${up ? '▲' : '▼'} ${fmtPct(d.change_pct)}`}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2 text-xs">
        {d.ai && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white shrink-0" style={{ background: regimeColor(d.ai.regime) }}>
            {d.ai.regime}
          </span>
        )}
        <span className="text-txt-secondary line-clamp-2">{headline || 'No AI read yet'}</span>
      </div>
    </GlowCard>
  );
}
