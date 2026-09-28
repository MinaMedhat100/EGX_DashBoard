import { useState } from 'react';
import type { Position, LevelProposal, LevelsInput, Lot } from '../../types/portfolio';
import { GlowCard } from '../common/GlowCard';
import { StatusBadge } from '../common/StatusBadge';
import { MtfBadge } from '../common/MtfBadge';
import { PriceChange } from '../common/PriceChange';
import { PriceRangeBar } from './PriceRangeBar';
import { AnalysisPanel } from './AnalysisPanel';
import { STATUS_META, fmtNum, fmtEgp, fmtPct } from '../../lib/format';
import { positionR, volatilityPct, volatilityLabel, fmtR } from '../../lib/risk';
import { entryPriceSuspect } from '../../lib/entryGuard';

function dailyPct(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/\(([-+]?\d+\.?\d*)%\)/);
  return m ? parseFloat(m[1]) : null;
}

function ExitFramework({ p }: { p: Position }) {
  if (p.adx == null) return null;
  let rule: string;
  if (p.adx < 40) rule = 'EXIT 100% (no trend)';
  else if ((p.minus_di ?? 0) > (p.plus_di ?? 0)) rule = 'EXIT 100% (trend reversed)';
  else if (p.mtf && p.mtf.higher_tf_bullish === false) rule = 'EXIT 100% (higher TF W/D turned)';
  else rule = 'EXIT 50% — keep runner';
  return (
    <div className="mt-2 text-[11px] text-txt-secondary">
      <span className="text-status-red font-semibold">Exit framework:</span> {rule}
    </div>
  );
}

export function PositionCard({
  p,
  refreshing,
  onLogOrder,
  updating,
  proposal,
  onApplyLevels,
  onDismissProposal,
  onCorrectEntry,
}: {
  p: Position;
  refreshing: boolean;
  onLogOrder: (ticker: string) => void;
  updating?: boolean;
  proposal?: LevelProposal;
  onApplyLevels: (ticker: string, levels: LevelsInput) => void;
  onDismissProposal: (ticker: string) => void;
  onCorrectEntry: (ticker: string, entry: { shares: number; avg_cost: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [eStop, setEStop] = useState('');
  const [eStopB, setEStopB] = useState('');
  const [eT1, setET1] = useState('');
  const [eT2, setET2] = useState('');
  const [editingEntry, setEditingEntry] = useState(false);
  const [eShares, setEShares] = useState('');
  const [eAvg, setEAvg] = useState('');
  const lotA = p.brackets?.lots.find((l) => l.id === 'A');
  const lotB = p.brackets?.lots.find((l) => l.id === 'B');
  const lotIsOpen = (l?: Lot) => !!l && !l.tp_hit && !l.stopped;
  const hasOpenLot = lotIsOpen(lotA) || lotIsOpen(lotB);
  // prefill the bracket editor with each lot's live ThndrX order values
  const openBracketEditor = () => {
    setEStop(lotA ? String(lotA.stop) : '');
    setET1(lotA ? String(lotA.tp_price) : '');
    setEStopB(lotB ? String(lotB.stop) : '');
    setET2(lotB ? String(lotB.tp_price) : '');
    setEditing(true);
  };
  const suspect = entryPriceSuspect(p.avg_cost, p.live_price);
  const meta = STATUS_META[p.status_key] ?? STATUS_META.yellow;
  const chg = p.chg_pos == null ? null : dailyPct(p.daily_chg);
  const isDeadline = p.ticker === 'BAL' || p.ticker === 'CCB';
  const noLive = p.ticker === 'EGX30ETF';
  const chips: [string, number | null][] =
    p.is_liquid && p.adx != null
      ? [['ADX', p.adx], ['+DI', p.plus_di], ['-DI', p.minus_di], ['RSI', p.rsi]]
      : [];

  const statusEmoji =
    p.status_key === 'red' ? '🔴' : p.status_key === 'orange_hot' ? '🟠' : p.status_key === 'green' ? '🟢' : '🟡';

  return (
    <GlowCard ringColor={meta.ring} className={`p-4 relative overflow-hidden ${refreshing ? 'shimmer' : ''}`}>
      {/* header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xl font-extrabold tracking-tight">{p.ticker}</span>
          <StatusBadge status={p.status_key} small />
          {p.tv_signal && p.tv_signal !== '—' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-txt-secondary border border-border">
              TV: {p.tv_signal}
            </span>
          )}
          {p.t1_hit && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-status-green/15 text-status-green border border-status-green/40"
              title={p.t1_fill_price ? `T1 filled @ ${p.t1_fill_price}` : 'T1 filled'}
            >
              T1 ✓ FILLED
            </span>
          )}
          {p.t2_hit && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-status-green/15 text-status-green border border-status-green/40"
              title={p.t2_fill_price ? `T2 filled @ ${p.t2_fill_price}` : 'T2 filled'}
            >
              T2 ✓ FILLED
            </span>
          )}
          <MtfBadge mtf={p.mtf} />
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {chg != null ? <PriceChange value={chg} /> : <span className="text-txt-secondary text-xs">no live</span>}
          <button
            onClick={() => onLogOrder(p.ticker)}
            title="Log order"
            className="text-accent-purple-lt hover:text-txt-primary transition text-base leading-none"
          >
            ⚡
          </button>
        </div>
      </div>

      {/* position label */}
      <div className="text-[11px] text-txt-secondary mt-1">{p.position_label}</div>

      {/* price rows */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-sm">
        <div>
          <span className="text-txt-secondary">Live </span>
          <span className="font-mono font-semibold">{noLive ? '—' : fmtNum(p.live_price)} EGP</span>
        </div>
        <div className="text-right text-txt-secondary">
          {p.shares.toLocaleString()} {isDeadline ? 'units' : 'shares'}
        </div>
        <div>
          <span className="text-txt-secondary">Avg </span>
          <span className="font-mono">{fmtNum(p.avg_cost)} EGP</span>
        </div>
        <div className="text-right">
          {p.unrealized_pnl != null ? (
            <span className={`font-semibold ${p.unrealized_pnl >= 0 ? 'text-status-green' : 'text-status-red'}`}>
              {fmtEgp(p.unrealized_pnl)} ({fmtPct(p.unrealized_pct)})
            </span>
          ) : (
            <span className="text-txt-secondary text-xs">unrealized —</span>
          )}
        </div>
      </div>

      {noLive && <div className="mt-2 text-[11px] text-status-yellow">⚠ No TV data — verify price in Thndr</div>}

      {p.is_liquid && <PriceRangeBar p={p} />}

      {p.brackets && hasOpenLot && !editing && !updating && (
        <button
          onClick={openBracketEditor}
          className="mt-1.5 text-[11px] text-accent-purple-lt hover:text-txt-primary transition"
        >
          ✎ Edit lot levels
        </button>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {chips.map(([label, v]) => (
            <span key={label} className="text-[11px] font-mono px-2 py-1 rounded-lg bg-surface border border-border">
              <span className="text-txt-secondary">{label} </span>
              <span className="font-semibold">{v == null ? '—' : v.toFixed(1)}</span>
            </span>
          ))}
        </div>
      )}

      {p.is_liquid && p.live_price > 0 && (() => {
        const r = positionR(p.avg_cost, p.stop_loss, p.live_price, p.t1_price, p.t2_price);
        const vol = volatilityPct(p.bb_upper, p.bb_lower, p.live_price);
        if (!r && vol == null) return null;
        return (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-mono text-txt-secondary">
            {r ? (
              <>
                <span>1R = {fmtNum(r.riskPerShare)} EGP/sh</span>
                <span className={r.liveR >= 0 ? 'text-status-green' : 'text-status-red'}>live {fmtR(r.liveR)}</span>
                <span className="text-txt-secondary">stop {fmtR(r.stopR)}</span>
                {r.t1R != null && <span className="text-status-orange">T1 {fmtR(r.t1R)}</span>}
              </>
            ) : (
              <span className="text-status-green">stop above cost — risk-free runner</span>
            )}
            {vol != null && <span className="ml-auto">vol {vol.toFixed(0)}% ({volatilityLabel(vol)})</span>}
          </div>
        );
      })()}

      {p.alert?.thndr_action && (
        <div
          className="mt-3 flex items-start gap-2 text-sm rounded-lg px-3 py-2"
          style={{ background: meta.bg, border: `1px solid ${meta.ring}` }}
        >
          <span>{statusEmoji}</span>
          <span className="font-medium" style={{ color: meta.color }}>
            {p.alert.thndr_action}
          </span>
        </div>
      )}

      {p.status_key === 'red' && p.is_liquid && <ExitFramework p={p} />}

      {suspect && !editingEntry && (
        <div className="mt-3 text-sm rounded-lg px-3 py-2 bg-status-red/10 border border-status-red/30">
          <div className="text-status-red font-medium">⚠ Entry price looks wrong</div>
          <div className="text-[11px] text-txt-secondary mt-0.5">
            Avg cost {fmtNum(p.avg_cost)} is ~{Math.round(suspect.ratio)}× the live price {fmtNum(p.live_price)} — likely a typo (e.g. the share count typed into the price field).
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => { setEShares(String(p.shares)); setEAvg(String(p.avg_cost)); setEditingEntry(true); }}
              className="btn-ghost px-3 py-1 text-xs"
            >
              Correct entry
            </button>
          </div>
        </div>
      )}

      {editingEntry && (
        <div className="mt-3 text-sm rounded-lg px-3 py-2 bg-surface border border-border-strong">
          <div className="text-txt-secondary text-[11px] mb-1.5">Correct entry (shares &amp; avg cost)</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] uppercase text-txt-secondary">Shares</span>
              <input type="number" step="1" value={eShares} onChange={(e) => setEShares(e.target.value)}
                className="mt-1 w-full bg-bg-card border border-border-strong rounded px-2 py-1 text-sm focus:border-accent-cyan focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase text-txt-secondary">Avg cost</span>
              <input type="number" step="0.01" value={eAvg} onChange={(e) => setEAvg(e.target.value)}
                className="mt-1 w-full bg-bg-card border border-border-strong rounded px-2 py-1 text-sm focus:border-accent-cyan focus:outline-none" />
            </label>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => { onCorrectEntry(p.ticker, { shares: Number(eShares) || 0, avg_cost: Number(eAvg) || 0 }); setEditingEntry(false); }}
              className="btn-primary px-3 py-1 text-xs"
            >
              Save
            </button>
            <button onClick={() => setEditingEntry(false)} className="btn-ghost px-3 py-1 text-xs">Cancel</button>
          </div>
        </div>
      )}

      {/* level state: updating / pending / AI proposal */}
      {updating && (
        <div className="mt-3 flex items-center gap-2 text-sm rounded-lg px-3 py-2 bg-accent-cyan/10 border border-accent-cyan/30 text-accent-cyan">
          <span className="animate-pulse">⟳</span> AI setting levels…
        </div>
      )}

      {!updating && p.levels_source === 'pending' && !editing && (
        <div className="mt-3 text-sm rounded-lg px-3 py-2 bg-status-yellow/10 border border-status-yellow/30">
          <div className="text-status-yellow font-medium">Stop &amp; targets pending</div>
          <div className="text-[11px] text-txt-secondary mt-0.5">
            The AI sets your stop &amp; targets from live indicators on the next refresh — this is a
            planning level for the tracker, not a Thndr order. You can also set them manually.
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setEditing(true)} className="btn-ghost px-3 py-1 text-xs">
              Set manually
            </button>
          </div>
        </div>
      )}

      {!updating && editing && p.brackets && (
        <div className="mt-3 text-sm rounded-lg px-3 py-2 bg-surface border border-border-strong">
          <div className="text-txt-secondary text-[11px] mb-1.5">Set lot levels manually (EGP) — match your ThndrX orders</div>
          <div className="grid grid-cols-2 gap-2">
            {([
              [lotA, 'Stop A', eStop, setEStop], [lotA, 'T1 (Lot A)', eT1, setET1],
              [lotB, 'Stop B', eStopB, setEStopB], [lotB, 'T2 (Lot B)', eT2, setET2],
            ] as const).map(([lot, label, val, set]) => (
              <label key={label} className="block">
                <span className="text-[10px] uppercase text-txt-secondary">
                  {label}{lot && !lotIsOpen(lot) ? (lot.tp_hit ? ' · filled' : ' · stopped') : ''}
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={val}
                  disabled={!lotIsOpen(lot)}
                  onChange={(e) => set(e.target.value)}
                  className="mt-1 w-full bg-bg-card border border-border-strong rounded px-2 py-1 text-sm focus:border-accent-cyan focus:outline-none disabled:opacity-40"
                />
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => {
                onApplyLevels(p.ticker, {
                  stop_a: Number(eStop) || 0, stop_b: Number(eStopB) || 0, t1: Number(eT1) || 0, t2: Number(eT2) || 0,
                  source: 'manual',
                });
                setEditing(false);
              }}
              className="btn-primary px-3 py-1 text-xs"
            >
              Save levels
            </button>
            <button onClick={() => setEditing(false)} className="btn-ghost px-3 py-1 text-xs">Cancel</button>
          </div>
        </div>
      )}

      {!updating && editing && !p.brackets && (
        <div className="mt-3 text-sm rounded-lg px-3 py-2 bg-surface border border-border-strong">
          <div className="text-txt-secondary text-[11px] mb-1.5">Set levels manually (EGP)</div>
          <div className="grid grid-cols-3 gap-2">
            {([['Stop', eStop, setEStop], ['T1', eT1, setET1], ['T2', eT2, setET2]] as const).map(
              ([label, val, set]) => (
                <label key={label} className="block">
                  <span className="text-[10px] uppercase text-txt-secondary">{label}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    className="mt-1 w-full bg-bg-card border border-border-strong rounded px-2 py-1 text-sm focus:border-accent-cyan focus:outline-none"
                  />
                </label>
              ),
            )}
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => {
                onApplyLevels(p.ticker, { stop: Number(eStop) || 0, t1: Number(eT1) || 0, t2: Number(eT2) || 0, source: 'manual' });
                setEditing(false);
              }}
              className="btn-primary px-3 py-1 text-xs"
            >
              Save levels
            </button>
            <button onClick={() => setEditing(false)} className="btn-ghost px-3 py-1 text-xs">Cancel</button>
          </div>
        </div>
      )}

      {!updating && proposal && !editing && (
        <div className="mt-3 text-sm rounded-lg px-3 py-2 bg-accent-purple/10 border border-accent-purple/30">
          <div className="text-accent-purple-lt font-medium">Apply AI levels?</div>
          {p.brackets ? (
            <div className="text-[11px] font-mono text-txt-secondary mt-1 space-y-0.5">
              {([[lotA, proposal.stop_a, proposal.t1, 'T1'], [lotB, proposal.stop_b, proposal.t2, 'T2']] as const).map(
                ([lot, stop, tp, tpLabel]) =>
                  lot && lotIsOpen(lot) && (
                    <div key={lot.id} className="flex flex-wrap gap-x-3">
                      <span className="text-txt-primary">Lot {lot.id}</span>
                      <span className={stop != null ? 'text-txt-primary' : ''}>
                        stop {fmtNum(lot.stop)} → {fmtNum(stop ?? lot.stop)}
                      </span>
                      <span className={tp != null && tp !== lot.tp_price ? 'text-txt-primary' : ''}>
                        {tpLabel} {fmtNum(lot.tp_price)} → {fmtNum(tp ?? lot.tp_price)}
                      </span>
                    </div>
                  ),
              )}
            </div>
          ) : (
          <div className="text-[11px] font-mono text-txt-secondary mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            <span className={p.stop_raised && proposal.stop != null && proposal.stop < p.stop_loss ? 'text-status-yellow' : ''}>
              stop {fmtNum(p.stop_loss)} → {proposal.stop != null ? fmtNum(proposal.stop) : '—'}
              {p.stop_raised && proposal.stop != null && proposal.stop < p.stop_loss ? ' ⚠ lowers break-even' : ''}
            </span>
            <span>T1 {fmtNum(p.t1_price)} → {proposal.t1 != null ? fmtNum(proposal.t1) : '—'}</span>
            <span>T2 {fmtNum(p.t2_price)} → {proposal.t2 != null ? fmtNum(proposal.t2) : '—'}</span>
          </div>
          )}
          {p.brackets && (
            <div className="text-[10px] text-txt-secondary mt-1">Apply after you edit the matching orders in ThndrX.</div>
          )}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => onApplyLevels(p.ticker, p.brackets
                ? {
                    stop_a: proposal.stop_a ?? lotA?.stop ?? 0,
                    stop_b: proposal.stop_b ?? lotB?.stop ?? 0,
                    t1: proposal.t1 ?? p.t1_price,
                    t2: proposal.t2 ?? p.t2_price,
                    source: 'ai',
                  }
                : {
                    stop: proposal.stop ?? p.stop_loss,
                    t1: proposal.t1 ?? p.t1_price,
                    t2: proposal.t2 ?? p.t2_price,
                    source: 'ai',
                  })}
              className="btn-primary px-3 py-1 text-xs"
            >
              Apply
            </button>
            <button onClick={() => onDismissProposal(p.ticker)} className="btn-ghost px-3 py-1 text-xs">Dismiss</button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="mt-3 text-xs text-accent-purple-lt hover:text-txt-primary transition flex items-center gap-1.5"
      >
        {open ? '▲ Hide analysis' : '▼ Show full analysis'}
        {p.ai && !open && <span className="text-[10px] text-accent-cyan">· AI ready</span>}
      </button>

      {open && <AnalysisPanel p={p} />}
    </GlowCard>
  );
}
