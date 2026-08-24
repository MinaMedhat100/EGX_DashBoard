import { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { api } from '../../api/client';
import type { PortfolioData, Position } from '../../types/portfolio';

type OrderType = 'STOP_OUT' | 'SELL' | 'BUY_NEW' | 'BUY_ADD';

const TYPE_OPTIONS: { value: OrderType; label: string }[] = [
  { value: 'STOP_OUT', label: 'STOP-OUT' },
  { value: 'SELL', label: 'SELL (T1 / T2)' },
  { value: 'BUY_NEW', label: 'BUY (new position)' },
  { value: 'BUY_ADD', label: 'BUY (add to position)' },
];

const input =
  'w-full bg-bg-card border border-white/15 rounded-lg px-3 py-2 text-sm focus:border-accent-cyan focus:outline-none';
const today = () => new Date().toISOString().slice(0, 10);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-txt-secondary">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function LogOrderModal({
  open,
  onClose,
  initialTicker,
  positions,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  initialTicker: string;
  positions: Position[];
  onApplied: (portfolio: PortfolioData, ticker: string, type: OrderType, toast: string) => void;
}) {
  const [type, setType] = useState<OrderType>('STOP_OUT');
  const [ticker, setTicker] = useState(initialTicker);
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [target, setTarget] = useState<'T1' | 'T2'>('T1');
  const [raiseBe, setRaiseBe] = useState(true);
  const [fifoCost, setFifoCost] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ThndrX bracket entry (BUY_NEW only).
  const [entryMode, setEntryMode] = useState<'classic' | 'bracket'>('classic');
  const [split, setSplit] = useState('50');
  const [bStop, setBStop] = useState('');
  const [bT1, setBT1] = useState('');
  const [bT2, setBT2] = useState('');
  // Lot-aware exit (SELL / STOP_OUT on a bracketed position).
  const [lot, setLot] = useState<'A' | 'B' | 'ALL'>('A');

  // Prefill from the originating card / reset when opened.
  useEffect(() => {
    if (open) {
      setTicker(initialTicker);
      setType(initialTicker ? 'STOP_OUT' : 'BUY_NEW');
      setShares('');
      setPrice('');
      setDate(today());
      setNotes('');
      setTarget('T1');
      setRaiseBe(true);
      setFifoCost('');
      setError(null);
      setEntryMode('classic');
      setSplit('50');
      setBStop('');
      setBT1('');
      setBT2('');
      setLot('A');
    }
  }, [open, initialTicker]);

  const held = positions.find((p) => p.ticker === ticker.toUpperCase());
  const isLotAware = (type === 'SELL' || type === 'STOP_OUT') && !!held?.brackets;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        type,
        ticker: ticker.toUpperCase(),
        shares: Number(shares),
        price: Number(price),
        date,
        notes,
      };
      if (type === 'SELL') {
        payload.target = target;
        payload.raise_stop_be = raiseBe;
      }
      if (type === 'STOP_OUT' && fifoCost) payload.fifo_cost = Number(fifoCost);
      if (type === 'BUY_NEW' && entryMode === 'bracket') {
        payload.mode = 'bracket';
        payload.split = Number(split) || 50;
        payload.stop_loss = Number(bStop) || 0;
        payload.t1_price = Number(bT1) || 0;
        payload.t2_price = Number(bT2) || 0;
      }
      if ((type === 'SELL' || type === 'STOP_OUT') && held?.brackets) {
        payload.lot = lot; // shares are derived per-lot on the backend
        delete payload.shares;
      }
      const res = await api.logOrder(payload);
      onApplied(res.portfolio, ticker.toUpperCase(), type, res.toast || 'Portfolio updated');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="⚡ Log Order">
      <div className="space-y-3">
        <Field label="Order Type">
          <select className={input} value={type} onChange={(e) => setType(e.target.value as OrderType)}>
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-bg-card">
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Ticker">
            <input className={input} value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="CANA" />
          </Field>
          <Field label="Date">
            <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {isLotAware ? (
            <Field label="Lot">
              <div className="flex gap-2">
                {(['A', 'B', 'ALL'] as const).map((l) => {
                  const lotInfo = l !== 'ALL' ? held?.brackets?.lots.find((x) => x.id === l) : undefined;
                  return (
                    <button
                      key={l}
                      onClick={() => setLot(l)}
                      className={`flex-1 rounded-lg py-2 text-xs font-semibold border transition ${
                        lot === l ? 'gradient-purple text-white border-transparent' : 'border-white/15 text-txt-secondary'
                      }`}
                    >
                      {l}
                      {lotInfo ? ` · ${lotInfo.shares.toLocaleString()}sh (${lotInfo.target})` : ''}
                    </button>
                  );
                })}
              </div>
            </Field>
          ) : (
            <Field label="Shares">
              <input type="number" className={input} value={shares} onChange={(e) => setShares(e.target.value)} placeholder="125" />
            </Field>
          )}
          <Field label="Price (EGP)">
            <input type="number" step="0.01" className={input} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="38.00" />
          </Field>
        </div>

        {type === 'SELL' && (
          <Field label="Target">
            <div className="flex gap-2">
              {(['T1', 'T2'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTarget(t)}
                  className={`flex-1 rounded-lg py-2 text-sm font-semibold border transition ${
                    target === t ? 'gradient-purple text-white border-transparent' : 'border-white/15 text-txt-secondary'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>
        )}

        {type === 'SELL' && (
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" className="accent-accent-purple w-4 h-4" checked={raiseBe} onChange={(e) => setRaiseBe(e.target.checked)} />
            <span>
              Raise stop to break-even{held ? ` (${held.avg_cost})` : ' (avg cost)'}
              <span className="text-txt-secondary"> — recommended after T1</span>
            </span>
          </label>
        )}

        {type === 'STOP_OUT' && (
          <Field label="FIFO cost override (optional)">
            <input type="number" step="0.01" className={input} value={fifoCost} onChange={(e) => setFifoCost(e.target.value)} placeholder={held ? `default ${held.avg_cost}` : 'avg cost'} />
          </Field>
        )}

        {type === 'BUY_NEW' && (
          <Field label="Entry Mode">
            <div className="flex gap-2">
              {(['classic', 'bracket'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setEntryMode(m)}
                  className={`flex-1 rounded-lg py-2 text-sm font-semibold border transition capitalize ${
                    entryMode === m ? 'gradient-purple text-white border-transparent' : 'border-white/15 text-txt-secondary'
                  }`}
                >
                  {m === 'classic' ? 'Classic' : 'ThndrX Bracket'}
                </button>
              ))}
            </div>
          </Field>
        )}

        {type === 'BUY_NEW' && entryMode === 'classic' && (
          <div className="text-[11px] text-accent-cyan bg-accent-cyan/10 border border-accent-cyan/30 rounded-lg px-3 py-2">
            🧠 AI will set the stop &amp; targets from live indicators right after you log this.
          </div>
        )}

        {type === 'BUY_NEW' && entryMode === 'bracket' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Split % (Lot A)">
              <input type="number" className={input} value={split} onChange={(e) => setSplit(e.target.value)} placeholder="50" />
            </Field>
            <Field label="Stop">
              <input type="number" step="0.01" className={input} value={bStop} onChange={(e) => setBStop(e.target.value)} placeholder="36.00" />
            </Field>
            <Field label="T1">
              <input type="number" step="0.01" className={input} value={bT1} onChange={(e) => setBT1(e.target.value)} placeholder="40.00" />
            </Field>
            <Field label="T2">
              <input type="number" step="0.01" className={input} value={bT2} onChange={(e) => setBT2(e.target.value)} placeholder="42.00" />
            </Field>
          </div>
        )}

        <Field label="Notes">
          <input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="T1 filled, etc." />
        </Field>

        {held && (type === 'STOP_OUT' || type === 'SELL' || type === 'BUY_ADD') && (
          <div className="text-[11px] text-txt-secondary">
            Held: {held.shares.toLocaleString()}sh @ avg {held.avg_cost} · stop {held.stop_loss}
          </div>
        )}

        {error && <div className="text-status-red text-sm">⚠ {error}</div>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button onClick={submit} disabled={busy} className="btn-primary flex-1">
            {busy ? 'Updating…' : 'Confirm & Update'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
