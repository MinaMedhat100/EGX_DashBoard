// portfolioStore.js — read/write backend/data/portfolio_data.json (atomic writes).
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_FILE = path.join(__dirname, '..', 'data', 'portfolio_data.json');
export const CACHE_FILE = path.join(__dirname, '..', 'data', 'last_refresh.json');

// Fill in fields added in later versions without disturbing existing data (no regen needed).
export function normalize(data) {
  for (const p of data.positions || []) {
    if (p.levels_source === undefined) p.levels_source = 'manual';
    if (p.t2_hit === undefined) p.t2_hit = false;
    if (p.t1_fill_price === undefined) p.t1_fill_price = null;
    if (p.t1_fill_date === undefined) p.t1_fill_date = null;
    if (p.t2_fill_price === undefined) p.t2_fill_price = null;
    if (p.t2_fill_date === undefined) p.t2_fill_date = null;
  }
  return data;
}

export async function load() {
  return normalize(JSON.parse(await readFile(DATA_FILE, 'utf-8')));
}

export async function save(data) {
  const tmp = `${DATA_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await rename(tmp, DATA_FILE); // atomic on same volume
}

export function liquidTickers(data) {
  return data.positions.filter((p) => p.is_liquid).map((p) => p.ticker);
}

export function getPosition(data, ticker) {
  return data.positions.find((p) => p.ticker === ticker);
}
