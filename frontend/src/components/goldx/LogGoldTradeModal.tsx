import { useEffect, useState } from 'react';

type OrderType = 'BUY_NEW' | 'BUY_ADD' | 'SELL' | 'STOP_OUT';

export function LogGoldTradeModal({ open, hasPosition, onClose, onSubmit }: {
  open: boolean;
  hasPosition: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [type, setType] = useState<OrderType>(hasPosition ? 'BUY_ADD' : 'BUY_NEW');
  useEffect(() => { if (open) setType(hasPosition ? 'BUY_ADD' : 'BUY_NEW'); }, [open, hasPosition]);
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [target, setTarget] = useState<'T1' | 'T2'>('T1');
  const [raiseBe, setRaiseBe] = useState(true);
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  const isSell = type === 'SELL';
  const types: OrderType[] = hasPosition ? ['BUY_ADD', 'SELL', 'STOP_OUT'] : ['BUY_NEW'];

  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit({
        type, shares: Number(shares), price: Number(price),
        date: new Date().toISOString().slice(0, 10),
        ...(isSell ? { target, raise_stop_be: raiseBe } : {}),
      });
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-bg-card border border-white/15 rounded-2xl p-5 w-[360px] space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-bold">Log gold trade (USD/oz)</div>
        <div className="flex flex-wrap gap-1.5">
          {types.map((t) => (
            <button key={t} onClick={() => setType(t)} className={`text-xs px-2 py-1 rounded-lg border ${type === t ? 'gradient-purple text-white border-transparent' : 'bg-white/5 border-white/10 text-txt-secondary'}`}>{t}</button>
          ))}
        </div>
        <label className="block"><span className="text-[10px] uppercase text-txt-secondary">Ounces</span>
          <input type="number" step="0.001" value={shares} onChange={(e) => setShares(e.target.value)} className="mt-1 w-full bg-bg-card border border-white/15 rounded px-2 py-1 text-sm" /></label>
        <label className="block"><span className="text-[10px] uppercase text-txt-secondary">Price (USD/oz)</span>
          <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1 w-full bg-bg-card border border-white/15 rounded px-2 py-1 text-sm" /></label>
        {type === 'BUY_NEW' && <div className="text-[11px] text-txt-secondary">AI will set the stop &amp; targets from live indicators right after you log this.</div>}
        {isSell && (
          <div className="space-y-2">
            <div className="flex gap-1.5">
              {(['T1', 'T2'] as const).map((t) => (
                <button key={t} onClick={() => setTarget(t)} className={`text-xs px-2 py-1 rounded-lg border ${target === t ? 'gradient-purple text-white border-transparent' : 'bg-white/5 border-white/10 text-txt-secondary'}`}>{t}</button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-txt-secondary"><input type="checkbox" checked={raiseBe} onChange={(e) => setRaiseBe(e.target.checked)} /> Raise stop to break-even</label>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={submit} disabled={busy || !shares || !price} className="btn-primary px-3 py-1 text-sm">{busy ? 'Saving…' : 'Log trade'}</button>
          <button onClick={onClose} className="btn-ghost px-3 py-1 text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}
