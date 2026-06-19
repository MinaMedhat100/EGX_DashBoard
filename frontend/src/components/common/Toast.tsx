import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  msg: string;
  kind: ToastKind;
}

const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((msg: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="glass px-4 py-3 text-sm animate-fade-in min-w-[240px] max-w-sm shadow-glow"
            style={{
              borderColor:
                t.kind === 'error'
                  ? 'rgba(239,68,68,0.55)'
                  : t.kind === 'success'
                    ? 'rgba(34,197,94,0.55)'
                    : 'rgba(124,58,237,0.45)',
            }}
          >
            <span className="mr-2">{t.kind === 'success' ? '✅' : t.kind === 'error' ? '⚠️' : '🔔'}</span>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
