import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventDay, orderTimeline, loggedLateDays, readAfterClose } from '../src/lib/journalOrder.ts';

// Neutral fixtures — minimal event shapes, cast for the helpers under test.
const read = (at: string, analyzed_at?: string) => ({ kind: 'ai_read', at, analyzed_at }) as any;
const order = (date: string, at: string) => ({ kind: 'order', date, at }) as any;
const levels = (at: string) => ({ kind: 'levels', at }) as any;

test('eventDay: reads use the analysis time, orders their trade date, the rest the save time', () => {
  assert.equal(eventDay(read('2026-09-28T08:49:34Z', '2026-09-21T00:01:16Z')), '2026-09-21');
  assert.equal(eventDay(read('2026-09-28T08:49:34Z')), '2026-09-28');
  assert.equal(eventDay(order('2026-09-21', '2026-10-01T13:55:03Z')), '2026-09-21');
  assert.equal(eventDay(levels('2026-09-28T08:49:34Z')), '2026-09-28');
});

test('eventDay: a legacy text date is parsed; an unparseable one falls back to the save time', () => {
  assert.equal(eventDay(order('Jun 10, 2026', '2026-06-10T12:00:00Z')), '2026-06-10');
  assert.equal(eventDay(order('~May–Jun 2026', '2026-06-01T12:00:00Z')), '2026-06-01');
});

test('orderTimeline sorts by when things happened, keeping save order within a day', () => {
  const evs = [
    order('2026-09-16', '2026-09-16T12:00:00Z'),
    read('2026-09-28T08:49:34Z', '2026-09-21T00:01:16Z'),
    levels('2026-09-28T08:49:34Z'),
    read('2026-09-28T08:53:22Z', '2026-09-28T08:53:22Z'),
    order('2026-09-21', '2026-10-01T13:55:03Z'),
    order('2026-09-21', '2026-10-01T13:55:03Z'),
  ];
  assert.deepEqual(orderTimeline(evs).map((e) => evs.indexOf(e)), [0, 1, 4, 5, 2, 3]);
  assert.equal(evs[0].kind, 'order'); // input untouched
});

test('loggedLateDays: orders saved two or more days after their trade date', () => {
  assert.equal(loggedLateDays(order('2026-09-21', '2026-10-01T13:55:03Z')), 10);
  assert.equal(loggedLateDays(order('2026-09-21', '2026-09-22T21:00:00Z')), null); // next day is normal
  assert.equal(loggedLateDays(order('Jun 10, 2026', '2026-06-20T12:00:00Z')), null); // legacy text: unknown
  assert.equal(loggedLateDays(levels('2026-10-01T00:00:00Z')), null);
});

test('readAfterClose: a read analysed after the exit day', () => {
  assert.equal(readAfterClose(read('2026-09-28T08:53Z', '2026-09-28T08:53Z'), '2026-09-21'), true);
  assert.equal(readAfterClose(read('2026-09-28T08:49Z', '2026-09-21T00:01Z'), '2026-09-21'), false);
  assert.equal(readAfterClose(read('2026-09-28T08:53Z'), null), false);
  assert.equal(readAfterClose(read('2026-09-28T08:53Z'), '~May–Jun 2026'), false);
  assert.equal(readAfterClose(order('2026-09-28', '2026-09-28T00:00Z'), '2026-09-21'), false);
});
