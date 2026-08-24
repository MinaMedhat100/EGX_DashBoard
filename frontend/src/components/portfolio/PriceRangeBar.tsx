import type { Position } from '../../types/portfolio';
import { fmtNum } from '../../lib/format';

interface Marker {
  key: string;
  label: string;
  value: number;
  color: string;
  emphasize?: boolean;
  hit?: boolean;
}

// Two markers closer than this (in % of bar width) would have their price labels collide, so the
// later one is pushed into a second vertical lane (label higher, price lower) instead of overlapping.
const MIN_GAP_PCT = 12;

/** Lane 0 = normal (label just above, price just below); lane 1 = offset outward. */
function assignLanes(markers: Marker[], pct: (v: number) => number): Map<string, number> {
  const lanes = new Map<string, number>();
  const lastX = [-Infinity, -Infinity]; // right-most x already placed in each lane
  for (const m of [...markers].sort((a, b) => pct(a.value) - pct(b.value))) {
    const x = pct(m.value);
    // prefer lane 0; fall back to lane 1 only when lane 0's neighbour is too close
    const lane = x - lastX[0] >= MIN_GAP_PCT ? 0 : x - lastX[1] >= MIN_GAP_PCT ? 1 : 0;
    lanes.set(m.key, lane);
    lastX[lane] = x;
  }
  return lanes;
}

export function PriceRangeBar({ p }: { p: Position }) {
  if (p.brackets) {
    return (
      <div className="mt-2 space-y-1.5">
        {p.brackets.lots.map((l) => {
          const state = l.tp_hit ? `${l.target} ✓` : l.stopped ? 'stopped' : 'resting';
          const color = l.tp_hit ? '#22c55e' : l.stopped ? '#ef4444' : '#f97316';
          return (
            <div key={l.id} className="flex items-center justify-between text-[11px] font-mono rounded-lg bg-white/5 border border-white/10 px-2 py-1">
              <span className="font-semibold">Lot {l.id}</span>
              <span className="text-txt-secondary">{l.shares}sh · stop {fmtNum(l.stop)} · TP {fmtNum(l.tp_price)}</span>
              <span style={{ color }}>{state}</span>
            </div>
          );
        })}
      </div>
    );
  }

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
    t1 > 0 && { key: 't1', label: p.t1_hit ? 'T1 ✓' : 'T1', value: t1, color: '#f97316', hit: !!p.t1_hit },
    t2 > 0 && { key: 't2', label: p.t2_hit ? 'T2 ✓' : 'T2', value: t2, color: '#22c55e', hit: !!p.t2_hit },
  ].filter(Boolean) as Marker[];

  const lanes = assignLanes(markers, pct);
  // only reserve the extra vertical room when something actually had to be staggered
  const staggered = [...lanes.values()].some((lane) => lane === 1);

  return (
    <div className={`relative px-2 select-none ${staggered ? 'pt-11 pb-12' : 'pt-6 pb-7'}`}>
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
        {markers.map((m) => {
          const lane = lanes.get(m.key) ?? 0;
          return (
            <div key={m.key} className="absolute -top-[3px]" style={{ left: `${pct(m.value)}%`, transform: 'translateX(-50%)' }}>
              {m.emphasize ? (
                <div
                  className="w-3.5 h-3.5 rounded-full border-2 border-bg-card"
                  style={{ background: m.color, boxShadow: `0 0 10px ${m.color}` }}
                />
              ) : m.hit ? (
                <div
                  className="w-3 h-3 rounded-full border-2 border-bg-card"
                  style={{ background: m.color, boxShadow: `0 0 8px ${m.color}` }}
                  title="filled"
                />
              ) : (
                <div className="w-[2px] h-3.5" style={{ background: m.color }} />
              )}
              <div
                className={`absolute left-1/2 -translate-x-1/2 text-[9px] font-semibold tracking-wide ${lane ? '-top-10' : '-top-5'}`}
                style={{ color: m.color }}
              >
                {m.label}
              </div>
              <div
                className={`absolute left-1/2 -translate-x-1/2 text-[10px] font-mono text-txt-secondary whitespace-nowrap ${lane ? 'top-9' : 'top-4'}`}
              >
                {fmtNum(m.value)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
