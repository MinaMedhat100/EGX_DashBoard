// portfolioStore.js — read/write backend/data/portfolio_data.json (atomic writes).
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_FILE = path.join(__dirname, '..', 'data', 'portfolio_data.json');
export const CACHE_FILE = path.join(__dirname, '..', 'data', 'last_refresh.json');

export async function load() {
  return JSON.parse(await readFile(DATA_FILE, 'utf-8'));
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
