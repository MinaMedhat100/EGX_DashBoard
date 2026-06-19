import { useEffect, useState } from 'react';
import type { AiAnalysis, NewsItem, Position } from '../../types/portfolio';
import { api } from '../../api/client';
import { Gauge, DiGauge } from '../common/Gauge';
import { fmtNum, fmtNewsTime } from '../../lib/format';

const REC_COLOR: Record<string, string> = {
  EXIT: '#ef4444',
  TRIM: '#f97316',
  HOLD: '#eab308',
  ADD: '#22c55e',
  WATCH: '#a855f7',
};

function AiBlock({ ai }: { ai: AiAnalysis }) {
  const color = REC_COLOR[ai.recommendation] ?? '#a855f7';
  const hasLevels = ai.suggested_stop || ai.suggested_t1 || ai.suggested_t2;
  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.3)' }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded gradient-purple text-white">AI</span>
        <span className="font-bold" style={{ color }}>{ai.recommendation}</span>
        <span className="text-txt-secondary text-xs">conviction {ai.conviction}/5</span>
        {ai.model && <span className="ml-auto text-[10px] text-txt-secondary uppercase">{ai.model}</span>}
      </div>
      <p className="text-txt-primary leading-snug">{ai.thesis}</p>
      {ai.key_risk && <p className="text-xs text-status-orange mt-1.5">⚠ {ai.key_risk}</p>}
      {ai.action_line && <p className="text-xs text-accent-cyan mt-1.5 font-medium">→ {ai.action_line}</p>}
      {hasLevels && (
        <div className="flex gap-4 mt-2 text-xs font-mono">
          <span className="text-status-red">stop {fmtNum(ai.suggested_stop)}</span>
          <span className="text-status-orange">T1 {fmtNum(ai.suggested_t1)}</span>
          <span className="text-status-green">T2 {fmtNum(ai.suggested_t2)}</span>
          <span className="ml-auto text-[10px] text-txt-secondary">AI-suggested</span>
        </div>
      )}
    </div>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  if (!body) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-txt-secondary mb-1">{title}</div>
      <p className="font-mono text-[12px] leading-relaxed text-txt-primary/90 whitespace-pre-wrap">{body}</p>
    </div>
  );
}

export function AnalysisPanel({ p }: { p: Position }) {
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setNewsLoading(true);
    api
      .news(p.ticker)
      .then((r) => active && setNews(r.items))
      .catch(() => active && setNews([]))
      .finally(() => active && setNewsLoading(false));
    return () => {
      active = false;
    };
  }, [p.ticker]);

  return (
    <div className="mt-3 pt-3 border-t border-white/10 animate-fade-in space-y-4 text-sm">
      {p.ai && <AiBlock ai={p.ai} />}

      {p.is_liquid && p.adx != null && (
        <div className="grid grid-cols-1 gap-2.5">
          <Gauge label="ADX · trend strength" value={p.adx} thresholds={[25, 40]} color="#a855f7" />
          <Gauge label="RSI (14)" value={p.rsi} thresholds={[30, 70]} color="#06b6d4" />
          <DiGauge plusDi={p.plus_di} minusDi={p.minus_di} />
        </div>
      )}

      <Section title="Analysis notes" body={p.analysis_notes} />
      <Section title="Add / re-entry zone" body={p.add_zone} />
      <Section title="Exit plan" body={p.sell_plan} />

      <div>
        <div className="text-[11px] uppercase tracking-wide text-txt-secondary mb-1.5">Latest news</div>
        {newsLoading && <div className="text-txt-secondary text-xs">Loading…</div>}
        {!newsLoading && news && news.length === 0 && (
          <div className="text-txt-secondary text-xs">No recent headlines.</div>
        )}
        <ul className="space-y-1.5">
          {(news ?? []).map((n, i) => (
            <li key={i} className="text-xs leading-snug">
              <a
                href={n.url ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="text-txt-primary hover:text-accent-cyan transition"
              >
                {n.headline}
              </a>
              {n.time && <span className="text-txt-secondary ml-1">· {fmtNewsTime(n.time)}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
