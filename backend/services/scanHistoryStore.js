// scanHistoryStore.js — persists opportunity-scan runs to backend/data/scan_history.json.
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'scan_history.json');
const CAP = 50; // keep the most recent N runs

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
export async function listRuns() {
  const runs = await readAll();
  return runs.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    params: r.params,
    model: r.model,
    count: (r.opportunities || []).length,
    scanned: r.scanned,
    passed: r.passed,
    ai_fallback: r.ai_fallback,
    market_direction: r.market?.direction ?? null,
  }));
}

export async function getRun(id) {
  return (await readAll()).find((r) => r.id === id) || null;
}

export async function clearRuns() {
  await writeAll([]);
}
