import type { Position } from '../../types/portfolio';
import { fmtNum } from '../../lib/format';

interface Marker {
  key: string;
  label: string;
  value: number;
  color: string;
  emphasize?: boolean;
}

export function PriceRangeBar({ p }: { p: Position }) {
  const { stop_loss: stop, avg_cost: avg, live_price: live, t1_price: t1, t2_price: t2 } = p;
  const vals = [stop, avg, live, t1, t2].filter((v) => v > 0);
  if (vals.length < 2 || !live || live <= 0) return null;

  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const pct = (v: number) => ((v - lo) / span) * 100;

  const avgP = pct(avg);
  const liveP = pct(live);
  const up = live >= avg;
  const fillLeft = Math.min(avgP, liveP);
  const fillW = Math.abs(liveP - avgP);

  const t1P = pct(t1);
  const dashLeft = Math.min(liveP, t1P);
  const dashW = Math.abs(t1P - liveP);

  const markers: Marker[] = [
    stop > 0 && { key: 'stop', label: 'STOP', value: stop, color: '#ef4444' },
    avg > 0 && { key: 'avg', label: 'AVG', value: avg, color: '#e2e8f0' },
    { key: 'now', label: 'NOW', value: live, color: '#06b6d4', emphasize: true },
    t1 > 0 && { key: 't1', label: 'T1', value: t1, color: '#f97316' },
    t2 > 0 && { key: 't2', label: 'T2', value: t2, color: '#22c55e' },
  ].filter(Boolean) as Marker[];

  return (
    <div className="relative pt-6 pb-7 px-2 select-none">
      <div className="relative h-2 rounded-full bg-white/10">
        {/* AVG -> NOW filled (green up / red down) */}
        <div
          className="absolute h-full rounded-full"
          style={{ left: `${fillLeft}%`, width: `${fillW}%`, background: up ? '#22c55e' : '#ef4444' }}
        />
        {/* NOW -> T1 dashed (unrealized path to target) */}
        {t1 > live && (
          <div
            className="absolute h-full top-0 opacity-70"
            style={{
              left: `${dashLeft}%`,
              width: `${dashW}%`,
              backgroundImage: 'repeating-linear-gradient(90deg,#f9731699 0 5px,transparent 5px 10px)',
            }}
          />
        )}
        {markers.map((m) => (
          <div key={m.key} className="absolute -top-[3px]" style={{ left: `${pct(m.value)}%`, transform: 'translateX(-50%)' }}>
            {m.emphasize ? (
              <div
                className="w-3.5 h-3.5 rounded-full border-2 border-bg-card"
                style={{ background: m.color, boxShadow: `0 0 10px ${m.color}` }}
              />
            ) : (
              <div className="w-[2px] h-3.5" style={{ background: m.color }} />
            )}
            <div
              className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-semibold tracking-wide"
              style={{ color: m.color }}
            >
              {m.label}
            </div>
            <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[10px] font-mono text-txt-secondary whitespace-nowrap">
              {fmtNum(m.value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
