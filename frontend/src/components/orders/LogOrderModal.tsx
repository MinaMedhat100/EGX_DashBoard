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
  onApplied: (portfolio: PortfolioData, toast: string) => void;
}) {
  const [type, setType] = useState<OrderType>('STOP_OUT');
  const [ticker, setTicker] = useState(initialTicker);
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [target, setTarget] = useState<'T1' | 'T2'>('T1');
  const [stopLoss, setStopLoss] = useState('');
  const [t1, setT1] = useState('');
  const [t2, setT2] = useState('');
  const [fifoCost, setFifoCost] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setStopLoss('');
      setT1('');
      setT2('');
      setFifoCost('');
      setError(null);
    }
  }, [open, initialTicker]);

  const held = positions.find((p) => p.ticker === ticker.toUpperCase());

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
      if (type === 'SELL') payload.target = target;
      if (type === 'STOP_OUT' && fifoCost) payload.fifo_cost = Number(fifoCost);
      if (type === 'BUY_NEW') {
        payload.stop_loss = Number(stopLoss) || 0;
        payload.t1_price = Number(t1) || 0;
        payload.t2_price = Number(t2) || 0;
      }
      const res = await api.logOrder(payload);
      onApplied(res.portfolio, res.toast || 'Portfolio updated');
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
          <Field label="Shares">
            <input type="number" className={input} value={shares} onChange={(e) => setShares(e.target.value)} placeholder="125" />
          </Field>
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

        {type === 'STOP_OUT' && (
          <Field label="FIFO cost override (optional)">
            <input type="number" step="0.01" className={input} value={fifoCost} onChange={(e) => setFifoCost(e.target.value)} placeholder={held ? `default ${held.avg_cost}` : 'avg cost'} />
          </Field>
        )}

        {type === 'BUY_NEW' && (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Stop">
              <input type="number" step="0.01" className={input} value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} />
            </Field>
            <Field label="T1">
              <input type="number" step="0.01" className={input} value={t1} onChange={(e) => setT1(e.target.value)} />
            </Field>
            <Field label="T2">
              <input type="number" step="0.01" className={input} value={t2} onChange={(e) => setT2(e.target.value)} />
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
