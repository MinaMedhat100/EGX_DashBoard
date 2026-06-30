// watchlistStore.js — read/write the single saved watchlist (backend/data/watchlist.json).
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FILE = path.join(__dirname, '..', 'data', 'watchlist.json');

// Accept an array or a comma/newline/space-separated string.
export function normalizeTickers(raw) {
  const parts = Array.isArray(raw) ? raw : String(raw || '').split(/[\s,]+/);
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const t = String(p || '').trim().toUpperCase();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

export async function load(file = FILE) {
  try {
    const raw = JSON.parse(await readFile(file, 'utf-8'));
    return { tickers: normalizeTickers(raw.tickers) };
  } catch {
    return { tickers: [] };
  }
}

export async function save(tickers, file = FILE) {
  const norm = normalizeTickers(tickers);
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify({ tickers: norm }, null, 2), 'utf-8');
  await rename(tmp, file);
  return { tickers: norm };
}
