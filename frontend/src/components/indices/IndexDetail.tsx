import { useState } from 'react';
import type { IndexData, NewsPool } from '../../types/portfolio';
import { GlowCard } from '../common/GlowCard';
import { fmtPct } from '../../lib/format';
import { ZoneLadder } from './ZoneLadder';
import { IndexSections } from './IndexSections';

export function IndexDetail({ d, pool }: { d: IndexData; pool?: NewsPool }) {
  const [open, setOpen] = useState(false);
  return (
    <GlowCard className="p-4">
      {d.ai?.headline && <div className="text-sm font-semibold mb-3">{d.index}: {d.ai.headline}</div>}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-4">
        <ZoneLadder d={d} />
        <IndexSections d={d} pool={pool} />
      </div>

      <button onClick={() => setOpen((o) => !o)} className="mt-3 text-[11px] text-accent-cyan">
        {open ? '▾ Internals' : '▸ Internals'}
      </button>
      {open && (
        <div className="mt-2 space-y-3 text-xs">
          <div className="text-txt-secondary">
            {d.stats?.advancing ?? 0} up · {d.stats?.declining ?? 0} down · {d.stats?.total_constituents ?? 0} total
          </div>
          {!!d.sectors?.length && (
            <div>
              <div className="text-txt-secondary mb-1">Sector rotation</div>
              <div className="flex flex-wrap gap-1.5">
                {d.sectors.map((s) => (
                  <span key={s.sector} className="px-1.5 py-0.5 rounded bg-surface border border-border capitalize">
                    {s.sector.replace(/_/g, ' ')} <b className={s.avg_change >= 0 ? 'text-status-green' : 'text-status-red'}>{fmtPct(s.avg_change)}</b>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Movers title="Top gainers" rows={d.top_gainers} pos />
            <Movers title="Top losers" rows={d.top_losers} />
          </div>
        </div>
      )}
    </GlowCard>
  );
}

function Movers({ title, rows, pos }: { title: string; rows?: IndexData['top_gainers']; pos?: boolean }) {
  return (
    <div>
      <div className="text-txt-secondary mb-1">{title}</div>
      {(rows || []).map((r) => (
        <div key={r.symbol} className="flex justify-between font-mono">
          <span>{r.symbol}</span>
          <span className={pos ? 'text-status-green' : 'text-status-red'}>{fmtPct(r.change_pct ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}
