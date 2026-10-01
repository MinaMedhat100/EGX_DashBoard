// postmortem.ts — labels and formatting for the v2.7.0 post-mortem (pure; tested with node --test).
import type { JournalNote, Postmortem, PostmortemResult, PostmortemSummaryItem } from '../types/portfolio';

export type Tone = 'green' | 'yellow' | 'red' | 'grey';

export const VERDICT_LABEL: Record<PostmortemResult['verdict'], string> = {
  good_process: 'good process',
  normal_variance: 'normal variance',
  user_deviation: 'went off-plan',
  process_error: 'process error',
  missing_data: 'missing data',
};

export const STAGE_LABEL: Record<string, string> = { entry: 'entry', management: 'management', exit: 'exit', none: '—' };

export const CATEGORY_LABEL: Record<string, string> = {
  stop_placement: 'stop placement', entry_timing: 'entry timing', overextension: 'overextension',
  fading_momentum: 'fading momentum', stale_catalyst: 'stale catalyst', market_regime: 'market regime',
  missing_data: 'missing data', plan_deviation: 'plan deviation', none: 'no lesson',
};

export function verdictTone(v: PostmortemResult['verdict']): Tone {
  if (v === 'good_process' || v === 'normal_variance') return 'green';
  if (v === 'user_deviation') return 'yellow';
  if (v === 'process_error') return 'red';
  return 'grey';
}

export const TONE_CLASS: Record<Tone, string> = {
  green: 'text-status-green border-status-green/40',
  yellow: 'text-status-yellow border-status-yellow/40',
  red: 'text-status-red border-status-red/40',
  grey: 'text-txt-secondary border-border',
};

/** The History row chip; null = show the "Analyse this trade" button instead. */
export function chipText(s: PostmortemSummaryItem): { text: string; tone: Tone } | null {
  switch (s.status) {
    case 'done': return s.verdict ? { text: VERDICT_LABEL[s.verdict], tone: verdictTone(s.verdict) } : null;
    case 'running': return { text: 'running…', tone: 'grey' };
    case 'failed': return { text: 'post-mortem failed', tone: 'grey' };
    case 'no_bars': return { text: 'no price history', tone: 'grey' };
    case 'waiting': return { text: `due ~${s.due_estimate ? s.due_estimate.slice(5) : 'soon'}`, tone: 'grey' };
    default: return s.auto ? { text: `due ~${s.due_estimate ? s.due_estimate.slice(5) : 'soon'}`, tone: 'grey' } : null;
  }
}

const LABELS: Record<string, string> = {
  'entry.price': 'Entry price', 'entry.atr': 'ATR at entry', 'entry.stop_atr': 'Stop distance (ATR)',
  'entry.stop_atr_from_fill': 'Stop distance from the stop-out fill (ATR)',
  'entry.ema20_atr': 'Entry above EMA20 (ATR)', 'entry.card_age_days': 'Card age at entry (days)',
  'held.sessions_held': 'Sessions held', 'held.mae_pct': 'Worst drop while held (%)', 'held.mae_atr': 'Worst drop (ATR)',
  'held.mfe_pct': 'Best gain while held (%)', 'held.mfe_atr': 'Best gain (ATR)',
  'held.t1_touched': 'T1 touched', 'held.t2_touched': 'T2 touched',
  'after.recovered_to_entry': 'Came back to entry', 'after.sessions_to_recover': 'Sessions to come back',
  'after.max_gain_after_pct': 'Best gain in 10 sessions after exit (%)', 'after.move_after_pct': 'Move in 10 sessions after exit (%)',
  'after.market_move_after_pct': 'Market move, same window (%)',
  'process.log_lag_days': 'Orders logged late', 'process.reads_after_close': 'AI reads after the close',
  'process.levels_changes': 'Level changes by source', 'process.last_stop_vs_ai': 'Last stop vs AI suggestion',
  'data.fills_validated': 'Fills checked against bars', 'data.corporate_action': 'Corporate action', 'data.bars_through': 'Bars through',
};
const GROUP: Record<string, string> = { entry: 'Entry', held: 'While held', after: 'After the exit', process: 'Process', data: 'Data' };

const isUnknown = (v: unknown): v is { unknown: string } => !!v && typeof v === 'object' && 'unknown' in (v as object);

function show(v: unknown): string {
  if (isUnknown(v)) return `unknown — ${v.unknown}`;
  if (v === true) return 'yes';
  if (v === false) return 'no';
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === 'object' ? Object.values(x as object).join(' ') : String(x))).join('; ') : 'none';
  if (v && typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k} ${typeof x === 'object' ? JSON.stringify(x) : x}`).join(' · ');
  return String(v);
}

export function evidenceLines(ev: Record<string, unknown> | undefined): string[] {
  if (!ev) return [];
  const out: string[] = [];
  for (const [group, body] of Object.entries(ev)) {
    if (isUnknown(body)) { out.push(`${GROUP[group] ?? group}: unknown — ${body.unknown}`); continue; }
    for (const [k, v] of Object.entries((body ?? {}) as Record<string, unknown>)) {
      out.push(`${LABELS[`${group}.${k}`] ?? `${group}.${k}`}: ${show(v)}`);
    }
  }
  return out;
}

export function noteNewerThanRun(note: JournalNote | undefined, pm: Postmortem | undefined): boolean {
  return !!note && !!pm?.ran_at && note.at > pm.ran_at;
}
