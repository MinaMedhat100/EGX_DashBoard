import { useState } from 'react';
import type { Opportunity } from '../../types/portfolio';
import { GlowCard } from '../common/GlowCard';
import { MtfBadge } from '../common/MtfBadge';
import { fmtNum, fmtPct } from '../../lib/format';
import { rMultiple, fmtR } from '../../lib/risk';
import { bracketPlan } from '../../lib/brackets';

function Lvl({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg bg-surface border border-border px-2 py-1.5">
      <div className="text-[10px] text-txt-secondary">{label}</div>
      <div className="font-mono font-semibold text-sm" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

const d1 = (n?: number) => (n == null ? '—' : n.toFixed(1));

const FLAG_LABELS: Record<string, { label: string; title: string }> = {
  weekly_rsi_overbought: { label: 'weekly RSI hot', title: 'Weekly RSI ≥ 75 — the higher timeframe is stretched' },
  rsi_at_band_ceiling: { label: 'RSI at ceiling', title: 'Daily RSI ≥ 68 — top of the 40-70 band' },
  extended_above_ema20: { label: 'extended vs EMA20', title: 'Price ≥ 2× daily ATR above EMA20 (or ≥ 12%) — chasing' },
  upper_wick_rejection: { label: 'rejected at high', title: 'Upper wick ≥ 40% of range on a body ≤ 40% — supply hit the high' },
  adx_exhaustion: { label: 'ADX exhausted', title: 'ADX ≥ 50 — a late-stage trend, not an early one' },
  entry_zone_chasing: { label: 'zone chasing price', title: 'The entry zone rose with price since the last scan until it reached price' },
};

function FlagChips({ flags }: { flags?: string[] }) {
  if (!flags || flags.length === 0) return null;
  return (
    <>
      {flags.map((f) => {
        const meta = FLAG_LABELS[f] ?? { label: f.replace(/_/g, ' '), title: f };
        return (
          <span
            key={f}
            title={meta.title}
            className="text-[10px] px-1.5 py-0.5 rounded bg-status-yellow/15 border border-status-yellow/40 text-status-yellow font-semibold"
          >
            ⚠ {meta.label}
          </span>
        );
      })}
    </>
  );
}

const VS_PRIOR: Record<string, string> = {
  fading: 'text-status-yellow border-status-yellow/40 bg-status-yellow/15',
  improving: 'text-status-green border-status-green/40 bg-status-green/15',
};

export function OpportunityCard({ o, onLog }: { o: Opportunity; onLog?: (o: Opportunity) => void }) {
  const score = o.score ?? 0;
  const scoreColor = score >= 70 ? 'rgb(var(--status-green))' : score >= 50 ? 'rgb(var(--status-yellow))' : 'rgb(var(--muted))';
  const [splitOverride, setSplitOverride] = useState<number | null>(null);
  const bp = bracketPlan(o, splitOverride ?? undefined);

  return (
    <GlowCard hover className="p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg font-extrabold">{o.ticker}</span>
          {o.sector && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border text-txt-secondary capitalize">
              {o.sector.replace(/_/g, ' ')}
            </span>
          )}
          <MtfBadge mtf={o.mtf} />
          {o.passes_filter === false && (
            <span
              title={`Below momentum filter — ADX ${d1(o.adx)} · +DI ${d1(o.plus_di)} −DI ${d1(o.minus_di)} · RSI ${d1(o.rsi)}`}
              className="text-[10px] px-1.5 py-0.5 rounded bg-status-red/15 border border-status-red/40 text-status-red font-semibold"
            >
              ✗ momentum
            </span>
          )}
          <FlagChips flags={o.overextension} />
          {o.vs_prior && VS_PRIOR[o.vs_prior] && (
            <span
              title={o.vs_prior_note || ''}
              className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${VS_PRIOR[o.vs_prior]}`}
            >
              {o.vs_prior === 'fading' ? '↘ fading' : '↗ improving'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {o.price != null && (
            <span className="font-mono text-sm font-semibold" title="Live price at scan time">
              {fmtNum(o.price)}
            </span>
          )}
          {o.tv_signal && <span className="text-xs text-accent-cyan">{o.tv_signal}</span>}
          <span className="text-sm font-bold px-2 py-0.5 rounded-lg" style={{ color: scoreColor, background: `${scoreColor}22` }}>
            {score}/100
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
        <div>
          ADX <b className="font-mono">{d1(o.adx)}</b> · <span className="text-accent-cyan">+DI {d1(o.plus_di)}</span>{' '}
          <span className="text-status-red">-DI {d1(o.minus_di)}</span>
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
          color="rgb(var(--accent-2))"
        />
        <Lvl label="Stop" value={fmtNum(o.stop)} color="rgb(var(--status-red))" />
        <Lvl label="R/R → T2" value={o.rr ? `${o.rr}:1` : '—'} color="rgb(var(--status-purple))" />
        <Lvl label={`T1 (${fmtPct(o.t1_pct)})`} value={fmtNum(o.t1)} color="rgb(var(--status-orange))" />
        <Lvl label={`T2 (${fmtPct(o.t2_pct)})`} value={fmtNum(o.t2)} color="rgb(var(--status-green))" />
        <Lvl label="Conviction" value={`${o.conviction ?? '—'}/5`} color="rgb(var(--status-purple))" />
      </div>

      {(() => {
        const entry = o.entry_zone?.[1] ?? o.entry_zone?.[0];
        if (entry == null || o.stop == null) return null;
        const t1R = o.t1 != null ? rMultiple(entry, o.stop, o.t1) : null;
        const t2R = o.t2 != null ? rMultiple(entry, o.stop, o.t2) : null;
        const oneR = entry - o.stop;
        return (
          <div className="mt-2 text-[11px] font-mono text-txt-secondary flex flex-wrap gap-x-3 gap-y-0.5">
            <span>1R = {fmtNum(oneR)} EGP/sh</span>
            <span className="text-status-orange">T1 {fmtR(t1R)}</span>
            <span className="text-status-green">T2 {fmtR(t2R)}</span>
          </div>
        );
      })()}

      {(o.wait_for || o.entry_guard) && (
        <div className="mt-2 text-[11px] rounded-lg px-2.5 py-1.5 bg-status-yellow/10 border border-status-yellow/30 text-status-yellow leading-snug">
          ⏳ {o.wait_for ? <b>Wait for: {o.wait_for}</b> : <b>Price is above the entry zone.</b>}
          {o.entry_guard && (
            <span className="text-txt-secondary">
              {' '}— {o.price != null ? `price ${fmtNum(o.price)} is ` : ''}
              {o.entry_guard.above_pct}% above the {fmtNum(o.entry_guard.level)} zone top.
            </span>
          )}
        </div>
      )}

      {bp.lot_a.tp != null && bp.lot_b.tp != null && (
        <div className="mt-3 border-t border-border pt-2 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-txt-secondary">ThndrX bracket · split</span>
            <span className="font-mono">
              {bp.split[0]}/{bp.split[1]}
            </span>
          </div>
          {bp.split_reason && <div className="text-txt-secondary/80 italic">{bp.split_reason}</div>}
          <div className="mt-1 grid grid-cols-2 gap-2 font-mono">
            <div className="rounded bg-surface px-2 py-1">
              Lot A {bp.lot_a.pct}% → TP {fmtNum(bp.lot_a.tp)} · R {fmtR(bp.rr_a)}
            </div>
            <div className="rounded bg-surface px-2 py-1">
              Lot B {bp.lot_b.pct}% → TP {fmtNum(bp.lot_b.tp)} · R {fmtR(bp.rr_b)}
            </div>
          </div>
          <input
            type="range"
            min={20}
            max={80}
            step={5}
            value={bp.split[0]}
            onChange={(e) => setSplitOverride(Number(e.target.value))}
            className="w-full mt-1 accent-accent-purple"
          />
        </div>
      )}

      {o.thesis && (
        <p className="mt-3 text-xs text-txt-primary/85 leading-snug border-t border-border pt-2">
          <span className="text-[10px] font-bold px-1 py-0.5 rounded gradient-purple text-white mr-1.5">AI</span>
          {o.thesis}
        </p>
      )}

      {onLog && o.stop != null && o.t1 != null && o.t2 != null && (
        <button onClick={() => onLog(o)} className="btn-ghost mt-3 w-full py-1.5 text-xs">
          ⚡ Log this as a bracket
        </button>
      )}
    </GlowCard>
  );
}
