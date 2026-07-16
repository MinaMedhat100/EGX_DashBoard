import { useEffect, useState } from 'react';
import { useGold } from '../hooks/useGold';
import type { GoldUnit } from '../lib/gold';
import { GOLD_UNITS } from '../lib/gold';
import { GoldAnalysisCard } from '../components/goldx/GoldAnalysisCard';
import { ThndrWindowChip } from '../components/goldx/ThndrWindowChip';
import { GlowCard } from '../components/common/GlowCard';

export function GoldxPage() {
  const gold = useGold();
  const [unit, setUnit] = useState<GoldUnit>('oz_usd');

  useEffect(() => {
    gold.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snap = gold.state?.snapshot ?? null;

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
    </div>
  );
}
