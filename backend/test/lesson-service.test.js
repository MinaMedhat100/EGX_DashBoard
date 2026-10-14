import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLessons, FLAG_AT } from '../services/lessonService.js';

let n = 0;
function reviewed(category, verdict, pnl, { stage = 'entry', evidence = {} } = {}) {
  n++;
  return {
    trade_id: `T${n}`, ticker: `TK${n}`, status: 'closed', closed_at: `2026-09-${String(n).padStart(2, '0')}`,
    exit: { realized_pnl: pnl }, events: [],
    postmortem: { status: 'done', evidence, result: { verdict, stage, lesson: { category, text: `lesson ${n}` } } },
  };
}

test('problem verdicts count; others are "also seen"; flag at 3; winners from P&L', () => {
  const j = { trades: [
    reviewed('stop_placement', 'process_error', -100),
    reviewed('stop_placement', 'user_deviation', 50, { stage: 'management' }),
    reviewed('stop_placement', 'process_error', -30),
    reviewed('stop_placement', 'good_process', 400),
    reviewed('entry_timing', 'process_error', -10),
    reviewed('missing_data', 'missing_data', -5),
  ] };
  const L = buildLessons(j);
  assert.equal(L.flag_at, FLAG_AT);
  const sp = L.categories[0];
  assert.equal(sp.category, 'stop_placement');
  assert.equal(sp.count, 3);
  assert.equal(sp.flagged, true);
  assert.equal(sp.winners, 1);
  assert.deepEqual(sp.stages, { entry: 2, management: 1, exit: 0, none: 0 });
  assert.deepEqual(sp.also_seen.map((r) => r.verdict), ['good_process']);
  assert.deepEqual(sp.problems[0], { trade_id: sp.problems[0].trade_id, ticker: sp.problems[0].ticker, closed_at: sp.problems[0].closed_at, verdict: 'process_error', stage: 'entry', pnl: -100, lesson: sp.problems[0].lesson });
  assert.deepEqual(L.categories.map((c) => [c.category, c.count, c.flagged]),
    [['stop_placement', 3, true], ['entry_timing', 1, false], ['missing_data', 0, false]]);
});

test('categories with nothing are omitted; "none" is never a category', () => {
  const L = buildLessons({ trades: [reviewed('none', 'good_process', 10)] });
  assert.deepEqual(L.categories, []);
});

test('measured: stop inside noise from recorded stop, bracket minimum, or the stop-out fill', () => {
  const ev = (entry, after) => ({ entry, after });
  const j = { trades: [
    reviewed('none', 'normal_variance', -1, { evidence: ev({ stop_atr: 0.6 }, { recovered_to_entry: true, sessions_to_recover: 2 }) }),
    reviewed('none', 'normal_variance', -1, { evidence: ev({ stop_atr: { A: 2, B: 0.4 } }, { recovered_to_entry: false }) }),
    reviewed('none', 'normal_variance', -1, { evidence: ev({ stop_atr: { unknown: 'x' }, stop_atr_from_fill: 1.2 }, { unknown: 'only 4 sessions' }) }),
    reviewed('none', 'normal_variance', -1, { evidence: ev({ stop_atr: 2.5 }, {}) }),
    reviewed('none', 'good_process', 5, { evidence: ev({ stop_atr_from_fill: -1.9 }, {}) }), // trailed above entry
    reviewed('none', 'normal_variance', -1, { evidence: ev({ stop_atr: { unknown: 'x' }, stop_atr_from_fill: { unknown: 'y' } }, {}) }),
  ] };
  const m = buildLessons(j).measured.stop_inside_noise;
  assert.equal(m.checked, 5);
  assert.equal(m.inside, 3);
  assert.equal(m.recovered, 1);
  assert.deepEqual(m.trades.map((t) => [t.stop_atr, t.recovered, t.sessions]), [[0.6, true, 2], [0.4, false, null], [1.2, false, null]]);
});

test('coverage buckets over closed trades', () => {
  const st = (s) => ({ trade_id: s, status: 'closed', events: [], ...(s === 'none' ? {} : { postmortem: { status: s } }) });
  const L = buildLessons({ trades: [st('done'), st('waiting'), st('running'), st('failed'), st('no_bars'), st('none'), { trade_id: 'o', status: 'open', events: [] }] });
  assert.deepEqual(L.coverage, { closed: 6, reviewed: 1, waiting: 2, failed: 2, unreviewed: 1 });
});
