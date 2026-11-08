// esthmr-ab.js — VERIFICATION ONLY for the v2.11.0 keep-or-drop verdict; removed before merge.
// Fetches the bridge data, the news pool and the ESTHMR extras ONCE, then builds two Indices reads from the same
// inputs: today's path (no extras) and the ESTHMR path. They are saved under random A/B labels for a blind pick.
//
//   node scripts/esthmr-ab.js --strategy <main checkout>/STRATEGY.md [--model <m>] [--extras-only]
//
// --extras-only makes no AI call (free): it prints what ESTHMR returned and how the zones change.
// A full run makes two paid AI calls (about $0.60). Needs the bridge already running on :8001.
// Output: backend/data/esthmr_ab/<Cairo date>.json and .html (gitignored, deleted after the verdict).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bridge } from '../services/bridgeClient.js';
import { indexNews } from '../services/aiContext.js';
import { fetchIndexExtras } from '../services/esthmrIndices.js';
import { cairoDate } from '../services/esthmrDigest.js';
import { buildIndicesSnapshot, analyzeIndices, runClaude, withZones, DEFAULT_MODEL } from '../services/analystService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'data', 'esthmr_ab');

export function assignLabels(rand = Math.random) {
  return rand() < 0.5 ? { A: 'today', B: 'esthmr' } : { A: 'esthmr', B: 'today' };
}

// ── numbers the AI stated that its prompt never contained (a review aid, not a judge) ──────────────────────────
const OUT_NUM = /(?<![A-Za-z\d.,])[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g; // skips ids like Z3, N2, EGX30, EMA50
const IN_NUM = /(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;
const key = (v) => String(Number(Math.abs(v).toFixed(6)));
const toNum = (s) => Number(s.replace(/[,+]/g, ''));

function promptNumbers(text) {
  const set = new Set();
  for (const m of text.match(IN_NUM) || []) {
    const v = toNum(m);
    for (const d of [0, 1, 2]) {
      const f = 10 ** d;
      set.add(key(Math.round(v * f) / f));
      set.add(key(Math.trunc(v * f) / f));
    }
    set.add(key(v));
  }
  return set;
}

const skip = (v) => Number.isInteger(v) && Math.abs(v) <= 12; // counts, months, sessions

export function unsupportedNumbers(aiIndices, promptText) {
  const known = promptNumbers(promptText);
  const out = [];
  const walk = (index, node, p) => {
    if (typeof node === 'number') {
      if (!skip(node) && !known.has(key(node))) out.push({ index, path: p, value: node });
    } else if (typeof node === 'string') {
      for (const m of node.match(OUT_NUM) || []) {
        const v = toNum(m);
        if (!skip(v) && !known.has(key(v))) out.push({ index, path: p, value: v });
      }
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(index, v, p ? `${p}.${k}` : k);
    }
  };
  for (const x of aiIndices || []) if (x?.ai) walk(x.index, x.ai, '');
  return out;
}

// ── the blind page ────────────────────────────────────────────────────────────────────────────────────────────
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const li = (items) => (items.length ? `<ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul>` : '<p class="dim">—</p>');

function indexHtml(x) {
  const a = x.ai || {};
  const zones = (x.zones || []).map((z) => `<tr><td>${esc(z.id)}</td><td>${esc(z.lo)}–${esc(z.hi)}</td><td>${esc(z.role)}</td>`
    + `<td>${esc(z.score)}</td><td>${esc((z.sources || []).map((s) => `${s.name} ${s.tf}`).join(', '))}</td></tr>`).join('');
  const sc = (s, name) => (s ? `<b>${name}</b>: ${esc(s.trigger)} ${esc(s.level)} → ${esc(s.target)}${s.off_zone ? ' (off zone)' : ''} — ${esc(s.note)}` : `<b>${name}</b>: —`);
  return `<section><h3>${esc(x.index)} · ${esc(x.level)}</h3>
<p class="head">${esc(a.headline)}</p>
<p>${esc(a.regime)} · ${esc(a.trend)} · likely: ${esc(a.likely?.side)} (${esc(a.likely?.confidence)})</p>${li((a.likely?.reasons || []).map(esc))}
<h4>Trend &amp; momentum</h4>${li((a.trend_momentum || []).map((r) => `<b>${esc(r.label)}</b> ${esc(r.read)} — ${esc(r.detail)}`))}
<h4>Breadth</h4><p><b>${esc(a.breadth?.read)}</b> ${esc(a.breadth?.detail)}<br>${esc(a.breadth?.note)}</p>
<h4>Zones</h4><table><tr><th>id</th><th>range</th><th>role</th><th>score</th><th>sources</th></tr>${zones}</table>
${li((a.zones || []).map((z) => `<b>${esc(z.id)}</b> ${esc(z.note)}`))}
<h4>Scenarios</h4>${li([sc(a.scenarios?.bull, 'Bull'), sc(a.scenarios?.bear, 'Bear')])}
<h4>For me</h4>${li([`New entries: ${esc(a.for_me?.new_entries)}`, `Open positions: ${esc(a.for_me?.open_positions)}`, `Watch: ${esc(a.for_me?.watch)}`])}
<h4>News</h4>${li((a.news || []).map((n) => `${esc(n.id)} ${esc(n.impact)} — ${esc(n.why)}`))}
</section>`;
}

function readHtml(label, s) {
  return `<div class="read"><h2>Read ${label}</h2>
<p><b>Overall:</b> ${esc(s?.overall?.regime)} — ${esc(s?.overall?.summary)}</p>
${s?.ai_error ? `<p class="err">AI error: ${esc(s.ai_error)}</p>` : ''}
${(s?.indices || []).map(indexHtml).join('\n')}</div>`;
}

export function renderHtml(sessionDate, { A, B }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Indices reads ${esc(sessionDate)}: A vs B</title>
<style>body{font:14px/1.45 system-ui,sans-serif;margin:16px;background:#111;color:#ddd}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.read{background:#1b1b1b;padding:12px;border-radius:8px}section{border-top:1px solid #333;margin-top:12px}table{border-collapse:collapse;width:100%}
td,th{border:1px solid #333;padding:2px 6px;font-size:12px;text-align:left}.head{font-weight:600}.dim{color:#777}.err{color:#f66}h4{margin:10px 0 2px}</style>
</head><body><h1>Indices reads, session ${esc(sessionDate)}: which is better, A or B?</h1>
<div class="grid">${readHtml('A', A)}${readHtml('B', B)}</div></body></html>`;
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────────────────
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };

function zoneCounts(zoned) {
  return Object.fromEntries(zoned.map((x) => [x.index, {
    resistance: x.zones.filter((z) => z.role === 'resistance').length,
    support: x.zones.filter((z) => z.role === 'support').length,
    at_price: x.zones.filter((z) => z.role === 'at_price').length,
    widest_atr: x.indicators?.atr > 0 ? Math.max(0, ...x.zones.map((z) => Math.round(((z.hi - z.lo) / x.indicators.atr) * 100) / 100)) : null,
  }]));
}

async function main() {
  const strategyFile = arg('--strategy');
  if (!strategyFile) throw new Error('pass --strategy <main checkout>/STRATEGY.md');
  const strategy = await readFile(strategyFile, 'utf-8');
  const model = arg('--model') || DEFAULT_MODEL;
  const now = new Date();
  const session = cairoDate(now);

  const data = await bridge.indices();
  const indices = data.indices || [];
  const news = await indexNews().catch(() => ({ items: [], error: 'news lookup failed' }));
  const t0 = Date.now();
  const extras = await fetchIndexExtras();
  const extrasMs = Date.now() - t0;

  if (process.argv.includes('--extras-only')) {
    console.log(JSON.stringify({
      status: extras.status, extras_ms: extrasMs,
      swing_levels: Object.fromEntries(Object.entries(extras.parts.history || {}).map(([ix, h]) => [ix, {
        D: h.levels.filter((l) => l.tf === 'D').length, W: h.levels.filter((l) => l.tf === 'W').length, structure: h.structure,
      }])),
      zones_today: zoneCounts(withZones(indices)),
      zones_esthmr: zoneCounts(withZones(indices, extras)),
      digest_chars: JSON.stringify(extras.parts).length,
    }, null, 1));
    return;
  }

  const labels = assignLabels();
  const prompts = {};
  const snapshots = {};
  for (const label of ['A', 'B']) {
    const withExtras = labels[label] === 'esthmr';
    const run = (p, m, o) => { prompts[label] = p; return runClaude(p, m, o); };
    snapshots[label] = await buildIndicesSnapshot(indices, model, {
      now: () => now,
      getNews: async () => news,
      getExtras: async () => (withExtras ? extras : null),
      analyze: (z, m, o) => analyzeIndices(z, m, { ...o, strategy, run }),
    });
  }
  const unsupported = Object.fromEntries(['A', 'B'].map((l) => [l, unsupportedNumbers(snapshots[l].indices, prompts[l] || '')]));

  await mkdir(OUT_DIR, { recursive: true });
  const base = path.join(OUT_DIR, session);
  await writeFile(`${base}.json`, JSON.stringify({
    session_date: session, labels, extras_ms: extrasMs, status: extras.status, digests: extras.parts, prompts, snapshots, unsupported,
  }, null, 1), 'utf-8');
  await writeFile(`${base}.html`, renderHtml(session, snapshots), 'utf-8');
  console.log(`Saved ${base}.json and ${base}.html`);
  for (const l of ['A', 'B']) {
    console.log(`Read ${l}: cost $${snapshots[l].cost_usd ?? '?'}, ai_error ${snapshots[l].ai_error ?? 'none'}, numbers not in its prompt: ${unsupported[l].length}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`A/B run failed: ${e.message}`); process.exit(1); });
}
