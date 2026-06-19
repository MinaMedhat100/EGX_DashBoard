import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { PortfolioData, Position } from '../types/portfolio';

export function usePortfolio() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      setData(await api.getPortfolio());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Merge an updated set of positions (from refresh/analyze) into the current data.
  const applyPositions = useCallback((positions: Position[], lastRefresh?: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const byTicker = new Map(positions.map((p) => [p.ticker, p]));
      return {
        ...prev,
        last_refresh: lastRefresh ?? prev.last_refresh,
        positions: prev.positions.map((p) => byTicker.get(p.ticker) ?? p),
      };
    });
  }, []);

  return { data, setData, loading, error, reload, applyPositions };
}
