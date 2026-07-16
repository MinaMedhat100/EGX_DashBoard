import type {
  PortfolioData,
  Position,
  Opportunity,
  MarketOverview,
  NewsItem,
  ScanRun,
  ScanRunSummary,
  RefreshAiResult,
  ScanResponse,
  ScanParamsDto,
  IndexSnapshot,
  GoldState,
  GoldPosition,
} from '../types/portfolio';

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json()).error ?? '';
    } catch {
      /* ignore */
    }
    throw new Error(detail || `${path} -> ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () =>
    req<{ ok: boolean; bridge: boolean; analysis_model: string }>('/health'),

  getPortfolio: () => req<PortfolioData>('/portfolio'),

  refresh: () =>
    req<{ ok: boolean; last_refresh: string; positions: Position[] }>('/refresh', {
      method: 'POST',
      body: '{}',
    }),

  analyze: (model?: string) =>
    req<{ ok: boolean; model: string; analyzed_at: string; positions: Position[] }>(
      '/analyze',
      { method: 'POST', body: JSON.stringify({ model }) },
    ),

  scan: (params: ScanParamsDto) =>
    req<ScanResponse>('/scan-opportunities', { method: 'POST', body: JSON.stringify(params) }),

  marketOverview: () => req<MarketOverview>('/market-overview'),

  getWatchlist: () => req<{ tickers: string[] }>('/watchlist'),

  saveWatchlist: (tickers: string[]) =>
    req<{ tickers: string[] }>('/watchlist', { method: 'PUT', body: JSON.stringify({ tickers }) }),

  scanWatchlist: (tickers: string[], params: ScanParamsDto) =>
    req<ScanResponse>('/scan-watchlist', {
      method: 'POST',
      body: JSON.stringify({ tickers, ...params }),
    }),

  getIndices: () => req<{ snapshot: IndexSnapshot | null }>('/indices'),

  refreshIndices: (model?: string) =>
    req<{ ok: boolean; error?: string; snapshot: IndexSnapshot | null }>('/indices/refresh', {
      method: 'POST',
      body: JSON.stringify({ model }),
    }),

  getGold: () => req<GoldState>('/gold'),

  analyzeGold: (model?: string) =>
    req<{ ok: boolean; error?: string } & GoldState>('/gold/analyze', { method: 'POST', body: JSON.stringify({ model }) }),

  logGoldOrder: (payload: Record<string, unknown>) =>
    req<{ ok: boolean; position: GoldPosition | null; realized_pnl_usd: number; toasts?: string[] }>('/gold/order', { method: 'POST', body: JSON.stringify(payload) }),

  applyGoldLevels: (levels: { stop: number; t1: number; t2: number }) =>
    req<{ ok: boolean; position: GoldPosition }>('/gold/apply-levels', { method: 'POST', body: JSON.stringify(levels) }),

  scanHistory: () => req<{ runs: ScanRunSummary[] }>('/scan-history'),
  scanRun: (id: string) => req<ScanRun>(`/scan-history/${encodeURIComponent(id)}`),
  clearScanHistory: () => req<{ ok: boolean }>('/scan-history', { method: 'DELETE' }),

  news: (ticker: string) =>
    req<{ ticker: string; items: NewsItem[]; count: number }>(
      `/news/${encodeURIComponent(ticker)}`,
    ),

  logOrder: (payload: Record<string, unknown>) =>
    req<{ ok: boolean; portfolio: PortfolioData; toast?: string }>('/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  refreshAi: (ticker: string, model?: string) =>
    req<RefreshAiResult>(
      `/positions/${encodeURIComponent(ticker)}/refresh-ai`,
      { method: 'POST', body: JSON.stringify({ model }) },
    ),

  applyLevels: (ticker: string, levels: { stop: number; t1: number; t2: number }) =>
    req<{ ok: boolean; position: Position }>(
      `/positions/${encodeURIComponent(ticker)}/apply-levels`,
      { method: 'POST', body: JSON.stringify(levels) },
    ),
};
