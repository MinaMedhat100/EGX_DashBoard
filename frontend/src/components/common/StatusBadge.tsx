import { STATUS_META } from '../../lib/format';
import type { StatusKey } from '../../types/portfolio';

export function StatusBadge({ status, small = false }: { status: StatusKey; small?: boolean }) {
  const m = STATUS_META[status] ?? STATUS_META.yellow;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold uppercase tracking-wide whitespace-nowrap ${
        small ? 'text-[10px] px-2 py-0.5' : 'text-[11px] px-2.5 py-1'
      }`}
      style={{ color: m.color, background: m.bg, border: `1px solid ${m.ring}` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color, boxShadow: `0 0 8px ${m.color}` }} />
      {m.label}
    </span>
  );
}
