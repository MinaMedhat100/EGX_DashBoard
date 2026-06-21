import { useCallback, useState } from 'react';
import { api } from '../api/client';
import type { MarketOverview, Opportunity } from '../types/portfolio';

export interface ScanParams {
  min_adx: number;
  min_di_gap: number;
  rsi_min: number;
  rsi_max: number;
}

type Phase = 'idle' | 'scanning' | 'analyzing';

export function useScan() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [opportunities, setOpportunities] = useState<Opportunity[] | null>(null);
  const [market, setMarket] = useState<MarketOverview | null>(null);
  const [meta, setMeta] = useState<{ scanned: number; passed: number; aiFallback: boolean; model: string; note: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (params: ScanParams) => {
    setError(null);
    setPhase('scanning');
    // a tiny delay lets the UI paint the "Analyzing" phase label once the request is mid-flight
    const t = setTimeout(() => setPhase('analyzing'), 1200);
    try {
      const res = await api.scan(params);
      clearTimeout(t);
      setOpportunities(res.opportunities);
      setMarket(res.market);
      setMeta({ scanned: res.raw.scanned, passed: res.raw.passed, aiFallback: res.ai_fallback, model: res.model, note: res.note ?? null });
    } catch (e) {
      clearTimeout(t);
      setError((e as Error).message);
    } finally {
      setPhase('idle');
    }
  }, []);

  return { phase, busy: phase !== 'idle', opportunities, market, meta, error, run };
}
