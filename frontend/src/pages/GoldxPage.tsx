import { useEffect, useState } from 'react';
import { useGold } from '../hooks/useGold';
import type { GoldUnit } from '../lib/gold';
import { GOLD_UNITS } from '../lib/gold';
import { GoldAnalysisCard } from '../components/goldx/GoldAnalysisCard';
import { ThndrWindowChip } from '../components/goldx/ThndrWindowChip';
import { GoldNews } from '../components/goldx/GoldNews';
import { GoldPositionCard } from '../components/goldx/GoldPositionCard';
import { LogGoldTradeModal } from '../components/goldx/LogGoldTradeModal';
import { GlowCard } from '../components/common/GlowCard';
import { useToast } from '../components/common/Toast';

export function GoldxPage() {
  const gold = useGold();
  const [unit, setUnit] = useState<GoldUnit>('oz_usd');
  const toast = useToast();
  const [modal, setModal] = useState(false);

  useEffect(() => {
    gold.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snap = gold.state?.snapshot ?? null;
  const pos = gold.state?.position ?? null;

  const onSubmitOrder = async (payload: Record<string, unknown>) => {
    const r = await gold.logOrder(payload);
    (r.toasts ?? []).forEach((t) => toast(t, 'success'));
    // BUY_NEW opens a pending position → analyze to auto-set AI levels (v1.3.0 pattern)
    if (payload.type === 'BUY_NEW') { toast('Setting AI levels…', 'success'); gold.analyze(); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {GOLD_UNITS.map((u) => (
            <button
              key={u.key}
              onClick={() => setUnit(u.key)}
              className={`text-xs px-2.5 py-1 rounded-lg border ${unit === u.key ? 'gradient-purple text-white border-transparent' : 'bg-white/5 border-white/10 text-txt-secondary'}`}
            >
              {u.label}
            </button>
          ))}
          <ThndrWindowChip />
        </div>
        <div className="flex items-center gap-3">
          {snap && <span className="text-xs text-txt-secondary">Analyzed {new Date(snap.timestamp).toLocaleString('en-GB')}</span>}
          <button onClick={gold.analyze} disabled={gold.busy} className="btn-primary min-w-[170px]">
            {gold.busy ? '🧠 Analyzing gold…' : '🔍 Analyze Gold'}
          </button>
        </div>
      </div>

      {gold.error && <div className="text-status-red text-sm">⚠ {gold.error}</div>}

      {!snap && !gold.busy && (
        <GlowCard className="p-8 text-center text-txt-secondary">
          Hit <span className="text-accent-cyan font-semibold">Analyze Gold</span> for an AI read on gold (PAXG) with entry levels.
        </GlowCard>
      )}

      {snap && <GoldAnalysisCard snap={snap} unit={unit} />}

      {pos && (
        <GoldPositionCard
          p={pos}
          unit={unit}
          usdEgp={snap?.usd_egp ?? null}
          onLog={() => setModal(true)}
        />
      )}

      {!pos && snap && (
        <button onClick={() => setModal(true)} className="btn-ghost">⚡ Log a gold buy</button>
      )}

      <LogGoldTradeModal open={modal} hasPosition={!!pos} onClose={() => setModal(false)} onSubmit={onSubmitOrder} />

      <GlowCard className="p-4"><GoldNews /></GlowCard>
    </div>
  );
}
