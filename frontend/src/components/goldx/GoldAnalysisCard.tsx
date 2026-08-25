import type { GoldSnapshot } from '../../types/portfolio';
import type { GoldUnit } from '../../lib/gold';
import { fmtGold } from '../../lib/gold';
import { GlowCard } from '../common/GlowCard';
import { MtfBadge } from '../common/MtfBadge';

const REC_COLOR: Record<string, string> = {
  ENTER_LONG: 'rgb(var(--status-green))', ADD: 'rgb(var(--status-green))', HOLD: 'rgb(var(--status-yellow))', WAIT: 'rgb(var(--status-yellow))',
  TRIM: 'rgb(var(--status-orange))', EXIT: 'rgb(var(--status-red))', AVOID: 'rgb(var(--status-red))',
};
const d1 = (n?: number | string | null) => (n == null ? '—' : Number(n).toFixed(1));

function Lvl({ label, usdOz, unit, egp, color }: { label: string; usdOz?: number; unit: GoldUnit; egp: number | null; color: string }) {
  return (
    <div className="rounded-lg bg-surface border border-border px-2 py-1.5">
      <div className="text-[10px] text-txt-secondary">{label}</div>
      <div className="font-mono font-semibold text-sm" style={{ color }}>{fmtGold(usdOz, unit, egp)}</div>
    </div>
  );
}

export function GoldAnalysisCard({ snap, unit }: { snap: GoldSnapshot; unit: GoldUnit }) {
  const ind = snap.indicators || {};
  const ai = snap.ai;
  const hasAi = !!ai && Object.keys(ai).length > 0;
  const egp = snap.usd_egp;
  const price = ind.price as number | undefined;
  const rec = ai?.recommendation;

  return (
    <GlowCard className="p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg font-extrabold">Gold</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border text-txt-secondary">PAXG</span>
          <MtfBadge mtf={snap.mtf} />
        </div>
        <div className="text-right">
          <div className="font-mono font-bold text-lg">{fmtGold(price, unit, egp)}</div>
          {snap.gc_usd != null && <div className="text-[10px] text-txt-secondary">GC=F ${snap.gc_usd}</div>}
          {(snap.dxy || snap.us10y) && (
            <div className="text-[10px] text-txt-secondary">
              {snap.dxy ? `DXY ${snap.dxy.price}` : ''}{snap.dxy && snap.us10y ? ' · ' : ''}{snap.us10y ? `US10Y ${snap.us10y.price}%` : ''}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-txt-secondary">
        <div>RSI <b className="font-mono text-txt-primary">{d1(ind.rsi)}</b> · ADX <b className="font-mono text-txt-primary">{d1(ind.adx)}</b></div>
        <div className="text-right">+DI {d1(ind.plus_di)} · −DI {d1(ind.minus_di)}</div>
      </div>

      {hasAi ? (
        <>
          <div className="mt-3 flex items-center gap-2 border-t border-border pt-2">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white" style={{ background: REC_COLOR[rec ?? ''] ?? 'rgb(var(--status-purple))' }}>
              {rec ?? '—'}
            </span>
            <span className="text-txt-secondary text-xs">conviction {ai.conviction ?? '—'}/5</span>
            {ai.vs_prior && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface border border-border text-txt-secondary">
                vs prior: {ai.vs_prior}{ai.vs_prior === 'changed' && ai.change_reason ? ` — ${ai.change_reason}` : ''}
              </span>
            )}
            {ai.weekly_bias && <span className="ml-auto text-[10px] text-txt-secondary">weekly {ai.weekly_bias}</span>}
          </div>
          {(ai.entry_zone || ai.stop != null) && (
            <div className="mt-2 grid grid-cols-2 xl:grid-cols-3 gap-2">
              <Lvl label="Entry" usdOz={ai.entry_zone?.[1] ?? ai.entry_zone?.[0]} unit={unit} egp={egp} color="rgb(var(--accent-2))" />
              <Lvl label="Stop" usdOz={ai.stop} unit={unit} egp={egp} color="rgb(var(--status-red))" />
              <div className="rounded-lg bg-surface border border-border px-2 py-1.5">
                <div className="text-[10px] text-txt-secondary">R/R → T2</div>
                <div className="font-mono font-semibold text-sm text-accent-purple-lt">{ai.rr ? `${ai.rr}:1` : '—'}</div>
              </div>
              <Lvl label={`T1 ${ai.t1_pct != null ? `(${ai.t1_pct}%)` : ''}`} usdOz={ai.t1} unit={unit} egp={egp} color="rgb(var(--status-orange))" />
              <Lvl label={`T2 ${ai.t2_pct != null ? `(${ai.t2_pct}%)` : ''}`} usdOz={ai.t2} unit={unit} egp={egp} color="rgb(var(--status-green))" />
            </div>
          )}
          {ai.thesis && (
            <p className="mt-3 text-xs text-txt-primary/85 leading-snug border-t border-border pt-2">
              <span className="text-[10px] font-bold px-1 py-0.5 rounded gradient-purple text-white mr-1.5">AI</span>{ai.thesis}
            </p>
          )}
          {ai.net_of_fee && <p className="mt-1.5 text-[11px] text-status-orange">💱 {ai.net_of_fee}</p>}
          {ai.key_risk && <p className="mt-1.5 text-[11px] text-status-orange">⚠ {ai.key_risk}</p>}
        </>
      ) : (
        <div className="mt-3 text-xs text-txt-secondary border-t border-border pt-2">No AI read yet — hit Analyze.</div>
      )}
    </GlowCard>
  );
}
