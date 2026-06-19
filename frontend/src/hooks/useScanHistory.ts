import { useCallback, useState } from 'react';
import { api } from '../api/client';
import type { ScanRun, ScanRunSummary } from '../types/portfolio';

export function useScanHistory() {
  const [list, setList] = useState<ScanRunSummary[]>([]);
  const [selected, setSelected] = useState<ScanRun | null>(null);
  const [loadingRun, setLoadingRun] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setList((await api.scanHistory()).runs);
    } catch {
      /* history is optional */
    }
  }, []);

  const view = useCallback(async (id: string | null) => {
    if (!id) {
      setSelected(null);
      return;
    }
    setLoadingRun(true);
    try {
      setSelected(await api.scanRun(id));
    } catch {
      setSelected(null);
    } finally {
      setLoadingRun(false);
    }
  }, []);

  const clear = useCallback(async () => {
    try {
      await api.clearScanHistory();
    } finally {
      setList([]);
      setSelected(null);
    }
  }, []);

  return { list, selected, loadingRun, refresh, view, clear, setSelected };
}
