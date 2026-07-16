// goldStore.js — self-contained state for the Goldx tab (backend/data/gold_state.json).
// Kept entirely out of the EGX portfolio. All prices are USD/oz (PAXG native).
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FILE = path.join(__dirname, '..', 'data', 'gold_state.json');

export function emptyGoldState() {
  return { snapshot: null, position: null, realized_pnl_usd: 0, action_log: [] };
}

export async function load(file = FILE) {
  try {
    return { ...emptyGoldState(), ...JSON.parse(await readFile(file, 'utf-8')) };
  } catch {
    return emptyGoldState();
  }
}

export async function save(state, file = FILE) {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2), 'utf-8');
  await rename(tmp, file);
  return state;
}
