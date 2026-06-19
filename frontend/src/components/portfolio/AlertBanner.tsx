import type { Position } from '../../types/portfolio';
import { STATUS_META } from '../../lib/format';

const EMOJI: Record<string, string> = {
  red: '🔴',
  orange_hot: '🟠',
  green: '🟢',
  yellow: '🟡',
  purple: '🟣',
};

export function AlertBanner({ positions }: { positions: Position[] }) {
  const alerts = positions.filter((p) => p.alert && (p.alert.flags.length > 0 || p.alert.thndr_action));
  if (alerts.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {alerts.map((p) => {
        const meta = STATUS_META[p.status_key] ?? STATUS_META.yellow;
        return (
          <div
            key={p.ticker}
            className="shrink-0 flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
            style={{ background: meta.bg, border: `1px solid ${meta.ring}` }}
          >
            <span>{EMOJI[p.status_key] ?? '🔔'}</span>
            <span className="font-bold" style={{ color: meta.color }}>
              {p.ticker}
            </span>
            <span className="text-txt-primary/90 whitespace-nowrap">{p.alert?.thndr_action}</span>
            {p.alert?.flags.map((f) => (
              <span key={f} className="text-[9px] font-bold px-1 py-0.5 rounded bg-black/30" style={{ color: meta.color }}>
                {f}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}
