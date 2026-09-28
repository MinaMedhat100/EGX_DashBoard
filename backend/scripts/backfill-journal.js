// backfill-journal.js — ONE-OFF (v2.6.0): build journal records for trades that predate the journal.
//
//   node backend/scripts/backfill-journal.js --dry-run   prints what it would write; writes nothing
//   node backend/scripts/backfill-journal.js             backs up, then writes
//
// Stop the backend first: it reads and writes the same files. Idempotent — a second run adds nothing.
import { copyFile, access } from 'node:fs/promises';
import { DATA_FILE, load, save } from '../services/portfolioStore.js';
import { JOURNAL_FILE, loadJournal, saveJournal } from '../services/journalStore.js';
import { allRuns } from '../services/scanHistoryStore.js';
import { buildBackfill, pendingTrades, applyBackfill } from '../services/journalBackfill.js';

const dryRun = process.argv.includes('--dry-run');
const now = new Date().toISOString();
const today = now.slice(0, 10);

function describe({ trade, target }) {
  const where = target.kind === 'exit' ? `exit #${target.index}` : 'open position';
  const entry = trade.entry?.price != null ? `@ ${trade.entry.price}` : '@ ?';
  const out = trade.exit ? `-> ${trade.exit.type} ${trade.exit.price} on ${trade.exit.date}` : '(open)';
  const card = trade.card ? ` · card ${String(trade.card.scan_as_of).slice(0, 10)} score ${trade.card.score ?? '?'}` : '';
  return `${trade.trade_id.padEnd(28)} ${trade.origin.padEnd(13)} ${trade.opened_at ?? '????-??-??'} ${entry} ${out} · ${trade.events.length} events${card} [${where}]`;
}

const data = await load();
const journal = await loadJournal();
const built = buildBackfill(data, await allRuns(), { today, now });
const todo = pendingTrades(data, journal, built);

console.log(`${todo.length} trade(s) to add${dryRun ? ' (dry run: nothing written)' : ''}:\n`);
for (const t of todo) console.log(`  ${describe(t)}`);
if (built.unmatched.length) {
  console.log(`\nCould not match (${built.unmatched.length}):`);
  for (const u of built.unmatched) console.log(`  - ${u}`);
}
if (dryRun || !todo.length) process.exit(0);

const stamp = now.replace(/[:.]/g, '-');
await copyFile(DATA_FILE, DATA_FILE.replace(/\.json$/, `.${stamp}.backup.json`));
try {
  await access(JOURNAL_FILE);
  await copyFile(JOURNAL_FILE, JOURNAL_FILE.replace(/\.json$/, `.${stamp}.backup.json`));
} catch { /* no journal yet — nothing to back up */ }

const { added } = applyBackfill(data, journal, built);
await saveJournal(journal); // journal first: a trade_id on a position must never point at nothing
await save(data);
console.log(`\nWrote ${added} trade(s). Backups: backend/data/*.${stamp}.backup.json`);
