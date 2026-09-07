import type { Position, Lot } from '../../types/portfolio';
import { fmtNum } from '../../lib/format';

interface Marker {
  key: string;
  label: string;
  value: number;
  color: string;
  emphasize?: boolean;
  hit?: boolean;
  /** a settled-out lot's target: still placed, but greyed back so it reads as history */
  dim?: boolean;
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

/**
 * The shared bar renderer. The axis is normalised across whatever markers it is handed, so the
 * classic (single stop / T1 / T2) and bracket (per-lot stops and targets) cards draw identically.
 * `dashTo` is the next still-live target — the dashed run from NOW is the unrealized path to it.
 */
function Bar({
  markers,
  avg,
  live,
  dashTo,
}: {
  markers: Marker[];
  avg: number;
  live: number;
  dashTo: number | null;
}) {
  const vals = markers.map((m) => m.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const pct = (v: number) => ((v - lo) / span) * 100;

  const avgP = pct(avg);
  const liveP = pct(live);
  const up = live >= avg;
  const fillLeft = Math.min(avgP, liveP);
  const fillW = Math.abs(liveP - avgP);

  const showDash = dashTo != null && dashTo > live;
  const dashLeft = showDash ? Math.min(liveP, pct(dashTo)) : 0;
  const dashW = showDash ? Math.abs(pct(dashTo) - liveP) : 0;

  const lanes = assignLanes(markers, pct);
  // only reserve the extra vertical room when something actually had to be staggered
  const staggered = [...lanes.values()].some((lane) => lane === 1);

  return (
    <div className={`relative px-2 select-none ${staggered ? 'pt-11 pb-12' : 'pt-6 pb-7'}`}>
      <div className="relative h-2 rounded-full bg-surface">
        {/* AVG -> NOW filled (green up / red down) */}
        {avg > 0 && (
          <div
            className="absolute h-full rounded-full"
            style={{ left: `${fillLeft}%`, width: `${fillW}%`, background: up ? 'rgb(var(--status-green))' : 'rgb(var(--status-red))' }}
          />
        )}
        {/* NOW -> next live target, dashed (unrealized path) */}
        {showDash && (
          <div
            className="absolute h-full top-0 opacity-70"
            style={{
              left: `${dashLeft}%`,
              width: `${dashW}%`,
              backgroundImage: 'repeating-linear-gradient(90deg,rgb(var(--status-orange) / 0.6) 0 5px,transparent 5px 10px)',
            }}
          />
        )}
        {markers.map((m) => {
          const lane = lanes.get(m.key) ?? 0;
          return (
            <div
              key={m.key}
              className="absolute -top-[3px]"
              style={{ left: `${pct(m.value)}%`, transform: 'translateX(-50%)', opacity: m.dim ? 0.45 : 1 }}
            >
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
                className={`absolute left-1/2 -translate-x-1/2 text-[9px] font-semibold tracking-wide whitespace-nowrap ${lane ? '-top-10' : '-top-5'}`}
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

/** One compact line per lot: shares plus the numbers the bar can't carry (state, exit fill). */
function LotChip({ l }: { l: Lot }) {
  const settled = l.tp_hit || l.stopped;
  const state = l.tp_hit ? `${l.target} ✓` : l.stopped ? 'stopped' : 'resting';
  const color = l.tp_hit
    ? 'rgb(var(--status-green))'
    : l.stopped
      ? 'rgb(var(--status-red))'
      : 'rgb(var(--status-orange))';
  const detail = settled
    ? `${l.shares.toLocaleString()}sh${l.exit_price != null ? ` · exit ${fmtNum(l.exit_price)}` : ''}`
    : `${l.shares.toLocaleString()}sh · stop ${fmtNum(l.stop)} · TP ${fmtNum(l.tp_price)}`;
  return (
    <div className="flex items-center justify-between text-[11px] font-mono rounded-lg bg-surface border border-border px-2 py-1">
      <span className="font-semibold">Lot {l.id}</span>
      <span className="text-txt-secondary">{detail}</span>
      <span style={{ color }}>{state}</span>
    </div>
  );
}

export function PriceRangeBar({ p }: { p: Position }) {
  const live = p.live_price;

  // ── ThndrX bracket: one shared axis, per-lot stops and targets, chips underneath ──
  if (p.brackets) {
    const lots = p.brackets.lots;
    const open = lots.filter((l) => !l.tp_hit && !l.stopped);
    const markers: Marker[] = [];

    // Stops belong to the lots still resting in ThndrX — a settled lot's stop is no longer an order.
    // While the open lots agree (a fresh bracket) that is one marker; once the runner is raised to
    // break-even they diverge and each gets its own.
    const stops = open.filter((l) => l.stop > 0);
    const distinct = Array.from(new Set(stops.map((l) => l.stop)));
    if (distinct.length === 1) {
      markers.push({ key: 'stop', label: 'SL', value: distinct[0], color: 'rgb(var(--status-red))' });
    } else {
      for (const l of stops) {
        markers.push({ key: `stop${l.id}`, label: `SL·${l.id}`, value: l.stop, color: 'rgb(var(--status-red))' });
      }
    }

    if (p.avg_cost > 0) markers.push({ key: 'avg', label: 'AVG', value: p.avg_cost, color: 'rgb(var(--muted))' });
    if (live > 0) markers.push({ key: 'now', label: 'NOW', value: live, color: 'rgb(var(--accent-2))', emphasize: true });

    for (const l of lots) {
      if (!(l.tp_price > 0)) continue;
      const resting = l.target === 'T1' ? 'rgb(var(--status-orange))' : 'rgb(var(--status-green))';
      markers.push({
        key: `tp${l.id}`,
        label: `${l.target}·${l.id}${l.tp_hit ? ' ✓' : l.stopped ? ' ✗' : ''}`,
        value: l.tp_price,
        color: l.tp_hit ? 'rgb(var(--status-green))' : l.stopped ? 'rgb(var(--status-red))' : resting,
        hit: l.tp_hit,
        dim: l.stopped,
      });
    }

    // dash toward the nearest target still above price on a lot that is actually open
    const nextTp = open.map((l) => l.tp_price).filter((v) => v > live).sort((a, b) => a - b)[0] ?? null;

    return (
      <>
        {live > 0 && markers.length >= 2 && (
          <Bar markers={markers} avg={p.avg_cost} live={live} dashTo={nextTp} />
        )}
        <div className="mt-2 space-y-1.5">
          {lots.map((l) => (
            <LotChip key={l.id} l={l} />
          ))}
        </div>
      </>
    );
  }

  // ── classic position ────────────────────────────────────────────────────────
  const { stop_loss: stop, avg_cost: avg, t1_price: t1, t2_price: t2 } = p;
  const vals = [stop, avg, live, t1, t2].filter((v) => v > 0);
  if (vals.length < 2 || !live || live <= 0) return null;

  const markers: Marker[] = [
    stop > 0 && { key: 'stop', label: 'STOP', value: stop, color: 'rgb(var(--status-red))' },
    avg > 0 && { key: 'avg', label: 'AVG', value: avg, color: 'rgb(var(--muted))' },
    { key: 'now', label: 'NOW', value: live, color: 'rgb(var(--accent-2))', emphasize: true },
    t1 > 0 && { key: 't1', label: p.t1_hit ? 'T1 ✓' : 'T1', value: t1, color: 'rgb(var(--status-orange))', hit: !!p.t1_hit },
    t2 > 0 && { key: 't2', label: p.t2_hit ? 'T2 ✓' : 'T2', value: t2, color: 'rgb(var(--status-green))', hit: !!p.t2_hit },
  ].filter(Boolean) as Marker[];

  return <Bar markers={markers} avg={avg} live={live} dashTo={t1 > 0 ? t1 : null} />;
}
