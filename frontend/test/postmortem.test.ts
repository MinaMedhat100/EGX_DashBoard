import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verdictTone, chipText, evidenceLines, noteNewerThanRun } from '../src/lib/postmortem.ts';

test('verdictTone', () => {
  assert.equal(verdictTone('good_process'), 'green');
  assert.equal(verdictTone('normal_variance'), 'green');
  assert.equal(verdictTone('user_deviation'), 'yellow');
  assert.equal(verdictTone('process_error'), 'red');
  assert.equal(verdictTone('missing_data'), 'grey');
});

const base = { stage: null, category: null, due_estimate: null, auto: true } as const;
test('chipText per status', () => {
  assert.deepEqual(chipText({ ...base, status: 'done', verdict: 'process_error' } as any), { text: 'process error', tone: 'red' });
  assert.deepEqual(chipText({ ...base, status: 'waiting', verdict: null, due_estimate: '2026-10-05' } as any), { text: 'due ~10-05', tone: 'grey' });
  assert.deepEqual(chipText({ ...base, status: null, verdict: null, due_estimate: null } as any), { text: 'due ~soon', tone: 'grey' });
  assert.deepEqual(chipText({ ...base, status: null, verdict: null, auto: false } as any), null);
  assert.deepEqual(chipText({ ...base, status: 'running', verdict: null } as any), { text: 'running…', tone: 'grey' });
  assert.deepEqual(chipText({ ...base, status: 'failed', verdict: null } as any), { text: 'post-mortem failed', tone: 'grey' });
  assert.deepEqual(chipText({ ...base, status: 'no_bars', verdict: null } as any), { text: 'no price history', tone: 'grey' });
});

test('evidenceLines: plain labels, unknowns spelled out', () => {
  const lines = evidenceLines({
    entry: { atr: 0.42, stop_atr: { A: 0.5, B: 1 }, ema20_atr: { unknown: 'no EMA20 or ATR at entry' } },
    after: { unknown: 'only 4 sessions after the exit so far' },
  });
  assert.ok(lines.includes('ATR at entry: 0.42'));
  assert.ok(lines.includes('Stop distance (ATR): A 0.5 · B 1'));
  assert.ok(lines.includes('Entry above EMA20 (ATR): unknown — no EMA20 or ATR at entry'));
  assert.ok(lines.includes('After the exit: unknown — only 4 sessions after the exit so far'));
});

test('noteNewerThanRun', () => {
  assert.equal(noteNewerThanRun({ text: 'x', at: '2026-10-02T00:00:00Z' }, { status: 'done', ran_at: '2026-10-01T00:00:00Z' }), true);
  assert.equal(noteNewerThanRun({ text: 'x', at: '2026-09-30T00:00:00Z' }, { status: 'done', ran_at: '2026-10-01T00:00:00Z' }), false);
  assert.equal(noteNewerThanRun(undefined, { status: 'done', ran_at: '2026-10-01T00:00:00Z' }), false);
});
