import { useState } from 'react';
import type { IndexData } from '../../types/portfolio';
import { GlowCard } from '../common/GlowCard';
import { MtfBadge } from '../common/MtfBadge';
import { fmtNum, fmtPct } from '../../lib/format';

function regimeColor(regime?: string) {
  if (!regime) return 'rgb(var(--muted))';
  if (/on/i.test(regime)) return 'rgb(var(--status-green))';
  if (/off/i.test(regime)) return 'rgb(var(--status-red))';
  return 'rgb(var(--status-yellow))';
}

const n1 = (n?: number | null) => (n == null ? '—' : Number(n).toFixed(1));

export function IndexCard({ d }: { d: IndexData }) {
  const [open, setOpen] = useState(false);
  const ind = d.indicators || {};
  const regime = d.ai?.regime;
  const up = (d.change_pct ?? 0) >= 0;

  return (
    <GlowCard className="p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg font-extrabold">{d.index}</span>
          <MtfBadge mtf={d.mtf} />
        </div>
        <div className="text-right">
          <div className="font-mono font-bold text-lg">{d.level == null ? 'n/a' : fmtNum(d.level)}</div>
          <div className={`text-xs font-semibold ${up ? 'text-status-green' : 'text-status-red'}`}>
            {d.change_pct == null ? '' : `${up ? '▲' : '▼'} ${fmtPct(d.change_pct)}`}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-txt-secondary">
        <div>RSI <b className="font-mono text-txt-primary">{n1(ind.rsi as number)}</b> · ADX <b className="font-mono text-txt-primary">{n1(ind.adx as number)}</b></div>
        <div className="text-right">
          Breadth <b className="font-mono text-txt-primary">{n1(d.stats?.breadth)}%</b> · {d.stats?.sentiment ?? '—'}
        </div>
      </div>

      {d.ai ? (
        <div className="mt-3 border-t border-border pt-2">
          <div className="flex items-center gap-2 text-xs">
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white"
              style={{ background: regimeColor(regime) }}
            >
              {regime ?? '—'}
            </span>
            <span className="text-txt-secondary">trend: {d.ai.trend}</span>
          </div>
          <p className="mt-1.5 text-xs text-txt-primary/85 leading-snug">{d.ai.thesis}</p>
        </div>
      ) : (
        <div className="mt-3 text-xs text-txt-secondary border-t border-border pt-2">AI analysis unavailable — try Refresh.</div>
      )}

      <button onClick={() => setOpen((o) => !o)} className="mt-2 text-[11px] text-accent-cyan">
        {open ? '▾ hide internals' : '▸ show internals'}
      </button>

      {open && (
        <div className="mt-2 space-y-3 text-xs">
          <div>
            <div className="text-txt-secondary mb-1">Breadth</div>
            <div className="flex h-2 rounded overflow-hidden bg-surface">
              <div className="bg-status-green" style={{ width: `${pctOf(d.stats?.advancing, d.stats?.declining)}%` }} />
              <div className="bg-status-red flex-1" />
            </div>
            <div className="text-txt-secondary mt-0.5">
              {d.stats?.advancing ?? 0} up · {d.stats?.declining ?? 0} down · {d.stats?.total_constituents ?? 0} total
            </div>
          </div>

          {!!d.sectors?.length && (
            <div>
              <div className="text-txt-secondary mb-1">Sector rotation</div>
              <div className="flex flex-wrap gap-1.5">
                {d.sectors.slice(0, 6).map((s) => (
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

function pctOf(a?: number | null, b?: number | null) {
  const x = a ?? 0;
  const y = b ?? 0;
  return x + y === 0 ? 50 : Math.round((x / (x + y)) * 100);
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
