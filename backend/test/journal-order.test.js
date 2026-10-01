import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventDay, orderTimeline, loggedLateDays, readAfterClose } from '../services/journalOrder.js';

const read = (at, analyzed_at) => ({ kind: 'ai_read', at, analyzed_at });
const order = (date, at) => ({ kind: 'order', date, at });
const levels = (at) => ({ kind: 'levels', at });

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
});

test('loggedLateDays and readAfterClose', () => {
  assert.equal(loggedLateDays(order('2026-09-21', '2026-10-01T13:55:03Z')), 10);
  assert.equal(loggedLateDays(order('2026-09-21', '2026-09-22T21:00:00Z')), null);
  assert.equal(loggedLateDays(order('Jun 10, 2026', '2026-06-20T12:00:00Z')), null);
  assert.equal(readAfterClose(read('2026-09-28T08:53Z', '2026-09-28T08:53Z'), '2026-09-21'), true);
  assert.equal(readAfterClose(read('2026-09-28T08:49Z', '2026-09-21T00:01Z'), '2026-09-21'), false);
  assert.equal(readAfterClose(read('2026-09-28T08:53Z'), '~May–Jun 2026'), false);
});
