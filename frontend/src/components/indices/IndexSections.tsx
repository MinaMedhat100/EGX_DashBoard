import type { ReactNode } from 'react';
import type { IndexData, IndexScenario } from '../../types/portfolio';
import { fmtLevel, isLegacy, toneClass } from '../../lib/indices';

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-txt-secondary font-semibold mb-1.5">{title}</div>
      {children}
    </section>
  );
}

function Chip({ tone, text }: { tone?: string; text: string }) {
  return <span className={`text-[11px] font-semibold px-1.5 rounded border ${toneClass(tone)}`}>{text || '—'}</span>;
}

function pctOf(a?: number | null, b?: number | null) {
  const x = a ?? 0;
  const y = b ?? 0;
  return x + y === 0 ? 50 : Math.round((x / (x + y)) * 100);
}

function ScenarioCard({ s, side }: { s: IndexScenario | null; side: 'bull' | 'bear' }) {
  const bull = side === 'bull';
  return (
    <div className={`rounded border px-2 py-1.5 ${bull ? 'border-status-green/40' : 'border-status-red/40'}`}>
      <div className={`font-semibold ${bull ? 'text-status-green' : 'text-status-red'}`}>{bull ? '🐂 Bull case' : '🐻 Bear case'}</div>
      {s ? (
        <>
          <div className="mt-0.5">
            {s.trigger ? s.trigger.charAt(0).toUpperCase() + s.trigger.slice(1) : 'Level'} <b className="font-mono">{fmtLevel(s.level)}</b>
            {s.target != null && <> → <b className="font-mono">{fmtLevel(s.target)}</b></>}
            {s.off_zone && <span className="ml-1 text-[10px] px-1 rounded border border-status-orange/50 text-status-orange">off-zone</span>}
          </div>
          {s.note && <div className="text-txt-secondary mt-0.5">{s.note}</div>}
        </>
      ) : (
        <div className="text-txt-secondary">—</div>
      )}
    </div>
  );
}

export function IndexSections({ d }: { d: IndexData }) {
  const ai = d.ai;
  if (!ai) return <div className="text-xs text-txt-secondary">AI analysis unavailable — try Refresh.</div>;
  if (isLegacy(ai)) {
    return (
      <div className="text-xs space-y-2">
        <p className="text-txt-primary/85 leading-snug">{ai.thesis}</p>
        <p className="text-txt-secondary">Refresh for the detailed read.</p>
      </div>
    );
  }
  const s = d.stats;
  return (
    <div className="space-y-3 text-xs">
      <Block title="Trend & momentum">
        <ul className="space-y-1">
          {(ai.trend_momentum || []).map((r) => (
            <li key={r.label} className="flex flex-wrap items-baseline gap-x-2">
              <span className="w-28 text-txt-secondary">{r.label}</span>
              <Chip tone={r.tone} text={r.read} />
              <span className="basis-full sm:basis-auto sm:flex-1 text-txt-primary/85">{r.detail}</span>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Breadth & sectors">
        <div className="flex h-2 rounded overflow-hidden bg-surface">
          <div className="bg-status-green" style={{ width: `${pctOf(s?.advancing, s?.declining)}%` }} />
          <div className="bg-status-red flex-1" />
        </div>
        {ai.breadth && (
          <>
            <div className="flex flex-wrap items-baseline gap-2 mt-1.5">
              <Chip tone={ai.breadth.tone} text={ai.breadth.read} />
              <span className="text-txt-primary/85">{ai.breadth.detail}</span>
            </div>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {ai.breadth.leaders.map((x) => <span key={x} className="px-1.5 rounded border border-status-green/40 text-status-green">{x.replace(/_/g, ' ')}</span>)}
              {ai.breadth.laggards.map((x) => <span key={x} className="px-1.5 rounded border border-status-red/40 text-status-red">{x.replace(/_/g, ' ')}</span>)}
            </div>
            {ai.breadth.note && <p className="mt-1.5 text-txt-primary/85">{ai.breadth.note}</p>}
          </>
        )}
      </Block>

      <Block title="Scenarios">
        <div className="grid sm:grid-cols-2 gap-2">
          <ScenarioCard s={ai.scenarios?.bull ?? null} side="bull" />
          <ScenarioCard s={ai.scenarios?.bear ?? null} side="bear" />
        </div>
      </Block>

      {ai.for_me && (
        <Block title="What it means for me">
          <dl className="space-y-1">
            {([['New entries', ai.for_me.new_entries], ['Open positions', ai.for_me.open_positions], ['Watch', ai.for_me.watch]] as const)
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="flex flex-wrap gap-x-2">
                  <dt className="w-28 text-txt-secondary">{k}</dt>
                  <dd className="flex-1 text-txt-primary/90">{v}</dd>
                </div>
              ))}
          </dl>
        </Block>
      )}
    </div>
  );
}
