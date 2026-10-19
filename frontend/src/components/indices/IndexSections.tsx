import type { ReactNode } from 'react';
import type { IndexAi, IndexData, IndexScenario, NewsPool } from '../../types/portfolio';
import { fmtLevel, impactMark, isLegacy, likelyLabel, newsAge, newsRows, newsState, rangeBetween, toneClass } from '../../lib/indices';

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

function ScenarioCard({ s, side, likely }: { s: IndexScenario | null; side: 'bull' | 'bear'; likely: boolean }) {
  const bull = side === 'bull';
  // full class names only: Tailwind keeps classes it can find whole in the source
  const border = likely
    ? (bull ? 'border-2 border-status-green' : 'border-2 border-status-red')
    : (bull ? 'border border-status-green/40' : 'border border-status-red/40');
  return (
    <div className={`rounded px-2 py-1.5 ${border}`}>
      <div className={`font-semibold ${bull ? 'text-status-green' : 'text-status-red'}`}>
        {bull ? '🐂 Bull case' : '🐻 Bear case'}{likely && ' ★'}
      </div>
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

function NewsBlock({ ai, pool }: { ai: IndexAi; pool: NewsPool }) {
  const state = newsState(pool, ai);
  return (
    <Block title="📰 News & catalysts">
      {state === 'legacy' && <div className="text-txt-secondary">News arrives with the next Refresh.</div>}
      {state === 'failed' && <div className="text-status-orange">News lookup failed — this read used no news.</div>}
      {state === 'empty' && <div className="text-txt-secondary">No recent headline stood out for this index.</div>}
      {state === 'rows' && (
        <ul className="space-y-1.5">
          {newsRows(ai, pool).map((r) => {
            const age = newsAge(r);
            const meta = [r.source, age].filter(Boolean).join(' · ');
            return (
              <li key={r.id}>
                <div className="flex items-baseline gap-2">
                  <span className={`text-[11px] font-bold px-1 rounded border shrink-0 ${toneClass(r.impact)}`}>{impactMark(r.impact)}</span>
                  {r.url
                    ? <a href={r.url} target="_blank" rel="noreferrer" className="text-txt-primary hover:underline">{r.headline}</a>
                    : <span className="text-txt-primary">{r.headline}</span>}
                </div>
                <div className="ml-7 text-txt-secondary">
                  {meta && <span className="text-[10px] mr-2">{meta}</span>}
                  <span className="text-txt-primary/80">{r.why}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Block>
  );
}

function LikelyHeader({ ai, zones }: { ai: IndexAi; zones: IndexData['zones'] }) {
  const label = likelyLabel(ai.likely);
  if (!label || !ai.likely) return null;
  const between = ai.likely.side === 'range' ? rangeBetween(zones || []) : null;
  return (
    <div className="mb-2">
      <div className="font-semibold">
        Likely: <span className={`px-1.5 rounded border ${toneClass(ai.likely.side === 'range' ? 'neutral' : ai.likely.side)}`}>{label}</span>
        {between && <span className="text-txt-secondary font-normal"> — {between}</span>}
      </div>
      {ai.likely.reasons.length > 0 && (
        <ul className="mt-1 ml-4 list-disc text-txt-primary/85 space-y-0.5">
          {ai.likely.reasons.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      )}
    </div>
  );
}

export function IndexSections({ d, pool }: { d: IndexData; pool?: NewsPool }) {
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

      <NewsBlock ai={ai} pool={pool} />

      <Block title="Scenarios">
        <LikelyHeader ai={ai} zones={d.zones} />
        <div className="grid sm:grid-cols-2 gap-2">
          <ScenarioCard s={ai.scenarios?.bull ?? null} side="bull" likely={ai.likely?.side === 'bull'} />
          <ScenarioCard s={ai.scenarios?.bear ?? null} side="bear" likely={ai.likely?.side === 'bear'} />
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
