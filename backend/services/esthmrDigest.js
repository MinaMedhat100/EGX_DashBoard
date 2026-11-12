// esthmrDigest.js — turn ESTHMR answers into small, checked digests for the Indices prompt (v2.11.0). Pure.
// Each digest picks named fields only: ESTHMR's free text (summaries, titles, news) never reaches the AI.
// A digest returns null when the answer is unusable; the caller then counts that part as failed.

export const OUTLIER_X_MEDIAN = 3; // a session's net above 3x the usual size is likely a block deal
export const OUTLIER_SHARE_OF_VALUE = 0.5; // ...or above half of everything traded that session
export const EVENTS_WINDOW_DAYS = 14;
export const EVENTS_MAX = 12;
export const FLOW_SESSIONS_SHOWN = 5;

// Spec §4.5: ex-dividend, splits (and bonus shares, a split in all but name), rights, general meetings.
// Dividend *payment* days are left out: the price already moved on the ex-date.
export const EVENT_KINDS = /^(ex_dividend|assembly_egm|assembly_agm)$|split|rights|bonus/;
const TEXT_MAX = 60;
const TICKER_MAX = 12;

const GROUPS = ['eg', 'ar', 'fo'];
const MOVE_IDS = ['EGX30', 'EGX70EWI', 'EGX100EWI'];
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isDate = (v) => typeof v === 'string' && YMD.test(v);
const r1 = (v) => Math.round(v * 10) / 10 || 0; // `|| 0` turns -0 into 0
const toM = (v) => (v == null ? null : r1(v / 1e6));
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const list = (v) => (Array.isArray(v) ? v : []);
// Text from an outside server: strings only, control characters flattened, length capped.
const txt = (v, max = TEXT_MAX) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max) || null : null);

const CAIRO = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' });
export const cairoDate = (d) => CAIRO.format(d);

const addDays = (ymd, k) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + k);
  return d.toISOString().slice(0, 10);
};

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function sumGroups(rows, pick) {
  const t = { eg: 0, ar: 0, fo: 0 };
  for (const r of rows) for (const g of GROUPS) t[g] += fin(pick(r)?.[g]) ?? 0;
  return { eg: toM(t.eg), ar: toM(t.ar), fo: toM(t.fo) };
}

export function flowsDigest(sc) {
  const valid = list(obj(sc)?.sessions)
    .filter((s) => obj(s) && isDate(s.date) && GROUPS.every((g) => fin(s.shares?.[g]) != null))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!valid.length) return null;

  const net = (s) => Math.max(...GROUPS.map((g) => Math.abs(s.shares[g])));
  const usual = median(valid.map(net));
  const isOutlier = (s) => {
    const value = fin(s.sharesValue);
    return net(s) > OUTLIER_X_MEDIAN * usual || (value > 0 && net(s) > OUTLIER_SHARE_OF_VALUE * value);
  };

  return {
    unit: 'EGP millions, net buying',
    sessions: valid.slice(0, FLOW_SESSIONS_SHOWN).map((s) => ({
      date: s.date,
      eg: toM(s.shares.eg), ar: toM(s.shares.ar), fo: toM(s.shares.fo),
      fo_inst: toM(fin(s.sharesInstitutions?.fo)),
      traded: toM(fin(s.sharesValue)),
      ...(s.soFar === true ? { partial: true } : {}),
      ...(isOutlier(s) ? { outlier: true } : {}),
    })),
    counted: valid.length,
    totals: sumGroups(valid, (s) => s.shares),
    totals_ex_outliers: sumGroups(valid.filter((s) => !isOutlier(s)), (s) => s.shares),
    tbills: { note: 'lending to the government, not shares', totals: sumGroups(valid, (s) => s.treasuryBills) },
  };
}

const mover = (m) => ({
  ticker: txt(m.ticker, TICKER_MAX), change: fin(m.change), vol_x: fin(m.volumeVsUsual), filed: list(m.filings).length > 0,
});

export function breadthDigest(sc) {
  const b = obj(obj(sc)?.breadth);
  if (!b || fin(b.up) == null || fin(b.down) == null) return null;
  const sectors = list(sc.sectors)
    .filter((s) => obj(s) && txt(s.name) && fin(s.median) != null)
    .map((s) => ({ name: txt(s.name), median: s.median, companies: fin(s.companies) }));
  const movers = (xs) => list(xs).filter((m) => obj(m) && typeof m.ticker === 'string').slice(0, 5).map(mover);
  return {
    session: isDate(sc.session) ? sc.session : null,
    up: b.up, down: b.down, flat: fin(b.flat), none: fin(b.none),
    top_sectors: [...sectors].sort((a, b2) => b2.median - a.median).slice(0, 3),
    bottom_sectors: [...sectors].sort((a, b2) => a.median - b2.median).slice(0, 3),
    risers: movers(sc.rose),
    fallers: movers(sc.fell),
  };
}

const move = (p) => (obj(p) ? { pct: fin(p.changePct), larger_than_pct: fin(p.largerThanPct) } : null);

export function macroDigest(sc, now = new Date()) {
  if (!obj(sc)) return null;
  // A session date after today in Cairo can't be right (ESTHMR said asOf 2026-11-12 on 10 Nov): drop it.
  const today = cairoDate(now);
  const pastDate = (v) => (isDate(v) && v <= today ? v : null);
  const rate = (id) => list(sc.egypt).find((r) => r?.id === id);
  const [dep, lend, main] = ['EGY_DEPOSIT', 'EGY_LENDING', 'EGY_MAIN'].map(rate);
  const cbe = dep || lend || main
    ? { deposit: fin(dep?.percent), lending: fin(lend?.percent), main: fin(main?.percent), since: [main, dep, lend].find((r) => isDate(r?.date))?.date ?? null }
    : null;
  const usd = fin(list(sc.currencies).find((c) => c?.code === 'USD')?.egp);
  const moves = list(sc.moves)
    .filter((m) => obj(m) && MOVE_IDS.includes(m.id))
    // as_of: the session the moves close on; ESTHMR can lag the live session, so the date travels with them
    .map((m) => ({ index: m.id, as_of: pastDate(m.date), week: move(m.week), month: move(m.month), quarter: move(m.quarter) }));
  if (!cbe && usd == null && !moves.length) return null;
  const e = obj(sc.egx30Usd);
  return {
    as_of: pastDate(sc.asOf),
    cbe,
    usd_egp: usd,
    egx30_usd: e ? { session: pastDate(e.session), level: fin(e.level), change_pct: fin(e.changePct), ytd_pct: fin(e.ytdPct) } : null,
    brent_usd: fin(list(sc.series).find((s) => s?.id === 'brent')?.latest),
    gold_usd_oz: fin(list(sc.metals).find((m) => m?.id === 'XAU')?.usdOunce),
    moves,
  };
}

export function eventsDigest(sc, now) {
  if (!obj(sc) || (!Array.isArray(sc.banks) && !Array.isArray(sc.events))) return null;
  const today = cairoDate(now);
  const end = addDays(today, EVENTS_WINDOW_DAYS);
  const nextBank = (bank) => list(sc.banks)
    .filter((b) => b?.bank === bank && isDate(b.date) && b.date >= today)
    .map((b) => b.date).sort()[0] ?? null;
  return {
    next_cbe: nextBank('cbe'),
    next_fed: nextBank('fed'),
    window_days: EVENTS_WINDOW_DAYS,
    events: list(sc.events)
      .filter((e) => obj(e) && isDate(e.date) && e.date >= today && e.date <= end)
      .filter((e) => typeof e.kind === 'string' && EVENT_KINDS.test(e.kind))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(0, EVENTS_MAX)
      .map((e) => ({ date: e.date, ticker: txt(e.ticker, TICKER_MAX), kind: txt(e.kind), label: txt(e.label) })),
  };
}
