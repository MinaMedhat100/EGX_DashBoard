import { useEffect, useState } from 'react';
import { api } from './api/client';
import { usePortfolio } from './hooks/usePortfolio';
import { useRefresh } from './hooks/useRefresh';
import { ToastProvider, useToast } from './components/common/Toast';
import { Sidebar, type Tab } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { PortfolioPage } from './pages/PortfolioPage';
import { OpportunitiesPage } from './pages/OpportunitiesPage';
import { HistoryPage } from './pages/HistoryPage';
import { GlowCard } from './components/common/GlowCard';
import { LogOrderModal } from './components/orders/LogOrderModal';
import type { PortfolioData } from './types/portfolio';

function LoadingState() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <GlowCard key={i} className="p-4 h-44 shimmer" >
          <div className="h-5 w-24 bg-white/10 rounded mb-3" />
          <div className="h-3 w-40 bg-white/5 rounded mb-2" />
          <div className="h-3 w-32 bg-white/5 rounded" />
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
  const [orderModal, setOrderModal] = useState<{ open: boolean; ticker: string }>({ open: false, ticker: '' });

  useEffect(() => {
    api
      .health()
      .then((h) => setHealth({ bridge: h.bridge, model: h.analysis_model }))
      .catch(() => setHealth(null));
  }, []);

  const doRefresh = async () => {
    const r = await refresh.run();
    if (r.ok && r.aiOk) toast('Refresh complete', 'success');
    else if (r.ok) toast('Prices updated — AI analysis failed', 'error');
    else toast('Refresh failed — is the backend running?', 'error');
  };

  const onLogOrder = (ticker: string) => setOrderModal({ open: true, ticker });

  const onOrderApplied = (portfolio: PortfolioData, msg: string) => {
    setData(portfolio);
    toast(msg, 'success');
  };

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
            <PortfolioPage data={data} refreshing={refresh.refreshing} onLogOrder={onLogOrder} />
          )}
          {data && tab === 'opportunities' && <OpportunitiesPage />}
          {data && tab === 'history' && <HistoryPage data={data} />}
        </div>
      </main>

      <LogOrderModal
        open={orderModal.open}
        onClose={() => setOrderModal({ open: false, ticker: '' })}
        initialTicker={orderModal.ticker}
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
