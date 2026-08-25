import type { Mtf } from '../../types/portfolio';

const biasColor = (b?: string | null) =>
  b === 'Bullish'
    ? 'rgb(var(--status-green))'
    : b === 'Bearish'
      ? 'rgb(var(--status-red))'
      : 'rgb(var(--status-yellow))';
const arrow = (b?: string | null) => (b === 'Bullish' ? '↑' : b === 'Bearish' ? '↓' : '→');

// Compact weekly/daily multi-timeframe badge with full per-TF detail in the tooltip.
export function MtfBadge({ mtf }: { mtf?: Mtf | null }) {
  if (!mtf || (!mtf.weekly_bias && !mtf.daily_bias)) return null;
  const aligned = mtf.wd_aligned;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border"
      style={{
        borderColor: aligned ? 'rgb(var(--status-green) / 0.4)' : 'rgb(var(--muted) / 0.3)',
        background: aligned ? 'rgb(var(--status-green) / 0.12)' : 'rgb(var(--surface))',
      }}
      title={`MTF ${mtf.alignment_status ?? ''} (${mtf.confidence ?? '—'}) · W ${mtf.weekly_bias ?? '—'} · D ${mtf.daily_bias ?? '—'} · 4H ${mtf.bias_4h ?? '—'} · 1H ${mtf.bias_1h ?? '—'} · 15m ${mtf.bias_15m ?? '—'}`}
    >
      <span style={{ color: biasColor(mtf.weekly_bias) }}>W{arrow(mtf.weekly_bias)}</span>
      <span style={{ color: biasColor(mtf.daily_bias) }}>D{arrow(mtf.daily_bias)}</span>
      {aligned && <span className="text-status-green">✓</span>}
    </span>
  );
}
