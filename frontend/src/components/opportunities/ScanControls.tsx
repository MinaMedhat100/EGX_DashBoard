import type { ScanParams } from '../../hooks/useScan';
import { GlowCard } from '../common/GlowCard';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-txt-secondary">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'w-20 bg-bg-card border border-white/15 rounded-lg px-2.5 py-1.5 text-sm font-mono focus:border-accent-cyan focus:outline-none';

export function ScanControls({
  params,
  setParams,
  onRun,
  busy,
  phase,
}: {
  params: ScanParams;
  setParams: (fn: (p: ScanParams) => ScanParams) => void;
  onRun: () => void;
  busy: boolean;
  phase: 'idle' | 'scanning' | 'analyzing';
}) {
  const num = (k: keyof ScanParams) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setParams((p) => ({ ...p, [k]: Number(e.target.value) }));

  const btnLabel = !busy
    ? '🔍 Run Scan'
    : phase === 'analyzing'
      ? '🧠 AI analyzing…'
      : '🔍 Scanning market…';

  return (
    <GlowCard className="p-4">
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Min ADX">
          <input type="number" className={inputCls} value={params.min_adx} onChange={num('min_adx')} />
        </Field>
        <Field label="Min +DI gap">
          <input type="number" className={inputCls} value={params.min_di_gap} onChange={num('min_di_gap')} />
        </Field>
        <Field label="RSI min">
          <input type="number" className={inputCls} value={params.rsi_min} onChange={num('rsi_min')} />
        </Field>
        <Field label="RSI max">
          <input type="number" className={inputCls} value={params.rsi_max} onChange={num('rsi_max')} />
        </Field>
        <button onClick={onRun} disabled={busy} className="btn-cyan ml-auto min-w-[170px]">
          {busy && <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin mr-2 align-[-1px]" />}
          {btnLabel}
        </button>
      </div>
    </GlowCard>
  );
}
