// scanHistoryStore.js — persists opportunity-scan runs to backend/data/scan_history.json.
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'scan_history.json');
const CAP = 50; // keep the most recent N runs

export const PRIOR_THESIS_MAX = 200; // enough of the last thesis to compare against, not a wall of text
const DAY_MS = 24 * 60 * 60 * 1000;

async function readAll() {
  try {
    return JSON.parse(await readFile(FILE, 'utf-8'));
  } catch {
    return []; // missing/empty file -> no history yet
  }
}

async function writeAll(runs) {
  const tmp = `${FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(runs, null, 2), 'utf-8');
  await rename(tmp, FILE);
}

export async function appendRun(run) {
  const runs = await readAll();
  const rec = { id: randomUUID().slice(0, 12), timestamp: new Date().toISOString(), ...run };
  runs.unshift(rec);
  await writeAll(runs.slice(0, CAP));
  return rec;
}

// Lightweight summaries for the run-selector (no full opportunity payloads).
export function summarizeRuns(runs) {
  return (runs || []).map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    params: r.params,
    model: r.model,
    count: (r.opportunities || []).length,
    scanned: r.scanned,
    passed: r.passed,
    ai_fallback: r.ai_fallback,
    market_direction: r.market?.direction ?? null,
    mode: r.mode || 'market',
    watchlist_count: (r.watchlist_tickers || []).length,
  }));
}

export async function listRuns() {
  return summarizeRuns(await readAll());
}

export async function getRun(id) {
  return (await readAll()).find((r) => r.id === id) || null;
}

export async function clearRuns() {
  await writeAll([]);
}

/**
 * The AI's own previous read of each ticker, so a scan can see what it said last time.
 * `runs` is newest-first (as stored), so the first hit for a ticker is the most recent one.
 * Best-effort by design: "Clear history" or a ticker's first appearance yields null, which the
 * prompt reads as "first read".
 */
export function priorReads(runs, tickers, now = new Date()) {
  const want = new Set((tickers || []).map((t) => String(t || '').toUpperCase()).filter(Boolean));
  const out = {};
  for (const t of want) out[t] = null;

  const counts = {};
  for (const run of runs || []) {
    for (const o of run.opportunities || []) {
      const key = String(o?.ticker || '').toUpperCase();
      if (!want.has(key)) continue;
      counts[key] = (counts[key] || 0) + 1;
      if (out[key]) continue; // already captured the most recent read
      const t = Date.parse(run.timestamp);
      out[key] = {
        as_of: run.timestamp ?? null,
        days_ago: Number.isNaN(t) ? null : Math.floor((now.getTime() - t) / DAY_MS),
        mode: run.mode || 'market',
        score: o.score ?? null,
        conviction: o.conviction ?? null,
        adx: o.adx ?? null,
        plus_di: o.plus_di ?? null,
        minus_di: o.minus_di ?? null,
        rsi: o.rsi ?? null,
        price: o.price ?? null,
        entry_zone: o.entry_zone ?? null,
        stop: o.stop ?? null,
        t1: o.t1 ?? null,
        t2: o.t2 ?? null,
        thesis: (o.thesis || '').slice(0, PRIOR_THESIS_MAX),
        seen_count: 0,
      };
    }
  }
  for (const [k, v] of Object.entries(out)) if (v) v.seen_count = counts[k] || 0;
  return out;
}

export async function lookupPriorReads(tickers) {
  return priorReads(await readAll(), tickers);
}
