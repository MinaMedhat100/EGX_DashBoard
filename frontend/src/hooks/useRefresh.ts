import { useCallback, useState } from 'react';
import { api } from '../api/client';
import type { Position, LevelProposal, StaleNotice } from '../types/portfolio';

type Phase = 'idle' | 'refreshing' | 'analyzing';

export function useRefresh(applyPositions: (p: Position[], last?: string) => void) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (model?: string) => {
      setError(null);
      // Phase 1 — live prices + deterministic status (fast)
      setPhase('refreshing');
      let stale: StaleNotice | null = null;
      try {
        const r = await api.refresh();
        applyPositions(r.positions, r.last_refresh);
        stale = r.stale ?? null;
      } catch (e) {
        setError(`Refresh failed: ${(e as Error).message}`);
        setPhase('idle');
        return { ok: false, phase: 'refreshing' as const };
      }

      // TradingView is rate-limiting us: the prices are the last good ones, so don't pay for an
      // AI read of them (v2.7.1).
      if (stale) {
        setPhase('idle');
        return { ok: true, aiOk: false, stale, phase: 'refreshing' as const };
      }

      // Phase 2 — AI analysis (slower)
      setPhase('analyzing');
      let book_ai = null;
      let proposals: Record<string, LevelProposal> = {};
      let journal_warning: string | null = null;
      try {
        const a = await api.analyze(model);
        applyPositions(a.positions);
        book_ai = a.book_ai ?? null;
        proposals = a.proposals ?? {};
        journal_warning = a.journal_warning ?? null;
      } catch (e) {
        setError(`AI analysis failed: ${(e as Error).message}`);
        setPhase('idle');
        return { ok: true, aiOk: false, phase: 'analyzing' as const };
      }

      setPhase('idle');
      return { ok: true, aiOk: true, book_ai, proposals, journal_warning };
    },
    [applyPositions],
  );

  return {
    phase,
    refreshing: phase === 'refreshing',
    analyzing: phase === 'analyzing',
    busy: phase !== 'idle',
    error,
    run,
  };
}
