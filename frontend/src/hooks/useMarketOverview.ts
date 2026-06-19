import { useCallback, useState } from 'react';
import { api } from '../api/client';
import type { MarketOverview } from '../types/portfolio';

export function useMarketOverview() {
  const [data, setData] = useState<MarketOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.marketOverview());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, setData, loading, error, load };
}
