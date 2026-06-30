// indicesStore.js — persists the single latest EGX index snapshot (atomic write).
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FILE = path.join(__dirname, '..', 'data', 'indices_snapshot.json');

export async function load(file = FILE) {
  try {
    return JSON.parse(await readFile(file, 'utf-8'));
  } catch {
    return null; // no snapshot yet
  }
}

export async function save(snapshot, file = FILE) {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf-8');
  await rename(tmp, file);
  return snapshot;
}
