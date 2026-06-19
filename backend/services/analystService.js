// analystService.js — the AI layer. Spawns headless `claude -p` (no tools, pure reasoning),
// hands it already-fetched data + STRATEGY.md, parses strict JSON back.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STRATEGY_FILE = path.join(__dirname, '..', '..', 'STRATEGY.md');

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
export const DEFAULT_MODEL = process.env.ANALYSIS_MODEL || 'opus';
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

function portfolioPrompt(positions, strategy) {
  const slim = positions.map((p) => ({
    ticker: p.ticker, avg_cost: p.avg_cost, shares: p.shares, live_price: p.live_price,
    stop_loss: p.stop_loss, t1_price: p.t1_price, t2_price: p.t2_price,
    position_label: p.position_label, is_liquid: p.is_liquid, status_key: p.status_key,
    unrealized_pnl: p.unrealized_pnl, unrealized_pct: p.unrealized_pct,
    phase: positionPhase(p),
    t1_hit: !!p.t1_hit, t2_hit: !!p.t2_hit, stop_raised: !!p.stop_raised,
    t1_fill_price: p.t1_fill_price ?? null, t2_fill_price: p.t2_fill_price ?? null,
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
    'For EACH position output one analysis object. Respond with ONLY this JSON shape:',
    '{"analyses":[{',
    '  "ticker": "CANA",',
    '  "recommendation": "HOLD|TRIM|EXIT|ADD|WATCH",',
    '  "conviction": 1-5,',
    '  "thesis": "2-3 sentences citing the ACTUAL indicator values and what the strategy says",',
    '  "key_risk": "one short line",',
    '  "suggested_stop": number, "suggested_t1": number, "suggested_t2": number,',
    '  "action_line": "short imperative, e.g. \'Switch to limit sell 125sh @ 38.00\'"',
    '}]}',
    '',
    'Rules: suggested_stop just below structural support (EMA50 / recent swing / BB lower);',
    'suggested_t1 near the nearest resistance or BB upper; suggested_t2 the next resistance.',
    'Numbers in EGP rounded to 2 decimals. For illiquid / no-live positions (EGX30ETF, BAL, CCB),',
    'base the call on context (e.g. exit deadlines) and you may leave suggested_* as their current',
    'stop/t1/t2.',
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
    'Output JSON only.',
  ].join('\n');
}

export async function analyzePortfolio(positions, model = DEFAULT_MODEL) {
  const strategy = await strategyText();
  const text = await runClaude(portfolioPrompt(positions, strategy), model);
  const parsed = extractJson(text);
  const arr = Array.isArray(parsed) ? parsed : (parsed.analyses || parsed.positions || []);
  const map = {};
  for (const a of arr) if (a && a.ticker) map[a.ticker] = a;
  return map;
}

// ── opportunity analysis ─────────────────────────────────────────────────────
function opportunityPrompt(candidates, market, exclude, strategy) {
  const slim = candidates.map((c) => ({
    ticker: c.ticker, sector: c.sector, stock_score: c.stock_score, grade: c.grade,
    trend_state: c.trend_state, signals: c.signals, di_gap: c.di_gap,
    indicators: c.indicators, suggested: c.suggested,
  }));
  return [
    'You are an expert EGX swing-trading analyst. From the screened candidates below, select and',
    'rank the BEST swing-trade entry opportunities per the trader\'s strategy. STRICT JSON only.',
    '',
    '=== STRATEGY ===', strategy,
    '',
    '=== MARKET CONTEXT ===', JSON.stringify(market || {}, null, 1),
    '',
    '=== ALREADY HELD (exclude) ===', JSON.stringify(exclude || []),
    '',
    '=== CANDIDATES (pre-screened, with live indicators + baseline levels) ===',
    JSON.stringify(slim, null, 1),
    '',
    'Select up to 8 best entries. Respond with ONLY this JSON:',
    '{"opportunities":[{',
    '  "ticker": "EGAS", "sector": "utilities", "score": 0-100, "tv_signal": "Strong Buy|Buy|Neutral",',
    '  "adx": number, "plus_di": number, "minus_di": number, "rsi": number, "macd": "bullish|bearish",',
    '  "entry_zone": [lo, hi], "stop": number, "t1": number, "t2": number,',
    '  "t1_pct": number, "t2_pct": number, "rr": number,',
    '  "thesis": "why this is a strong entry, citing indicators", "conviction": 1-5',
    '}]}',
    '',
    'Rank by quality (score desc). Prefer ADX strong (>40), +DI clearly > -DI, RSI 40-70 (room to run),',
    'MACD bullish, and R:R to T2 >= 2 where possible. Refine the baseline levels to sensible',
    'structure-based stops/targets. Exclude anything already held. Output JSON only.',
  ].join('\n');
}

export async function analyzeOpportunities(candidates, market, exclude, model = DEFAULT_MODEL) {
  const strategy = await strategyText();
  const text = await runClaude(opportunityPrompt(candidates, market, exclude, strategy), model);
  const parsed = extractJson(text);
  const arr = Array.isArray(parsed) ? parsed : (parsed.opportunities || parsed.picks || []);
  return arr.slice(0, 8);
}
