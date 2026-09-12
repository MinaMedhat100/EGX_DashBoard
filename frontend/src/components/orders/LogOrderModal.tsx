import { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { api } from '../../api/client';
import type { PortfolioData, Position, OrderPrefill } from '../../types/portfolio';

type OrderType = 'STOP_OUT' | 'SELL' | 'BUY_NEW' | 'BUY_ADD';

const TYPE_OPTIONS: { value: OrderType; label: string }[] = [
  { value: 'STOP_OUT', label: 'STOP-OUT' },
  { value: 'SELL', label: 'SELL (T1 / T2)' },
  { value: 'BUY_NEW', label: 'BUY (new position)' },
  { value: 'BUY_ADD', label: 'BUY (add to position)' },
];

const input =
  'w-full bg-bg-card border border-border-strong rounded-lg px-3 py-2 text-sm focus:border-accent-cyan focus:outline-none';
const today = () => new Date().toISOString().slice(0, 10);

/**
 * The resting stop a STOP-OUT would have filled at, used to pre-fill Price: a classic position's
 * stop, or the chosen lot's stop on a bracket (ALL = the lowest stop among the lots still open,
 * which is the shared stop whenever they agree). null when there is no live stop to offer.
 */
function stopFor(p: Position | undefined, lot: 'A' | 'B' | 'ALL'): number | null {
  if (!p) return null;
  if (p.brackets) {
    const open = p.brackets.lots.filter((l) => !l.tp_hit && !l.stopped && l.stop > 0);
    if (lot !== 'ALL') return open.find((l) => l.id === lot)?.stop ?? null;
    return open.length ? Math.min(...open.map((l) => l.stop)) : null;
  }
  return p.stop_loss > 0 ? p.stop_loss : null;
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block${className ? ` ${className}` : ''}`}>
      <span className="text-[11px] uppercase tracking-wide text-txt-secondary">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function LogOrderModal({
  open,
  onClose,
  initialTicker,
  prefill,
  positions,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  initialTicker: string;
  prefill?: OrderPrefill;
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
  // true while Price holds an auto-filled stop rather than something the user typed
  const [priceAuto, setPriceAuto] = useState(false);

  // Prefill from the originating card / reset when opened.
  useEffect(() => {
    if (open) {
      const initialType: OrderType = initialTicker ? 'STOP_OUT' : 'BUY_NEW';
      setTicker(initialTicker);
      setType(initialType);
      setShares('');
      // a STOP-OUT from a held position's card opens with that position's resting stop as Price
      const stop =
        initialType === 'STOP_OUT'
          ? stopFor(positions.find((p) => p.ticker === initialTicker.toUpperCase()), 'A')
          : null;
      setPrice(stop != null ? String(stop) : '');
      setPriceAuto(stop != null);
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
      // Prefill from an opportunity card (bracket by default; classic seeds only price).
      if (prefill) {
        setType('BUY_NEW');
        setEntryMode(prefill.entryMode);
        setPrice(prefill.price != null ? String(prefill.price) : '');
        setPriceAuto(false);
        if (prefill.split != null) setSplit(String(prefill.split));
        if (prefill.stop != null) setBStop(String(prefill.stop));
        if (prefill.t1 != null) setBT1(String(prefill.t1));
        if (prefill.t2 != null) setBT2(String(prefill.t2));
      }
    }
    // positions is read at open time only: re-running on a portfolio update would wipe the form
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTicker, prefill]);

  const held = positions.find((p) => p.ticker === ticker.toUpperCase());

  // Keep an auto-filled stop in step with type / ticker / lot changes, but never overwrite a price
  // the user typed. Leaving STOP-OUT clears an auto-filled stop so a SELL can't inherit it.
  const syncAutoStop = (nextType: OrderType, nextTicker: string, nextLot: 'A' | 'B' | 'ALL') => {
    const stop =
      nextType === 'STOP_OUT'
        ? stopFor(positions.find((p) => p.ticker === nextTicker.toUpperCase()), nextLot)
        : null;
    if (stop != null) {
      if (priceAuto || price === '') {
        setPrice(String(stop));
        setPriceAuto(true);
      }
    } else if (priceAuto) {
      setPrice('');
      setPriceAuto(false);
    }
  };
  const isLotAware = (type === 'SELL' || type === 'STOP_OUT') && !!held?.brackets;
  const addBlocked = type === 'BUY_ADD' && !!held?.brackets;

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
        // For a bracket, the lot encodes the target (A→T1, B→T2), so the backend
        // ignores `target`; only send it for a classic SELL.
        if (!held?.brackets) payload.target = target;
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
          <select
            className={input}
            value={type}
            onChange={(e) => {
              const next = e.target.value as OrderType;
              setType(next);
              syncAutoStop(next, ticker, lot);
            }}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-bg-card">
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Ticker">
            <input
              className={input}
              value={ticker}
              onChange={(e) => {
                const next = e.target.value.toUpperCase();
                setTicker(next);
                syncAutoStop(type, next, lot);
              }}
              placeholder="CANA"
            />
          </Field>
          <Field label="Date">
            <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {isLotAware ? (
            <Field label="Lot" className="col-span-2">
              <div className="flex gap-2">
                {(['A', 'B', 'ALL'] as const).map((l) => {
                  const lotInfo = l !== 'ALL' ? held?.brackets?.lots.find((x) => x.id === l) : undefined;
                  return (
                    <button
                      key={l}
                      onClick={() => {
                        setLot(l);
                        syncAutoStop(type, ticker, l);
                      }}
                      className={`flex-1 rounded-lg py-2 text-xs font-semibold border transition ${
                        lot === l ? 'gradient-purple text-white border-transparent' : 'border-border-strong text-txt-secondary'
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
          <Field label={priceAuto ? 'Price (EGP) · current stop' : 'Price (EGP)'}>
            <input
              type="number"
              step="0.01"
              className={input}
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                setPriceAuto(false);
              }}
              placeholder="38.00"
            />
          </Field>
        </div>

        {type === 'SELL' && !isLotAware && (
          <Field label="Target">
            <div className="flex gap-2">
              {(['T1', 'T2'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTarget(t)}
                  className={`flex-1 rounded-lg py-2 text-sm font-semibold border transition ${
                    target === t ? 'gradient-purple text-white border-transparent' : 'border-border-strong text-txt-secondary'
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
                    entryMode === m ? 'gradient-purple text-white border-transparent' : 'border-border-strong text-txt-secondary'
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

        {addBlocked && (
          <div className="text-[11px] text-status-yellow bg-status-yellow/10 border border-status-yellow/30 rounded-lg px-3 py-2">
            {ticker.toUpperCase()} is a ThndrX bracket — its lots are set at entry, so adding to it isn't
            supported. Open a separate position/bracket instead.
          </div>
        )}

        {error && <div className="text-status-red text-sm">⚠ {error}</div>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button onClick={submit} disabled={busy || addBlocked} className="btn-primary flex-1">
            {busy ? 'Updating…' : 'Confirm & Update'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
