// journalRecorder.js — the one place routes write the journal. Best-effort: the route has already
// saved the portfolio change, so a journal failure is REPORTED (journal_warning), never thrown — the
// journal never blocks trading. Writes are serialised so two requests can't lose each other's events.
import { loadJournal, saveJournal } from './journalStore.js';

let chain = Promise.resolve();

async function write(apply, store) {
  try {
    const journal = await store.loadJournal();
    apply(journal);
    await store.saveJournal(journal);
    return null;
  } catch (e) {
    console.error('[journal]', e.message);
    return `Trade journal not updated: ${e.message}`;
  }
}

export function recordJournal(apply, store = { loadJournal, saveJournal }) {
  const run = chain.then(() => write(apply, store));
  chain = run; // write() never rejects, so the chain can't break
  return run;
}
