import { useEffect, useState } from 'react';
import { useScan, type ScanParams } from '../hooks/useScan';
import { useMarketOverview } from '../hooks/useMarketOverview';
import { useScanHistory } from '../hooks/useScanHistory';
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

function runLabel(ts: string) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function OpportunitiesPage() {
  const market = useMarketOverview();
  const scan = useScan();
  const history = useScanHistory();
  const [params, setParams] = useState<ScanParams>({ min_adx: 35, min_di_gap: 5, rsi_min: 40, rsi_max: 70 });

  useEffect(() => {
    market.load();
    history.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runScan = async () => {
    await scan.run(params);
    history.setSelected(null); // return to the live result
    history.refresh();
  };

  const viewing = history.selected; // non-null => showing a saved run (read-only)
  const shownOpps = viewing ? viewing.opportunities : scan.opportunities;
  const shownMarket = viewing ? viewing.market : (scan.market ?? market.data);

  return (
    <div className="space-y-5">
      <MarketStrip data={shownMarket} />

      {/* run-selector */}
      {history.list.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-txt-secondary">Past runs:</span>
          <select
            className="bg-bg-card border border-white/15 rounded-lg px-2.5 py-1.5 text-sm max-w-[420px]"
            value={viewing?.id ?? ''}
            onChange={(e) => history.view(e.target.value || null)}
          >
            <option value="" className="bg-bg-card">● Live scan result</option>
            {history.list.map((r) => (
              <option key={r.id} value={r.id} className="bg-bg-card">
                {runLabel(r.timestamp)} · {r.count} picks · ADX&gt;{r.params?.min_adx} RSI {r.params?.rsi_min}-{r.params?.rsi_max} · {r.model}
              </option>
            ))}
          </select>
          {viewing && (
            <button onClick={() => history.view(null)} className="btn-ghost py-1.5">↩ Back to live</button>
          )}
          <button
            onClick={() => { if (confirm('Clear all saved scan runs?')) history.clear(); }}
            className="text-xs text-txt-secondary hover:text-status-red ml-auto"
          >
            Clear history
          </button>
        </div>
      )}

      <ScanControls
        params={params}
        setParams={setParams}
        onRun={runScan}
        busy={scan.busy}
        phase={scan.phase}
      />

      {scan.error && <div className="text-status-red text-sm">⚠ {scan.error}</div>}

      {viewing ? (
        <div className="text-xs rounded-lg px-3 py-2 bg-accent-purple/10 border border-accent-purple/30 text-accent-purple-lt">
          📜 Viewing saved run from <b>{runLabel(viewing.timestamp)}</b> · {viewing.passed} passed of {viewing.scanned} scanned ·
          ranked by {viewing.ai_fallback ? 'score (AI unavailable)' : `AI (${viewing.model})`} · read-only
        </div>
      ) : (
        scan.meta && !scan.busy && (
          <div className="text-xs text-txt-secondary">
            Scanned {scan.meta.scanned} · {scan.meta.passed} passed filter · ranked by{' '}
            {scan.meta.aiFallback ? 'score (AI unavailable)' : `AI (${scan.meta.model})`}
          </div>
        )
      )}

      {scan.busy && <ScanningState phase={scan.phase === 'idle' ? 'scanning' : scan.phase} />}

      {!scan.busy && !shownOpps && (
        <GlowCard className="p-8 text-center text-txt-secondary">
          Set your filters and hit <span className="text-accent-cyan font-semibold">Run Scan</span> to find AI-ranked EGX entries.
        </GlowCard>
      )}

      {!scan.busy && shownOpps && shownOpps.length === 0 && (
        <GlowCard className="p-8 text-center text-txt-secondary">
          {scan.meta?.note
            ? `No results — ${scan.meta.note}`
            : 'No candidates passed the filter. Try loosening ADX / DI gap.'}
        </GlowCard>
      )}

      {!scan.busy && shownOpps && shownOpps.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {shownOpps.map((o, i) => (
            <OpportunityCard key={`${o.ticker}-${i}`} o={o} />
          ))}
        </div>
      )}
    </div>
  );
}
