import type { GoldPosition } from '../../types/portfolio';
import type { GoldUnit } from '../../lib/gold';
import { fmtGold } from '../../lib/gold';
import { GlowCard } from '../common/GlowCard';
import { StatusBadge } from '../common/StatusBadge';
import { MtfBadge } from '../common/MtfBadge';

export function GoldPositionCard({ p, unit, usdEgp, onLog }: { p: GoldPosition; unit: GoldUnit; usdEgp: number | null; onLog: () => void }) {
  const one_R = p.avg_cost - p.stop_loss;
  const liveR = one_R > 0 ? (p.live_price - p.avg_cost) / one_R : null;
  const pnlUsd = p.unrealized_pnl;
  // unrealized_pnl is an aggregate USD total, not a per-oz price: only the EGP unit needs the USD->EGP leg
  const pnlDisp = pnlUsd == null ? null : unit === 'g_egp' ? (usdEgp != null ? pnlUsd * usdEgp : null) : pnlUsd;
  const pnlSym = unit === 'g_egp' ? 'E£' : '$';

  return (
    <GlowCard className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg font-extrabold">Gold position</span>
          <StatusBadge status={p.status_key} small />
          {p.t1_hit && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-status-green/15 text-status-green border border-status-green/40">T1 ✓</span>}
          <MtfBadge mtf={p.mtf} />
        </div>
        <button onClick={onLog} title="Log gold trade" className="text-accent-purple-lt hover:text-white text-base leading-none">⚡</button>
      </div>

      <div className="text-[11px] text-txt-secondary mt-1">{p.position_label}</div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-sm">
        <div><span className="text-txt-secondary">Live </span><span className="font-mono font-semibold">{fmtGold(p.live_price, unit, usdEgp)}</span></div>
        <div className="text-right text-txt-secondary">{p.shares} oz</div>
        <div><span className="text-txt-secondary">Avg </span><span className="font-mono">{fmtGold(p.avg_cost, unit, usdEgp)}</span></div>
        <div className="text-right">
          {pnlDisp != null ? (
            <span className={`font-semibold ${pnlDisp >= 0 ? 'text-status-green' : 'text-accent-magenta'}`}>
              {pnlDisp >= 0 ? '+' : '−'}{pnlSym}{Math.abs(pnlDisp).toFixed(2)}{p.unrealized_pct != null ? ` (${p.unrealized_pct}%)` : ''}
            </span>
          ) : <span className="text-txt-secondary text-xs">—</span>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        {([['Stop', p.stop_loss, '#ef4444'], ['T1', p.t1_price, '#f97316'], ['T2', p.t2_price, '#22c55e']] as const).map(([label, v, color]) => (
          <div key={label} className="rounded-lg bg-white/5 border border-white/10 px-2 py-1.5">
            <div className="text-[10px] text-txt-secondary">{label}</div>
            <div className="font-mono font-semibold text-sm" style={{ color }}>{v > 0 ? fmtGold(v, unit, usdEgp) : '—'}</div>
          </div>
        ))}
      </div>

      {liveR != null && (
        <div className="mt-2 text-[11px] font-mono text-txt-secondary">
          live <span className={liveR >= 0 ? 'text-status-green' : 'text-status-red'}>{liveR >= 0 ? '+' : ''}{liveR.toFixed(2)}R</span>
          {p.levels_source === 'pending' && <span className="ml-2 text-status-yellow">levels pending — Analyze to set</span>}
        </div>
      )}
    </GlowCard>
  );
}
