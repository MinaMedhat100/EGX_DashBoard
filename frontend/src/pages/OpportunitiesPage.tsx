import { useEffect, useState } from 'react';
import { useScan, type ScanParams } from '../hooks/useScan';
import { useMarketOverview } from '../hooks/useMarketOverview';
import { MarketStrip } from '../components/opportunities/MarketStrip';
import { ScanControls } from '../components/opportunities/ScanControls';
import { OpportunityCard } from '../components/opportunities/OpportunityCard';
import { GlowCard } from '../components/common/GlowCard';

function ScanningState({ phase }: { phase: 'scanning' | 'analyzing' }) {
  return (
    <GlowCard className="p-8 text-center">
      <div className="inline-block w-8 h-8 border-2 border-accent-purple/40 border-t-accent-purple-lt rounded-full animate-spin mb-3" />
      <div className="font-semibold">
        {phase === 'analyzing' ? '🧠 AI ranking the best entries…' : '🔍 Scanning EGX & pulling indicators…'}
      </div>
      <div className="text-xs text-txt-secondary mt-1">
        Fetching the screener, per-candidate analysis, then Opus ranking — this takes a couple of minutes.
      </div>
    </GlowCard>
  );
}

export function OpportunitiesPage() {
  const market = useMarketOverview();
  const scan = useScan();
  const [params, setParams] = useState<ScanParams>({ min_adx: 35, min_di_gap: 5, rsi_min: 40, rsi_max: 70 });

  useEffect(() => {
    market.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mkt = scan.market ?? market.data;

  return (
    <div className="space-y-5">
      <MarketStrip data={mkt} />
      <ScanControls
        params={params}
        setParams={setParams}
        onRun={() => scan.run(params)}
        busy={scan.busy}
        phase={scan.phase}
      />

      {scan.error && <div className="text-status-red text-sm">⚠ {scan.error}</div>}
      {scan.meta && !scan.busy && (
        <div className="text-xs text-txt-secondary">
          Scanned {scan.meta.scanned} · {scan.meta.passed} passed filter · ranked by{' '}
          {scan.meta.aiFallback ? 'score (AI unavailable)' : `AI (${scan.meta.model})`}
        </div>
      )}

      {scan.busy && <ScanningState phase={scan.phase === 'idle' ? 'scanning' : scan.phase} />}

      {!scan.busy && !scan.opportunities && (
        <GlowCard className="p-8 text-center text-txt-secondary">
          Set your filters and hit <span className="text-accent-cyan font-semibold">Run Scan</span> to find AI-ranked EGX entries.
        </GlowCard>
      )}

      {!scan.busy && scan.opportunities && scan.opportunities.length === 0 && (
        <GlowCard className="p-8 text-center text-txt-secondary">No candidates passed the filter. Try loosening ADX / DI gap.</GlowCard>
      )}

      {!scan.busy && scan.opportunities && scan.opportunities.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {scan.opportunities.map((o, i) => (
            <OpportunityCard key={`${o.ticker}-${i}`} o={o} />
          ))}
        </div>
      )}
    </div>
  );
}
