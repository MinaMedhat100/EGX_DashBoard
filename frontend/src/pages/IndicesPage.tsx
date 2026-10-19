import { useEffect, useState } from 'react';
import { useIndices } from '../hooks/useIndices';
import { IndexTile } from '../components/indices/IndexTile';
import { IndexDetail } from '../components/indices/IndexDetail';
import { GlowCard } from '../components/common/GlowCard';
import { costText, pickTab } from '../lib/indices';

const TAB_KEY = 'egx.indices.tab';

function readTab(): string | null {
  try { return localStorage.getItem(TAB_KEY); } catch { return null; }
}
function saveTab(name: string) {
  try { localStorage.setItem(TAB_KEY, name); } catch { /* per-viewer convenience only */ }
}

function regimeBg(regime?: string) {
  if (!regime) return 'bg-surface border-border';
  if (/on/i.test(regime)) return 'bg-status-green/10 border-status-green/30 text-status-green';
  if (/off/i.test(regime)) return 'bg-status-red/10 border-status-red/30 text-status-red';
  return 'bg-status-orange/10 border-status-orange/30 text-status-orange';
}

export function IndicesPage() {
  const indices = useIndices();
  const [saved, setSaved] = useState<string | null>(readTab);

  useEffect(() => {
    indices.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snap = indices.snapshot;
  const names = snap?.indices.map((d) => d.index) ?? [];
  const tab = pickTab(saved, names);
  const selected = snap?.indices.find((d) => d.index === tab) ?? null;
  const cost = costText(snap?.cost_usd);

  const select = (name: string) => {
    setSaved(name);
    saveTab(name);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-txt-secondary">
          {snap ? `Last refreshed ${new Date(snap.timestamp).toLocaleString('en-GB')}` : 'No snapshot yet — hit Refresh.'}
          {cost && <span className="ml-2">· {cost}</span>}
        </div>
        <button onClick={indices.refresh} disabled={indices.busy} className="btn-primary min-w-[180px]">
          {indices.busy ? '🧠 Fetching & analyzing…' : '🔄 Refresh Indices'}
        </button>
      </div>

      {indices.error && <div className="text-status-red text-sm">⚠ {indices.error}</div>}
      {snap?.ai_error && <div className="text-status-orange text-sm">⚠ AI read failed: {snap.ai_error} — zones are still shown.</div>}

      {snap?.overall && (
        <GlowCard className={`p-4 border ${regimeBg(snap.overall.regime)}`}>
          <span className="text-sm font-bold">Overall EGX regime: {snap.overall.regime}</span>
          <p className="text-xs mt-1 text-txt-primary/85">{snap.overall.summary}</p>
        </GlowCard>
      )}

      {!snap && !indices.busy && (
        <GlowCard className="p-8 text-center text-txt-secondary">
          Hit <span className="text-accent-cyan font-semibold">Refresh Indices</span> to pull EGX30/70/100 levels, zones and regime.
        </GlowCard>
      )}

      {snap && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {snap.indices.map((d) => (
              <IndexTile key={d.index} d={d} active={d.index === tab} onSelect={() => select(d.index)} />
            ))}
          </div>
          {selected && <IndexDetail d={selected} pool={snap.news} />}
        </>
      )}
    </div>
  );
}
