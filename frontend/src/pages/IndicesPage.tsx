import { useEffect } from 'react';
import { useIndices } from '../hooks/useIndices';
import { IndexCard } from '../components/indices/IndexCard';
import { GlowCard } from '../components/common/GlowCard';

function regimeBg(regime?: string) {
  if (!regime) return 'bg-surface border-border';
  if (/on/i.test(regime)) return 'bg-status-green/10 border-status-green/30 text-status-green';
  if (/off/i.test(regime)) return 'bg-status-red/10 border-status-red/30 text-status-red';
  return 'bg-status-orange/10 border-status-orange/30 text-status-orange';
}

export function IndicesPage() {
  const indices = useIndices();

  useEffect(() => {
    indices.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snap = indices.snapshot;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-txt-secondary">
          {snap ? `Last refreshed ${new Date(snap.timestamp).toLocaleString('en-GB')}` : 'No snapshot yet — hit Refresh.'}
        </div>
        <button onClick={indices.refresh} disabled={indices.busy} className="btn-primary min-w-[180px]">
          {indices.busy ? '🧠 Fetching & analyzing…' : '🔄 Refresh Indices'}
        </button>
      </div>

      {indices.error && <div className="text-status-red text-sm">⚠ {indices.error}</div>}

      {snap?.overall && (
        <GlowCard className={`p-4 border ${regimeBg(snap.overall.regime)}`}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">Overall EGX regime: {snap.overall.regime}</span>
          </div>
          <p className="text-xs mt-1 text-txt-primary/85">{snap.overall.summary}</p>
        </GlowCard>
      )}

      {!snap && !indices.busy && (
        <GlowCard className="p-8 text-center text-txt-secondary">
          Hit <span className="text-accent-cyan font-semibold">Refresh Indices</span> to pull EGX30/70/100 levels, trend and regime.
        </GlowCard>
      )}

      {snap && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {snap.indices.map((d) => (
            <IndexCard key={d.index} d={d} />
          ))}
        </div>
      )}
    </div>
  );
}
