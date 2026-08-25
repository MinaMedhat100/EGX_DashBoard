import { useEffect, useState } from 'react';
import { GlowCard } from '../common/GlowCard';

export function WatchlistEditor({
  tickers,
  saving,
  onSave,
  onScan,
  busy,
}: {
  tickers: string[];
  saving: boolean;
  onSave: (tickers: string[]) => void;
  onScan: (tickers: string[]) => void;
  busy: boolean;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => { setText(tickers.join(', ')); }, [tickers]);

  const parsed = text.split(/[\s,]+/).map((t) => t.trim().toUpperCase()).filter(Boolean);
  const unique = Array.from(new Set(parsed));

  return (
    <GlowCard className="p-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setOpen((o) => !o)} className="text-sm font-semibold flex items-center gap-2">
          <span>{open ? '▾' : '▸'}</span> 🎯 Watchlist <span className="text-txt-secondary">({tickers.length})</span>
        </button>
        <button
          onClick={() => onScan(unique)}
          disabled={busy || unique.length === 0}
          className="btn-primary min-w-[170px]"
        >
          {busy ? '… scanning watchlist' : '🎯 Scan Watchlist'}
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="COMI, SWDY, EGAS …"
            rows={2}
            className="w-full bg-bg-card border border-border-strong rounded-lg px-3 py-2 text-sm font-mono focus:border-accent-cyan focus:outline-none"
          />
          <div className="flex items-center gap-3 text-xs text-txt-secondary">
            <button onClick={() => onSave(unique)} disabled={saving} className="btn-ghost py-1.5">
              {saving ? 'Saving…' : '💾 Save list'}
            </button>
            <span>{unique.length} tickers · saved list is reused next time</span>
          </div>
        </div>
      )}
    </GlowCard>
  );
}
