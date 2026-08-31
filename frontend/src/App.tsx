import { useEffect, useState } from 'react';
import { api } from './api/client';
import { usePortfolio } from './hooks/usePortfolio';
import { useRefresh } from './hooks/useRefresh';
import { ToastProvider, useToast } from './components/common/Toast';
import { Sidebar, type Tab } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { PortfolioPage } from './pages/PortfolioPage';
import { IndicesPage } from './pages/IndicesPage';
import { OpportunitiesPage } from './pages/OpportunitiesPage';
import { GoldxPage } from './pages/GoldxPage';
import { HistoryPage } from './pages/HistoryPage';
import { GlowCard } from './components/common/GlowCard';
import { LogOrderModal } from './components/orders/LogOrderModal';
import type { PortfolioData, LevelProposal, Position, Opportunity, OrderPrefill } from './types/portfolio';

function LoadingState() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <GlowCard key={i} className="p-4 h-44 shimmer" >
          <div className="h-5 w-24 bg-border rounded mb-3" />
          <div className="h-3 w-40 bg-surface rounded mb-2" />
          <div className="h-3 w-32 bg-surface rounded" />
        </GlowCard>
      ))}
    </div>
  );
}

function Shell() {
  const toast = useToast();
  const { data, setData, loading, error, applyPositions } = usePortfolio();
  const refresh = useRefresh(applyPositions);
  const [tab, setTab] = useState<Tab>('portfolio');
  const [health, setHealth] = useState<{ bridge: boolean; model: string } | null>(null);
  const [orderModal, setOrderModal] = useState<{ open: boolean; ticker: string; prefill?: OrderPrefill }>({ open: false, ticker: '' });
  const [aiUpdating, setAiUpdating] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Record<string, LevelProposal>>({});
  const [staleTicker, setStaleTicker] = useState<string | null>(null);

  useEffect(() => {
    api
      .health()
      .then((h) => setHealth({ bridge: h.bridge, model: h.analysis_model }))
      .catch(() => setHealth(null));
  }, []);

  const doRefresh = async () => {
    const r = await refresh.run();
    if (r.ok && r.aiOk) {
      setData((d) => (d ? { ...d, book_ai: r.book_ai ?? null } : d));
      setProposals(r.proposals ?? {});
      const n = Object.keys(r.proposals ?? {}).length;
      toast(n ? `Refresh complete — ${n} position${n > 1 ? 's have' : ' has'} updated AI levels to review` : 'Refresh complete', 'success');
    } else if (r.ok) toast('Prices updated — AI analysis failed', 'error');
    else toast('Refresh failed — is the backend running?', 'error');
  };

  const onLogOrder = (ticker: string) => setOrderModal({ open: true, ticker });

  const onLogOpportunity = (o: Opportunity) =>
    setOrderModal({
      open: true,
      ticker: o.ticker,
      prefill: {
        entryMode: 'bracket',
        price: o.entry_zone?.[1] ?? o.entry_zone?.[0],
        stop: o.stop,
        t1: o.t1,
        t2: o.t2,
        split: o.split?.[0] ?? 50,
      },
    });

  const runAiUpdate = async (ticker: string) => {
    setAiUpdating(ticker);
    try {
      const r = await api.refreshAi(ticker);
      applyPositions([r.position]);
      if (r.applied) toast(`AI set levels for ${ticker}`, 'success');
      else if (r.proposal) {
        setProposals((m) => ({ ...m, [ticker]: r.proposal as LevelProposal }));
        toast(`${ticker}: AI proposed updated levels — review on the card`, 'success');
      } else if (r.error) {
        toast(`${ticker}: AI couldn't set levels (${r.error})`, 'error');
      } else {
        // AI ran but proposed no change (e.g. a bracket whose placed levels it verified as good).
        toast(`${ticker}: AI reviewed — levels look good`, 'success');
      }
      setStaleTicker(ticker);
    } catch (e) {
      toast(`${ticker}: AI refresh failed — ${(e as Error).message}`, 'error');
    } finally {
      setAiUpdating(null);
    }
  };

  const onOrderApplied = (portfolio: PortfolioData, ticker: string, _type: string, msg: string) => {
    setData(portfolio);
    toast(msg, 'success');
    // Run the AI on the new position — classic: set pending levels; bracket: verify the placed
    // levels (and later manage the runner), surfacing an advisory Apply chip only on disagreement.
    if (ticker) runAiUpdate(ticker);
  };

  const onApplyLevels = async (ticker: string, levels: { stop: number; t1: number; t2: number }) => {
    try {
      const r = await api.applyLevels(ticker, levels);
      applyPositions([r.position]);
      setProposals((m) => { const n = { ...m }; delete n[ticker]; return n; });
      toast(`${ticker}: levels updated`, 'success');
    } catch (e) {
      toast(`${ticker}: ${(e as Error).message}`, 'error');
    }
  };

  const onCorrectEntry = async (ticker: string, entry: { shares: number; avg_cost: number }) => {
    try {
      const r = await api.correctEntry(ticker, entry);
      setData(r.portfolio);
      toast(r.toast || `${ticker}: entry corrected`, 'success');
    } catch (e) {
      toast(`${ticker}: ${(e as Error).message}`, 'error');
    }
  };

  const onDismissProposal = (ticker: string) =>
    setProposals((m) => { const n = { ...m }; delete n[ticker]; return n; });

  return (
    <div className="flex min-h-screen">
      <Sidebar
        data={data}
        tab={tab}
        setTab={setTab}
        onRefresh={doRefresh}
        phase={refresh.phase}
        onLogTrade={() => onLogOrder('')}
      />
      <main className="flex-1 p-6 min-w-0">
        <div className="max-w-[1400px] mx-auto">
          <Header tab={tab} model={health?.model ?? null} bridgeOk={health?.bridge ?? null} />
          {loading && <LoadingState />}
          {error && !loading && (
            <GlowCard className="p-6 text-status-red">
              ⚠ {error}
              <div className="text-txt-secondary text-sm mt-1">
                Make sure the backend (port 3001) and MCP bridge (port 8001) are running.
              </div>
            </GlowCard>
          )}
          {data && tab === 'portfolio' && (
            <PortfolioPage
              data={data}
              refreshing={refresh.refreshing}
              onLogOrder={onLogOrder}
              aiUpdating={aiUpdating}
              proposals={proposals}
              onApplyLevels={onApplyLevels}
              onDismissProposal={onDismissProposal}
              onCorrectEntry={onCorrectEntry}
              staleTicker={staleTicker}
              onRefreshAll={() => { setStaleTicker(null); doRefresh(); }}
              onDismissStale={() => setStaleTicker(null)}
            />
          )}
          {data && tab === 'indices' && <IndicesPage />}
          {data && tab === 'opportunities' && <OpportunitiesPage onLogOpportunity={onLogOpportunity} />}
          {data && tab === 'goldx' && <GoldxPage />}
          {data && tab === 'history' && <HistoryPage data={data} />}
        </div>
      </main>

      <LogOrderModal
        open={orderModal.open}
        onClose={() => setOrderModal({ open: false, ticker: '' })}
        initialTicker={orderModal.ticker}
        prefill={orderModal.prefill}
        positions={data?.positions ?? []}
        onApplied={onOrderApplied}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}
