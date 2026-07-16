import { useCallback, useState } from 'react';
import { api } from '../api/client';
import type { GoldState } from '../types/portfolio';

export function useGold() {
  const [state, setState] = useState<GoldState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setState(await api.getGold()); } catch { /* no cache yet */ }
  }, []);

  const analyze = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const r = await api.analyzeGold();
      setState((s) => ({
        snapshot: r.snapshot,
        position: r.position,
        realized_pnl_usd: r.realized_pnl_usd ?? s?.realized_pnl_usd ?? 0,
      }));
      if (!r.ok) setError(r.error || 'analysis failed');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }, []);

  const logOrder = useCallback(async (payload: Record<string, unknown>) => {
    const r = await api.logGoldOrder(payload);
    setState((s) => (s ? { ...s, position: r.position, realized_pnl_usd: r.realized_pnl_usd } : s));
    return r;
  }, []);

  const applyLevels = useCallback(async (levels: { stop: number; t1: number; t2: number }) => {
    const r = await api.applyGoldLevels(levels);
    setState((s) => (s ? { ...s, position: r.position } : s));
  }, []);

  return { state, busy, error, load, analyze, logOrder, applyLevels };
}
