import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { LessonCategory, LessonRow, LessonsResponse } from '../types/portfolio';
import { GlowCard } from '../components/common/GlowCard';
import { CATEGORY_LABEL, VERDICT_LABEL, STAGE_LABEL, verdictTone, TONE_CLASS } from '../lib/postmortem';
import { coverageText, problemSummary, backlogText, noiseSummary } from '../lib/lessons';
import { fmtEgp } from '../lib/format';

function Row({ r, muted = false }: { r: LessonRow; muted?: boolean }) {
  return (
    <li className={`flex flex-wrap gap-x-2 items-baseline ${muted ? 'text-txt-secondary' : ''}`}>
      <span className="font-semibold w-14">{r.ticker}</span>
      <span className="text-txt-secondary w-24">{r.closed_at ?? '—'}</span>
      <span className={`px-1.5 rounded border text-[11px] ${TONE_CLASS[verdictTone(r.verdict)]}`}>{VERDICT_LABEL[r.verdict]} · {STAGE_LABEL[r.stage] ?? r.stage}</span>
      <span className={`font-mono w-28 text-right ${r.pnl != null && r.pnl < 0 ? 'text-status-red' : 'text-status-green'}`}>{r.pnl != null ? fmtEgp(r.pnl) : '—'}</span>
      <span className="basis-full ml-14 text-[12px]">{r.lesson}</span>
    </li>
  );
}

function CategoryBlock({ c, flagAt, open: startOpen }: { c: LessonCategory; flagAt: number; open: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const stages = Object.entries(c.stages).filter(([, n]) => n > 0).map(([s, n]) => `${STAGE_LABEL[s] ?? s} ${n}`).join(' · ');
  return (
    <div className={`rounded-lg px-4 py-3 border ${c.flagged ? 'border-status-red/40 bg-status-red/5' : 'border-border'}`}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex flex-wrap items-baseline gap-x-3 text-left">
        <span className="font-bold">{c.flagged ? '⚑ ' : ''}{CATEGORY_LABEL[c.category] ?? c.category}</span>
        <span className={c.flagged ? 'text-status-red' : 'text-txt-secondary'}>{problemSummary(c)} · flag at {flagAt}</span>
        {stages && <span className="text-txt-secondary text-[12px]">{stages}</span>}
        {c.also_seen.length > 0 && <span className="text-txt-secondary text-[12px]">· also seen {c.also_seen.length}×, no harm</span>}
        <span className="ml-auto text-txt-secondary">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-sm">
          {c.problems.length > 0 && <ul className="space-y-1.5">{c.problems.map((r) => <Row key={r.trade_id} r={r} />)}</ul>}
          {c.also_seen.length > 0 && (
            <>
              <div className="text-[11px] uppercase text-txt-secondary pt-1">Also seen, no harm</div>
              <ul className="space-y-1.5">{c.also_seen.map((r) => <Row key={r.trade_id} r={r} muted />)}</ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function LessonsPage() {
  const [data, setData] = useState<LessonsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const load = useCallback(() => {
    api.getLessons().then((r) => { setData(r); setError(null); }).catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!data?.backlog.running) return;
    timer.current = window.setInterval(load, 5000);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [data?.backlog.running, load]);

  const start = async () => {
    if (!data) return;
    const cost = (data.remaining * data.cost_hint_usd).toFixed(2);
    if (!window.confirm(`Review ${data.remaining} rebuilt trades: about $${cost} with ${data.model}, one at a time. Continue?`)) return;
    try { await api.analyseRemaining(); } catch (e) { setError((e as Error).message); }
    load();
  };

  if (error && !data) return <div className="text-status-red">Lessons unavailable ({error}).</div>;
  if (!data) return <div className="text-txt-secondary">Loading lessons…</div>;
  const flagged = data.categories.filter((c) => c.flagged);
  const rest = data.categories.filter((c) => !c.flagged);
  const bl = backlogText(data.backlog);
  const noise = data.measured.stop_inside_noise;

  return (
    <div className="space-y-5">
      <GlowCard className="px-5 py-3 flex flex-wrap items-center gap-3">
        <span className="text-sm">{coverageText(data.coverage)}</span>
        {data.remaining > 0 && !data.backlog.running && (
          <button onClick={start} className="ml-auto text-sm text-accent-purple-lt hover:text-txt-primary">
            Analyse remaining ({data.remaining}) ≈ ${(data.remaining * data.cost_hint_usd).toFixed(2)}
          </button>
        )}
        {bl && <span className={`basis-full text-[12px] ${data.backlog.error ? 'text-status-red' : 'text-txt-secondary'}`}>{bl}</span>}
        {error && <span className="basis-full text-[12px] text-status-red">{error}</span>}
      </GlowCard>

      <GlowCard className="p-4 space-y-3">
        <h3 className="font-bold">Repeating ({flagged.length})</h3>
        {flagged.length
          ? flagged.map((c) => <CategoryBlock key={c.category} c={c} flagAt={data.flag_at} open />)
          : <div className="text-sm text-txt-secondary">No lesson has repeated {data.flag_at} times yet.</div>}
      </GlowCard>

      {rest.length > 0 && (
        <GlowCard className="p-4 space-y-2">
          <h3 className="font-bold">Not yet repeating</h3>
          {rest.map((c) => <CategoryBlock key={c.category} c={c} flagAt={data.flag_at} open={false} />)}
        </GlowCard>
      )}

      <GlowCard className="p-4 space-y-2">
        <h3 className="font-bold">Measured: stops inside noise</h3>
        <div className="text-sm">{noiseSummary(noise)}</div>
        {noise.trades.length > 0 && (
          <ul className="text-sm space-y-0.5 font-mono">
            {noise.trades.map((t) => (
              <li key={t.trade_id}>
                {t.ticker.padEnd(6)} stop {t.stop_atr.toFixed(2)}× ATR · {t.recovered ? `came back in ${t.sessions ?? '?'} session${t.sessions === 1 ? '' : 's'}` : 'did not come back'}
              </li>
            ))}
          </ul>
        )}
      </GlowCard>

      <div className="text-[12px] text-txt-secondary">Flags are for you to act on — nothing changes automatically.</div>
    </div>
  );
}
