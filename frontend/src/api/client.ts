import type {
  PortfolioData,
  Position,
  Opportunity,
  MarketOverview,
  NewsItem,
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

  scan: (params: {
    min_adx: number;
    min_di_gap: number;
    rsi_min: number;
    rsi_max: number;
  }) =>
    req<{
      ok: boolean;
      opportunities: Opportunity[];
      market: MarketOverview | null;
      ai_fallback: boolean;
      raw: { scanned: number; passed: number };
      model: string;
    }>('/scan-opportunities', { method: 'POST', body: JSON.stringify(params) }),

  marketOverview: () => req<MarketOverview>('/market-overview'),

  news: (ticker: string) =>
    req<{ ticker: string; items: NewsItem[]; count: number }>(
      `/news/${encodeURIComponent(ticker)}`,
    ),

  logOrder: (payload: Record<string, unknown>) =>
    req<{ ok: boolean; portfolio: PortfolioData; toast?: string }>('/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
