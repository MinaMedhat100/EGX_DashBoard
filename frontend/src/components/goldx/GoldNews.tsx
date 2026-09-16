import { useEffect, useState } from 'react';
import type { NewsItem } from '../../types/portfolio';
import { api } from '../../api/client';
import { fmtNewsTime } from '../../lib/format';

export function GoldNews() {
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api
      .news('gold')
      .then((r) => {
        if (!active) return;
        setNews(r.items);
        setError(r.error ?? null);
      })
      .catch(() => {
        if (!active) return;
        setNews([]);
        setError('news lookup failed');
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-txt-secondary mb-1.5">Gold news</div>
      {loading && <div className="text-txt-secondary text-xs">Loading…</div>}
      {!loading && news && news.length === 0 && (
        <div className="text-txt-secondary text-xs">
          {error ? `⚠ News lookup failed — ${error}` : 'No recent headlines.'}
        </div>
      )}
      <ul className="space-y-1.5">
        {(news ?? []).map((n, i) => (
          <li key={i} className="text-xs leading-snug">
            <a href={n.url ?? '#'} target="_blank" rel="noreferrer" className="text-txt-primary hover:text-accent-cyan transition">
              {n.headline}
            </a>
            {n.time && <span className="text-txt-secondary ml-1">· {fmtNewsTime(n.time)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
