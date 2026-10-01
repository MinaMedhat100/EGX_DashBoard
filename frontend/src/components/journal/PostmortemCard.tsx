import { useState } from 'react';
import type { JournalNote, Postmortem } from '../../types/portfolio';
import { VERDICT_LABEL, STAGE_LABEL, CATEGORY_LABEL, verdictTone, TONE_CLASS, evidenceLines, noteNewerThanRun } from '../../lib/postmortem';

export function PostmortemCard({ pm, note, canRun, costHint, model, onRun, running, error }: {
  pm?: Postmortem; note?: JournalNote; canRun: boolean; costHint: number | null; model: string | null;
  onRun: () => void; running: boolean; error: string | null;
}) {
  const [showEv, setShowEv] = useState(false);
  const r = pm?.status === 'done' ? pm.result : undefined;
  const runLabel = r ? 'Re-run' : 'Analyse this trade';
  const cost = costHint != null ? `≈ $${costHint.toFixed(2)}${model ? ` with ${model}` : ''}` : '';
  const ask = () => { if (window.confirm(`${runLabel}: one AI call, ${cost}. Continue?`)) onRun(); };

  return (
    <div className="mt-2 pt-2 border-t border-border space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">Post-mortem</span>
        {r && (
          <span className={`px-1.5 rounded border ${TONE_CLASS[verdictTone(r.verdict)]}`}>
            {VERDICT_LABEL[r.verdict]} · {STAGE_LABEL[r.stage]}
          </span>
        )}
        {r && <span className="text-txt-secondary">confidence {r.confidence}/5</span>}
        {pm?.status === 'waiting' && <span className="text-txt-secondary">due ~{pm.due_estimate ?? 'soon'} (needs 10 sessions after the exit)</span>}
        {pm?.status === 'failed' && <span className="text-status-red">failed: {pm.error}</span>}
        {pm?.status === 'no_bars' && <span className="text-txt-secondary">no Yahoo price history for this ticker</span>}
        {(running || pm?.status === 'running') && <span className="text-txt-secondary">running…</span>}
        {canRun && !running && pm?.status !== 'running' && (
          <button onClick={ask} className="ml-auto text-accent-purple-lt hover:text-txt-primary">{runLabel} <span className="text-txt-secondary">{cost}</span></button>
        )}
      </div>
      {error && <div className="text-status-yellow">{error}</div>}
      {noteNewerThanRun(note, pm) && <div className="text-status-yellow">Note added after the post-mortem — re-run?</div>}
      {r && (
        <>
          <div className="whitespace-pre-wrap">{r.summary}</div>
          <ul className="list-disc ml-5 text-txt-secondary">{r.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
          <div><span className="text-txt-secondary">Rules would have:</span> {r.counterfactual}</div>
          <div>
            <span className="px-1.5 rounded border border-border text-txt-secondary mr-1">{CATEGORY_LABEL[r.lesson.category] ?? r.lesson.category}</span>
            {r.lesson.text}
          </div>
          <button onClick={() => setShowEv((s) => !s)} className="text-txt-secondary hover:text-txt-primary">
            {showEv ? '▾' : '▸'} Evidence used
          </button>
          {showEv && <ul className="ml-5 text-txt-secondary">{evidenceLines(pm?.evidence).map((l, i) => <li key={i}>{l}</li>)}</ul>}
        </>
      )}
    </div>
  );
}
