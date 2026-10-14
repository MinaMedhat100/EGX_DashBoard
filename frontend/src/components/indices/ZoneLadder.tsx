import type { IndexData, IndexZone } from '../../types/portfolio';
import { distText, fmtLevel, scenarioMarks, sourceLabel, zoneDots, zoneRange } from '../../lib/indices';

const ROLE_TEXT: Record<IndexZone['role'], string> = {
  resistance: 'text-status-red',
  at_price: 'text-accent-cyan',
  support: 'text-status-green',
};

function ZoneRow({ z, note, mark }: { z: IndexZone; note?: string; mark?: string }) {
  return (
    <li className={`px-2 py-1.5 rounded ${z.role === 'at_price' ? 'bg-accent-cyan/10 border border-accent-cyan/40' : ''}`}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[10px] text-txt-secondary w-6">{z.id}</span>
        <span className={`font-mono font-semibold ${ROLE_TEXT[z.role]}`}>{zoneRange(z)}</span>
        <span className="text-status-yellow tracking-tight" title={`score ${z.score}`}>{zoneDots(z.dots)}</span>
        <span className="text-[11px] text-txt-secondary">{distText(z)}</span>
        {mark && <span title="scenario level">{mark}</span>}
      </div>
      <div className="flex flex-wrap gap-1 mt-1 ml-8">
        {z.sources.map((s) => (
          <span
            key={`${s.name}-${s.tf}`}
            title={fmtLevel(s.value)}
            className={`text-[10px] px-1 rounded ${s.tf === 'W' ? 'border border-accent-cyan/60 text-accent-cyan' : 'bg-surface text-txt-secondary'}`}
          >
            {sourceLabel(s)}
          </span>
        ))}
      </div>
      {note && <div className="text-[11px] text-txt-primary/80 mt-1 ml-8 leading-snug">{note}</div>}
    </li>
  );
}

export function ZoneLadder({ d }: { d: IndexData }) {
  const zones = d.zones || [];
  if (!zones.length) {
    return <div className="text-xs text-txt-secondary">No zones — the index level or ATR is missing. Try Refresh.</div>;
  }
  const notes = Object.fromEntries((d.ai?.zones || []).map((n) => [n.id, n.note]));
  const marks = scenarioMarks(d.ai, zones);
  const above = zones.filter((z) => z.role === 'resistance');
  const at = zones.filter((z) => z.role === 'at_price');
  const below = zones.filter((z) => z.role === 'support');
  const row = (z: IndexZone) => <ZoneRow key={z.id} z={z} note={notes[z.id]} mark={marks[z.id]} />;
  return (
    <div className="text-xs">
      <div className="flex items-baseline justify-between mb-1">
        <span className="font-bold text-sm">Support & resistance zones</span>
        {d.weekly_ok === false && <span className="text-[10px] text-status-orange">weekly levels unavailable</span>}
      </div>
      <ul className="space-y-0.5">
        {above.map(row)}
        {at.length ? at.map(row) : null}
        <li className="flex items-center gap-2 py-1 text-accent-cyan font-semibold">
          <span className="flex-1 border-t border-dashed border-accent-cyan/60" />
          now {fmtLevel(d.level)}
          <span className="flex-1 border-t border-dashed border-accent-cyan/60" />
        </li>
        {below.map(row)}
      </ul>
      <div className="text-[10px] text-txt-secondary mt-2">
        ●●● strength (weekly levels count double) · outlined chips = weekly · D = daily-call level
      </div>
    </div>
  );
}
