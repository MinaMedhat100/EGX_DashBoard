// analystService.js — the AI layer. Spawns headless `claude -p` (no tools, pure reasoning),
// hands it already-fetched data + STRATEGY.md, parses strict JSON back.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STRATEGY_FILE = path.join(__dirname, '..', '..', 'STRATEGY.md');

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
export const DEFAULT_MODEL = process.env.ANALYSIS_MODEL || 'claude-opus-5';
const TIMEOUT_MS = Number(process.env.ANALYSIS_TIMEOUT_MS || 240000);

let _strategyCache = null;
async function strategyText() {
  if (_strategyCache == null) {
    try { _strategyCache = await readFile(STRATEGY_FILE, 'utf-8'); }
    catch { _strategyCache = ''; }
  }
  return _strategyCache;
}

// Run headless claude, prompt via stdin, return the model's text output.
function runClaude(prompt, model = DEFAULT_MODEL) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      CLAUDE_BIN,
      ['-p', '--output-format', 'json', '--model', model, '--permission-mode', 'bypassPermissions'],
      { windowsHide: true },
    );
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('claude analysis timed out')); }, TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(new Error(`spawn claude failed: ${e.message}`)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`claude exit ${code}: ${(err || out).slice(0, 300)}`));
      try {
        const env = JSON.parse(out);
        if (env.is_error) return reject(new Error(`claude reported error: ${env.result}`));
        resolve(env.result ?? '');
      } catch {
        reject(new Error(`bad claude envelope: ${out.slice(0, 200)}`));
      }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// Pull a JSON object/array out of model text (handles ``` fences and stray prose).
function extractJson(text) {
  if (!text) throw new Error('empty model output');
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const candidates = ['{', '['].map((c) => t.indexOf(c)).filter((i) => i >= 0);
  if (!candidates.length) throw new Error('no JSON found in model output');
  const start = Math.min(...candidates);
  const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  return JSON.parse(t.slice(start, end + 1));
}

// ── portfolio analysis ───────────────────────────────────────────────────────
function positionPhase(p) {
  if (p.t2_hit) return 'runner_post_t2';
  if (p.t1_hit) return 'runner_post_t1';
  return 'initial';
}

const r2 = (n) => Math.round(n * 100) / 100;

// R-multiple framing: 1R = entry(avg) - stop. Live P&L and targets expressed in R.
export function riskR(p) {
  if (!p.stop_loss || p.stop_loss <= 0) return null;
  const risk = p.avg_cost - p.stop_loss;
  if (!risk || risk <= 0 || !p.live_price) return null;
  return {
    one_R_egp: r2(risk),
    live_R: r2((p.live_price - p.avg_cost) / risk),
    stop_R: r2((p.live_price - p.stop_loss) / risk),
    t1_R: p.t1_price > 0 ? r2((p.t1_price - p.avg_cost) / risk) : null,
    t2_R: p.t2_price > 0 ? r2((p.t2_price - p.avg_cost) / risk) : null,
  };
}

// Shared MARKET REGIME lines for the portfolio + opportunity prompts.
function regimeLines(regime) {
  if (!regime || regime.stale || !regime.regime) {
    return ['=== MARKET REGIME ===', 'Unknown (Indices not refreshed recently) — do not assume a regime.', ''];
  }
  return [
    '=== MARKET REGIME ===',
    `Regime (as of ${regime.as_of}): ${regime.regime} — ${regime.summary}`,
    'In Risk-Off favor defense / raise the entry bar; in Risk-On you may be more constructive.',
    '',
  ];
}

const priorAiSlim = (ai) => (ai ? {
  recommendation: ai.recommendation, conviction: ai.conviction, thesis: ai.thesis,
  key_risk: ai.key_risk, suggested_stop: ai.suggested_stop, suggested_t1: ai.suggested_t1,
  suggested_t2: ai.suggested_t2, analyzed_at: ai.analyzed_at,
} : null);

export function portfolioPrompt(positions, strategy, context = {}) {
  const slim = positions.map((p) => ({
    ticker: p.ticker, avg_cost: p.avg_cost, shares: p.shares, live_price: p.live_price,
    stop_loss: p.stop_loss, t1_price: p.t1_price, t2_price: p.t2_price,
    position_label: p.position_label, is_liquid: p.is_liquid, status_key: p.status_key,
    unrealized_pnl: p.unrealized_pnl, unrealized_pct: p.unrealized_pct,
    phase: positionPhase(p),
    risk_R: riskR(p),
    mtf: p.mtf ?? null,
    t1_hit: !!p.t1_hit, t2_hit: !!p.t2_hit, stop_raised: !!p.stop_raised,
    t1_fill_price: p.t1_fill_price ?? null, t2_fill_price: p.t2_fill_price ?? null,
    news: (context.news && context.news[p.ticker]) || [],
    prior_ai: priorAiSlim(p.ai),
    live: p.indicators || {
      price: p.live_price, adx: p.adx, plus_di: p.plus_di, minus_di: p.minus_di,
      rsi: p.rsi, macd_histogram: p.macd_histogram, ema20: p.ema20, ema50: p.ema50,
      bb_upper: p.bb_upper, bb_lower: p.bb_lower, tv_signal: p.tv_signal,
    },
  }));
  return [
    'You are an expert Egyptian Exchange (EGX) swing-trading analyst. Apply the trader\'s OWN',
    'strategy (below) strictly to the live data and return STRICT JSON only — no prose, no markdown.',
    '',
    '=== STRATEGY ===', strategy,
    '',
    '=== CURRENT POSITIONS (live indicators) ===',
    JSON.stringify(slim, null, 1),
    '',
    ...(context.book_stats
      ? ['=== BOOK STATS (deterministic — cite these numbers) ===', JSON.stringify(context.book_stats), '']
      : []),
    ...regimeLines(context.regime),
    'For EACH position output one analysis object. Respond with ONLY this JSON shape:',
    '{"analyses":[{',
    '  "ticker": "CANA",',
    '  "recommendation": "HOLD|TRIM|EXIT|ADD|WATCH",',
    '  "conviction": 1-5,',
    '  "thesis": "2-3 sentences citing the ACTUAL indicator values and what the strategy says",',
    '  "key_risk": "one short line",',
    '  "suggested_stop": number, "suggested_t1": number, "suggested_t2": number,',
    '  "action_line": "short imperative, e.g. \'Switch to limit sell 125sh @ 38.00\'",',
    '  "vs_prior": "unchanged|changed", "change_reason": "short line or empty",',
    '  "catalyst": "one line on the driving headline from news, or empty"',
    '}],',
    '  "book": {',
    '    "posture": "overall book stance given regime + open risk + holdings, one line",',
    '    "concentration": "AI-inferred sector read, e.g. 55% real-estate (TMGH/OCDI/CLHO) heavy",',
    '    "clusters": ["names that move together, e.g. TMGH+OCDI EGX real-estate beta"],',
    '    "strongest": {"ticker": "X", "why": "one line"},',
    '    "weakest": {"ticker": "Y", "why": "one line"},',
    '    "risk_note": "one line on open_risk_egp + any unprotected names"',
    '  }',
    '}',
    '',
    'Rules: suggested_stop just below structural support (EMA50 / recent swing / BB lower);',
    'suggested_t1 near the nearest resistance or BB upper; suggested_t2 the next resistance.',
    'Numbers in EGP rounded to 2 decimals. For illiquid / no-live positions (EGX30ETF, BAL, CCB),',
    'base the call on context (e.g. exit deadlines) and you may leave suggested_* as their current',
    'stop/t1/t2.',
    '',
    'RISK FRAMING — each position includes risk_R: one_R_egp (1R = entry-to-stop, EGP/share),',
    'live_R (current unrealized in R), stop_R (distance above stop in R), t1_R/t2_R (targets in R).',
    'Use R-framing in your thesis where it helps (e.g. "up +0.8R, T2 sits at +2.1R, stop is 1R below").',
    '',
    'MULTI-TIMEFRAME (mtf) — weekly_bias / daily_bias / 4h / 1h / 15m, wd_aligned, higher_tf_bullish,',
    'alignment_status, confidence. Per strategy, weekly sets BIAS and the 50%-vs-100% exit needs W/D',
    'still bullish: if higher_tf_bullish is false, lean toward fuller exits and against new adds even on',
    'a pullback. Cite the weekly/daily bias in your thesis when it changes the call.',
    '',
    'RUNNER MANAGEMENT — when phase is runner_post_t1 (T1 already filled) or runner_post_t2:',
    '- This is a RUNNER: part of the position was already sold at the fill price shown. Treat',
    '  remaining shares as profit-protected. Per strategy, the stop should be at/above break-even',
    '  (avg_cost); if stop_raised is false, your action_line should tell the user to raise it.',
    '- Hold the runner toward T2 (or trail above T1) while the trend holds (ADX strong, +DI>-DI).',
    '- On a PULLBACK: only recommend ADD if it is "scale in on strength" (trend intact, pullback to',
    '  EMA20/support with RSI cooling, not a breakdown) AND adding does not violate "never add to a',
    '  losing position"; otherwise HOLD. If the structure has shifted up, you may raise suggested_t2.',
    '- Set recommendation accordingly (HOLD / ADD / TRIM / EXIT) and reference the T1 fill explicitly',
    '  in the thesis.',
    '',
    'NEWS — each position has a news[] array (recent headlines + age). Factor catalysts into the call;',
    'cite the driving headline in catalyst/thesis when it changes anything. Empty array = no news found.',
    'REGIME — honor the MARKET REGIME above (defensive in Risk-Off). MEMORY — each position has prior_ai',
    '(your last read). Set vs_prior "unchanged" if the thesis still holds, else "changed" with a one-line',
    'change_reason. Only move suggested_* on a real reason — do not churn levels on noise.',
    'BOOK — if book_stats is provided and there are >=2 positions, fill the book object (cite',
    'open_risk_egp and any unprotected names; infer each holding\'s EGX sector yourself). Else book: null.',
    'Output JSON only.',
  ].join('\n');
}

export async function analyzePortfolio(positions, model = DEFAULT_MODEL, context = {}) {
  const strategy = await strategyText();
  const text = await runClaude(portfolioPrompt(positions, strategy, context), model);
  const parsed = extractJson(text);
  const arr = Array.isArray(parsed) ? parsed : (parsed.analyses || parsed.positions || []);
  const map = {};
  for (const a of arr) if (a && a.ticker) map[a.ticker] = a;
  const book = Array.isArray(parsed) ? null : (parsed.book ?? null);
  return { analyses: map, book };
}

// ── opportunity analysis ─────────────────────────────────────────────────────
export function opportunityPrompt(candidates, market, exclude, strategy, mode = 'market', context = {}) {
  const slim = candidates.map((c) => ({
    ticker: c.ticker, sector: c.sector, stock_score: c.stock_score, grade: c.grade,
    trend_state: c.trend_state, signals: c.signals, di_gap: c.di_gap,
    indicators: c.indicators, suggested: c.suggested,
    news: (context.news && context.news[c.ticker]) || [],
  }));
  const watchlist = mode === 'watchlist';
  const selectLine = watchlist
    ? "These are the trader's HAND-PICKED watchlist names. Analyze and rank ALL of them — do not "
      + 'drop any, do not cap the count, do not exclude held positions. Give an honest read and '
      + 'conviction (1-5) for EACH, even when weak; when a name fails the ADX/DI/RSI momentum '
      + 'profile, say so in the thesis and lower conviction rather than omitting it.'
    : 'Select up to 8 best entries.';
  return [
    'You are an expert EGX swing-trading analyst. From the candidates below, analyse and rank the',
    "swing-trade entry opportunities per the trader's strategy. STRICT JSON only.",
    '',
    '=== STRATEGY ===', strategy,
    '',
    '=== MARKET CONTEXT ===', JSON.stringify(market || {}, null, 1),
    '',
    ...regimeLines(context.regime),
    '=== ALREADY HELD (exclude) ===', JSON.stringify(exclude || []),
    '',
    '=== CANDIDATES (with live indicators + baseline levels) ===',
    JSON.stringify(slim, null, 1),
    '',
    selectLine,
    'Respond with ONLY this JSON:',
    '{"opportunities":[{',
    '  "ticker": "EGAS", "sector": "utilities", "score": 0-100, "tv_signal": "Strong Buy|Buy|Neutral",',
    '  "adx": number, "plus_di": number, "minus_di": number, "rsi": number, "macd": "bullish|bearish",',
    '  "entry_zone": [lo, hi], "stop": number, "t1": number, "t2": number,',
    '  "t1_pct": number, "t2_pct": number, "rr": number,',
    '  "weekly_bias": "Bullish|Bearish|Neutral", "wd_aligned": true|false,',
    '  "thesis": "why this is a strong entry, citing indicators", "conviction": 1-5,',
    '  "catalyst": "one line on a driving headline, or empty"',
    '}]}',
    '',
    watchlist
      ? 'Set "sector" to the company\'s EGX sector if you recognize it (e.g. banks, real_estate); '
        + 'use null if unsure — do NOT guess. (Watchlist scans do not run the screener.)'
      : '',
    'Each candidate has indicators.mtf (multi-timeframe: weekly_bias, daily_bias, wd_aligned,',
    'higher_tf_bullish, alignment_status). Per strategy the WEEKLY sets bias — STRONGLY prefer',
    'candidates with weekly_bias Bullish and wd_aligned true; down-rank ones whose higher timeframe',
    'is bearish/unaligned even if the daily looks clean. Echo weekly_bias/wd_aligned in output.',
    'If indicators.mtf is null/absent, multi-timeframe data was UNAVAILABLE — set weekly_bias to',
    '"Unknown" and wd_aligned to false. Do NOT invent a bias.',
    'Each candidate has news[] (headlines+age): down-rank a name on a negative catalyst, note a positive',
    'one; honor the MARKET REGIME above (raise the entry bar in Risk-Off).',
    'Prefer ADX strong (>40), +DI clearly > -DI, RSI 40-70, MACD bullish, R:R to T2 >= 2 where',
    'possible. Refine the baseline levels to sensible structure-based stops/targets. Output JSON only.',
  ].join('\n');
}

export function finalizeOpportunities(arr, mode = 'market') {
  return mode === 'watchlist' ? arr : arr.slice(0, 8);
}

export async function analyzeOpportunities(candidates, market, exclude, model = DEFAULT_MODEL, opts = {}) {
  const mode = opts.mode || 'market';
  const strategy = await strategyText();
  const text = await runClaude(opportunityPrompt(candidates, market, exclude, strategy, mode, opts.context || {}), model);
  const parsed = extractJson(text);
  const arr = Array.isArray(parsed) ? parsed : (parsed.opportunities || parsed.picks || []);
  return finalizeOpportunities(arr, mode);
}

// ── EGX indices analysis ───────────────────────────────────────────────────────
export function indicesPrompt(indices, strategy) {
  const slim = indices.map((x) => ({
    index: x.index, level: x.level, change_pct: x.change_pct,
    indicators: x.indicators, mtf: x.mtf, stats: x.stats, sectors: x.sectors,
  }));
  return [
    'You are an expert EGX market strategist. Read the REGIME of each EGX index below and return',
    'STRICT JSON only — no prose, no markdown.',
    '',
    '=== STRATEGY ===', strategy,
    '',
    '=== INDICES (live level + indicators + breadth + sector rotation) ===',
    JSON.stringify(slim, null, 1),
    '',
    'For EACH index output one object. Respond with ONLY this JSON:',
    '{"indices":[{',
    '  "index": "EGX30",',
    '  "regime": "Risk-On|Neutral|Risk-Off",',
    '  "trend": "Bullish|Neutral|Bearish",',
    '  "thesis": "2-3 sentences citing breadth %, RSI/ADX, sector leadership and the W/D bias",',
    '  "key_support": number, "key_resistance": number',
    '}],',
    '"overall": { "regime": "Risk-On|Neutral|Risk-Off", "summary": "one line on overall EGX posture" }}',
    '',
    'Base regime on breadth (advancing vs declining), trend (price vs EMA50/EMA200), RSI/ADX and the',
    'multi-timeframe (mtf) weekly/daily bias. key_support/key_resistance in index points from the',
    "index's own support_1 / resistance_1. Output JSON only.",
  ].join('\n');
}

export function mergeIndexAi(indices, ai) {
  const byName = {};
  for (const a of (ai?.indices || [])) if (a && a.index) byName[a.index] = a;
  return {
    indices: indices.map((x) => ({ ...x, ai: byName[x.index] || null })),
    overall: ai?.overall || null,
  };
}

export async function analyzeIndices(indices, model = DEFAULT_MODEL) {
  const strategy = await strategyText();
  const text = await runClaude(indicesPrompt(indices, strategy), model);
  const parsed = extractJson(text);
  return mergeIndexAi(indices, parsed);
}

// ── gold (Goldx) analysis ──────────────────────────────────────────────────────
export function goldPrompt(snapshot, position, strategy, context = {}) {
  const holding = !!position;
  const slim = {
    price_usd_oz: snapshot?.indicators?.price ?? null,
    indicators: snapshot?.indicators ?? null,
    mtf: snapshot?.mtf ?? null,
    usd_egp: snapshot?.usd_egp ?? null,
    gc_usd_oz: snapshot?.gc_usd ?? null,
    dxy: snapshot?.dxy?.price ?? null,
    us10y: snapshot?.us10y?.price ?? null,
    macro_news: context.news || [],
    prior_ai: priorAiSlim(context.prior_ai),
    position: holding
      ? {
          avg_cost: position.avg_cost, shares_oz: position.shares,
          stop_loss: position.stop_loss, t1_price: position.t1_price, t2_price: position.t2_price,
          t1_hit: !!position.t1_hit, t2_hit: !!position.t2_hit, stop_raised: !!position.stop_raised,
        }
      : null,
  };
  const head = [
    'You are an expert GOLD swing-trading analyst. Apply the trader\'s OWN swing strategy (below) to',
    'live gold data and return STRICT JSON only — no prose, no markdown. All prices are in USD per',
    'troy ounce (PAXG, 1 token = 1 oz).',
    '',
    '=== STRATEGY (adapt the stock rules to gold) ===', strategy,
    '',
    'GOLD CONTEXT: gold is macro/news-driven — weigh USD/DXY (inverse), real yields, Fed policy,',
    'geopolitics and central-bank buying. There are no earnings or stock-score metrics for gold.',
    'Use the ACTUAL dxy / us10y prints and macro_news headlines above — not memory. DXY up = gold headwind.',
    'FEES: the trader may execute on Thndr (~2% round-trip commission, EGP/gram) or Binance (~0.2%,',
    'PAXG). Factor these into target selection and say, briefly, whether a target clears the 2% Thndr',
    'round-trip net-positive. Thndr execution windows are 10:00 / 13:00 / 15:00 Cairo.',
    '',
    '=== LIVE GOLD DATA ===', JSON.stringify(slim, null, 1),
    '',
  ];
  const tail = holding
    ? [
        'You HOLD gold. Review the position. Respond with ONLY this JSON:',
        '{',
        '  "recommendation": "HOLD|TRIM|EXIT|ADD", "conviction": 1-5,',
        '  "thesis": "2-3 sentences citing the ACTUAL indicators + macro/news drivers",',
        '  "key_risk": "one short line",',
        '  "suggested_stop": number, "suggested_t1": number, "suggested_t2": number,',
        '  "action_line": "short imperative (venue + level)",',
        '  "net_of_fee": "one line on Thndr 2% vs Binance ~0.2% for the next target",',
        '  "vs_prior": "unchanged|changed", "change_reason": "short line or empty",',
        '  "weekly_bias": "Bullish|Bearish|Neutral|Unknown", "wd_aligned": true|false',
        '}',
      ]
    : [
        'You are FLAT (no position). Decide whether gold is a good swing entry now. Respond with ONLY',
        'this JSON:',
        '{',
        '  "recommendation": "ENTER_LONG|WAIT|AVOID", "conviction": 1-5,',
        '  "thesis": "2-3 sentences citing the ACTUAL indicators + macro/news drivers",',
        '  "key_risk": "one short line",',
        '  "entry_zone": [lo, hi], "stop": number, "t1": number, "t2": number,',
        '  "t1_pct": number, "t2_pct": number, "rr": number,',
        '  "net_of_fee": "one line on Thndr 2% vs Binance ~0.2% for T1/T2",',
        '  "vs_prior": "unchanged|changed", "change_reason": "short line or empty",',
        '  "weekly_bias": "Bullish|Bearish|Neutral|Unknown", "wd_aligned": true|false',
        '}',
      ];
  return [
    ...head,
    ...tail,
    '',
    'Numbers in USD/oz rounded to 2 decimals. If mtf is null, set weekly_bias "Unknown" (do NOT invent',
    'a bias). Prefer entries with ADX strong (>40), +DI clearly > -DI, RSI 40-70, and R:R to T2 >= 2.',
    'MEMORY — prior_ai is your last gold read; set vs_prior unchanged/changed (+reason); move levels only on a real reason.',
    'Output JSON only.',
  ].join('\n');
}

export function finalizeGold(parsed) {
  return parsed && !Array.isArray(parsed) && typeof parsed === 'object' ? parsed : {};
}

export async function analyzeGold(snapshot, position, model = DEFAULT_MODEL, context = {}) {
  const strategy = await strategyText();
  const text = await runClaude(goldPrompt(snapshot, position, strategy, context), model);
  return finalizeGold(extractJson(text));
}
