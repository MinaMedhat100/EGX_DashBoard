import { useCallback, useState } from 'react';
import { api } from '../api/client';
import type { IndexSnapshot } from '../types/portfolio';

export function useIndices() {
  const [snapshot, setSnapshot] = useState<IndexSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSnapshot((await api.getIndices()).snapshot);
    } catch {
      /* no cache yet */
    }
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.refreshIndices();
      if (r.snapshot) setSnapshot(r.snapshot);
      if (!r.ok) setError(r.error || 'refresh failed');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  return { snapshot, busy, error, load, refresh };
}
