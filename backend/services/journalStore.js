// journalStore.js — read/write backend/data/journal.json (atomic writes). The file is personal
// trading history and is gitignored (the repo is public).
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyJournal } from './journalService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const JOURNAL_FILE = path.join(__dirname, '..', 'data', 'journal.json');

// A missing file is a fresh journal. A corrupt one THROWS: returning an empty journal here would let
// the next save overwrite the whole history.
export async function loadJournal(file = JOURNAL_FILE) {
  let raw;
  try {
    raw = await readFile(file, 'utf-8');
  } catch (e) {
    if (e.code === 'ENOENT') return emptyJournal();
    throw e;
  }
  const j = JSON.parse(raw);
  if (!Array.isArray(j?.trades)) throw new Error('journal.json has no trades array');
  return j;
}

export async function saveJournal(journal, file = JOURNAL_FILE) {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(journal, null, 2), 'utf-8');
  await rename(tmp, file); // atomic on the same volume
}
