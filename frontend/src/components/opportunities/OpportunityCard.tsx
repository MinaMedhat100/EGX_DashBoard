import type { Opportunity } from '../../types/portfolio';
import { GlowCard } from '../common/GlowCard';
import { fmtNum, fmtPct } from '../../lib/format';

function Lvl({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-2 py-1.5">
      <div className="text-[10px] text-txt-secondary">{label}</div>
      <div className="font-mono font-semibold text-sm" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

const d1 = (n?: number) => (n == null ? '—' : n.toFixed(1));

export function OpportunityCard({ o }: { o: Opportunity }) {
  const score = o.score ?? 0;
  const scoreColor = score >= 70 ? '#22c55e' : score >= 50 ? '#eab308' : '#94a3b8';

  return (
    <GlowCard hover className="p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg font-extrabold">{o.ticker}</span>
          {o.sector && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-txt-secondary capitalize">
              {o.sector.replace(/_/g, ' ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {o.tv_signal && <span className="text-xs text-accent-cyan">{o.tv_signal}</span>}
          <span className="text-sm font-bold px-2 py-0.5 rounded-lg" style={{ color: scoreColor, background: `${scoreColor}22` }}>
            {score}/100
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
        <div>
          ADX <b className="font-mono">{d1(o.adx)}</b> · <span className="text-accent-cyan">+DI {d1(o.plus_di)}</span>{' '}
          <span className="text-accent-magenta">-DI {d1(o.minus_di)}</span>
        </div>
        <div className="text-right">
          RSI <b className="font-mono">{d1(o.rsi)}</b> · MACD{' '}
          <span className={o.macd === 'bullish' ? 'text-status-green' : 'text-status-red'}>{o.macd ?? '—'}</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Lvl
          label="Entry zone"
          value={o.entry_zone ? `${fmtNum(o.entry_zone[0])}–${fmtNum(o.entry_zone[1])}` : '—'}
          color="#06b6d4"
        />
        <Lvl label="Stop" value={fmtNum(o.stop)} color="#ef4444" />
        <Lvl label="R/R → T2" value={o.rr ? `${o.rr}:1` : '—'} color="#a855f7" />
        <Lvl label={`T1 (${fmtPct(o.t1_pct)})`} value={fmtNum(o.t1)} color="#f97316" />
        <Lvl label={`T2 (${fmtPct(o.t2_pct)})`} value={fmtNum(o.t2)} color="#22c55e" />
        <Lvl label="Conviction" value={`${o.conviction ?? '—'}/5`} color="#a855f7" />
      </div>

      {o.thesis && (
        <p className="mt-3 text-xs text-txt-primary/85 leading-snug border-t border-white/10 pt-2">
          <span className="text-[10px] font-bold px-1 py-0.5 rounded gradient-purple text-white mr-1.5">AI</span>
          {o.thesis}
        </p>
      )}
    </GlowCard>
  );
}
