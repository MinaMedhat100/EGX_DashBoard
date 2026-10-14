import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverageText, problemSummary, backlogText, noiseSummary } from '../src/lib/lessons.ts';

test('coverageText', () => {
  assert.equal(coverageText({ closed: 35, reviewed: 8, waiting: 0, failed: 1, unreviewed: 26 }),
    '35 closed · 8 reviewed · 26 not reviewed · 0 waiting · 1 failed');
});

test('problemSummary', () => {
  assert.equal(problemSummary({ count: 3, winners: 1 } as any), '3 problem trades (1 still made money)');
  assert.equal(problemSummary({ count: 1, winners: 0 } as any), '1 problem trade');
  assert.equal(problemSummary({ count: 0, winners: 0 } as any), 'no problem trades');
});

test('backlogText', () => {
  const b = { running: true, total: 27, done: 4, skipped: 1, failed_on: null, error: null, started_at: null, finished_at: null };
  assert.equal(backlogText(b), 'Reviewing 6 / 27…'); // 4 done + 1 skipped → the 6th is running
  assert.equal(backlogText({ ...b, running: false, done: 26, skipped: 1, finished_at: 'x' }), 'Backlog review finished: 26 reviewed, 1 skipped');
  assert.equal(backlogText({ ...b, running: false, done: 3, failed_on: 'X-1', error: 'usage limit', finished_at: 'x' }), 'Stopped after 3 reviews at X-1: usage limit');
  assert.equal(backlogText({ ...b, running: false, total: 0, finished_at: null }), null);
});

test('noiseSummary', () => {
  assert.equal(noiseSummary({ checked: 8, inside: 5, recovered: 3, trades: [] }),
    '5 of 8 reviewed trades had a stop under 1.5× ATR; 3 came back to the entry within 10 sessions');
  assert.equal(noiseSummary({ checked: 0, inside: 0, recovered: 0, trades: [] }), 'No reviewed trade has a known stop distance yet');
});
