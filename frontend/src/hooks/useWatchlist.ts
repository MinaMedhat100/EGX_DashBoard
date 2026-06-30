import { useCallback, useState } from 'react';
import { api } from '../api/client';

export function useWatchlist() {
  const [tickers, setTickers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setTickers((await api.getWatchlist()).tickers);
    } catch {
      /* watchlist is optional */
    }
  }, []);

  const save = useCallback(async (next: string[]) => {
    setSaving(true);
    try {
      const saved = (await api.saveWatchlist(next)).tickers;
      setTickers(saved);
      return saved;
    } finally {
      setSaving(false);
    }
  }, []);

  return { tickers, setTickers, load, save, saving };
}
