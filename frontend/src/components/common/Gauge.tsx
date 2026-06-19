// Horizontal indicator gauges with threshold markers.

export function Gauge({
  label,
  value,
  max = 100,
  thresholds = [],
  color = '#a855f7',
  unit = '',
}: {
  label: string;
  value: number | null | undefined;
  max?: number;
  thresholds?: number[];
  color?: string;
  unit?: string;
}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-txt-secondary">{label}</span>
        <span className="font-mono font-semibold" style={{ color }}>
          {value == null ? '—' : value.toFixed(1)}
          {unit}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
        {thresholds.map((t) => (
          <div
            key={t}
            className="absolute top-0 h-full w-px bg-white/40"
            style={{ left: `${(t / max) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}

// +DI vs -DI comparison bar (cyan = buyers, magenta = sellers).
export function DiGauge({ plusDi, minusDi }: { plusDi: number | null; minusDi: number | null }) {
  const p = plusDi ?? 0;
  const m = minusDi ?? 0;
  const total = p + m || 1;
  const pPct = (p / total) * 100;
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-accent-cyan font-mono font-semibold">+DI {plusDi == null ? '—' : plusDi.toFixed(1)}</span>
        <span className="text-txt-secondary">direction</span>
        <span className="text-accent-magenta font-mono font-semibold">-DI {minusDi == null ? '—' : minusDi.toFixed(1)}</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
        <div className="h-full" style={{ width: `${pPct}%`, background: '#06b6d4' }} />
        <div className="h-full" style={{ width: `${100 - pPct}%`, background: '#ec4899' }} />
      </div>
    </div>
  );
}
