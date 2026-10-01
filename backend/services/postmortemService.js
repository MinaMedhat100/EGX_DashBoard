// postmortemService.js — one closed trade → one isolated Claude call → a validated verdict.
// The AI sees STRATEGY.md (minus the P&L log), this trade's journal in real-world order, the user's
// note and the evidence block. Never other trades; never tools.
import { runClaude, extractJson, POSTMORTEM_SYSTEM } from './analystService.js';
import { orderTimeline } from './journalOrder.js';

export const POSTMORTEM_MODEL = process.env.POSTMORTEM_MODEL || 'claude-opus-5-5';
export const VERDICTS = ['process_error', 'normal_variance', 'user_deviation', 'missing_data', 'good_process'];
export const STAGES = ['entry', 'management', 'exit', 'none'];
export const CATEGORIES = ['stop_placement', 'entry_timing', 'overextension', 'fading_momentum', 'stale_catalyst',
  'market_regime', 'missing_data', 'plan_deviation', 'none'];
const THESIS_MAX = 600;

export function strategyForPostmortem(text) {
  return String(text ?? '').replace(/^## Realized P&L Log[\s\S]*?(?=^## |(?![\s\S]))/m, '');
}

function compactTrade(trade) {
  const trim = (s) => (typeof s === 'string' && s.length > THESIS_MAX ? `${s.slice(0, THESIS_MAX)}…` : s);
  const { postmortem, note, ...rest } = trade;
  return {
    ...rest,
    events: orderTimeline(trade.events ?? []).map((e) => (e.kind === 'ai_read' ? { ...e, thesis: trim(e.thesis), key_risk: trim(e.key_risk) } : e)),
  };
}

export function buildPostmortemPrompt({ strategy, trade, note, evidence }) {
  return [
    'You are reviewing ONE fully closed EGX stock trade for its owner, after the fact.',
    'Judge the DECISIONS (entry, management, exit) against the strategy and the evidence. P&L alone is',
    'not a verdict: a stopped trade can be good process and a winner can be bad process.',
    'Rules:',
    '- Every evidence bullet must cite an evidence field (e.g. entry.stop_atr) or a journal event (date + kind).',
    '- A field shown as {"unknown": …} is unknown. Do not guess it.',
    "- The owner's note is their stated reason. With no note, an unexplained deviation is \"reason unknown\", not a mistake.",
    '- If data.corporate_action is not false, the verdict must be "missing_data".',
    '- Events are listed in the order they happened; "at" is when they were saved (late saves are in process.log_lag_days).',
    '',
    '=== STRATEGY ===', strategyForPostmortem(strategy),
    '=== TRADE JOURNAL ===', JSON.stringify(compactTrade(trade)),
    "=== OWNER'S NOTE ===", note ? String(note) : '(no note)',
    '=== EVIDENCE (computed in code from daily bars) ===', JSON.stringify(evidence),
    '',
    'Reply with ONE JSON object, nothing else:',
    `{"verdict": one of ${VERDICTS.join('|')},`,
    ` "stage": one of ${STAGES.join('|')},`,
    ' "summary": "1-2 plain sentences",',
    ' "evidence": ["2-5 bullets, each citing a field or event"],',
    ' "counterfactual": "what the rules would have done differently and roughly what it changes, or \\"none\\"",',
    ` "lesson": {"category": one of ${CATEGORIES.join('|')}, "text": "one sentence", "applies_to_winners": true|false},`,
    ' "confidence": 1-5}',
  ].join('\n');
}

export function validatePostmortem(raw, evidence) {
  if (!raw || typeof raw !== 'object') throw new Error('reply is not an object');
  if (!VERDICTS.includes(raw.verdict)) throw new Error(`bad verdict: ${raw.verdict}`);
  if (!STAGES.includes(raw.stage)) throw new Error(`bad stage: ${raw.stage}`);
  const lesson = raw.lesson ?? {};
  const out = {
    verdict: raw.verdict,
    stage: raw.stage,
    summary: String(raw.summary ?? ''),
    evidence: (Array.isArray(raw.evidence) ? raw.evidence : []).map(String).slice(0, 5),
    counterfactual: String(raw.counterfactual ?? 'none'),
    lesson: {
      category: CATEGORIES.includes(lesson.category) ? lesson.category : 'none',
      text: String(lesson.text ?? ''),
      applies_to_winners: !!lesson.applies_to_winners,
    },
    confidence: Math.min(5, Math.max(1, Math.round(Number(raw.confidence) || 1))),
  };
  if (!CATEGORIES.includes(lesson.category)) out.lesson.category_raw = lesson.category ?? null;
  if (evidence?.data?.corporate_action && out.verdict !== 'missing_data') {
    out.verdict_raw = out.verdict;
    out.verdict = 'missing_data';
  }
  return out;
}

export async function analyzeTrade({ trade, evidence, strategy, note }, { run = runClaude, model = POSTMORTEM_MODEL } = {}) {
  const prompt = buildPostmortemPrompt({ strategy, trade, note, evidence });
  let cost = 0;
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await run(prompt, model, { isolated: true, systemPrompt: POSTMORTEM_SYSTEM, envelope: true });
    cost += r.cost_usd ?? 0;
    try {
      return { result: validatePostmortem(extractJson(r.text), evidence), cost_usd: Math.round(cost * 10000) / 10000, model };
    } catch (e) { lastErr = e; }
  }
  throw new Error(`the AI reply could not be read (${lastErr?.message})`);
}
