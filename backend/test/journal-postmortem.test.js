import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyJournal, setNote, setPostmortem, isAutoEligible, dueEstimate, postmortemSummary } from '../services/journalService.js';

const AT = '2026-10-01T10:00:00.000Z';
const closed = (id, orderAt, exitDate = '2026-09-21') => ({
  trade_id: id, ticker: 'BRKT', status: 'closed', events: [{ kind: 'order', type: 'STOP_OUT', date: exitDate, at: orderAt }],
  exit: { date: exitDate, price: 9, type: 'STOP-OUT' },
});

test('setNote trims to 280, empty deletes, missing trade → undefined', () => {
  const j = emptyJournal();
  j.trades.push(closed('BRKT-1', AT));
  assert.deepEqual(setNote(j, 'BRKT-1', '  stop was not active  ', AT), { text: 'stop was not active', at: AT });
  assert.equal(setNote(j, 'BRKT-1', 'x'.repeat(300), AT).text.length, 280);
  assert.equal(setNote(j, 'BRKT-1', '   ', AT), null);
  assert.equal(j.trades[0].note, undefined);
  assert.equal(setNote(j, 'NOPE', 'x', AT), undefined);
});

test('setPostmortem merges into the record', () => {
  const j = emptyJournal();
  j.trades.push(closed('BRKT-1', AT));
  setPostmortem(j, 'BRKT-1', { status: 'waiting', due_estimate: '2026-10-05' });
  const pm = setPostmortem(j, 'BRKT-1', { status: 'running' });
  assert.deepEqual(pm, { status: 'running', due_estimate: '2026-10-05' });
});

test('isAutoEligible: closed, ISO exit, closing order saved after the journal went live', () => {
  assert.equal(isAutoEligible(closed('A', '2026-10-01T13:55:03.576Z')), true);
  assert.equal(isAutoEligible(closed('B', '2026-06-14T12:00:00.000Z', '2026-06-14')), false); // rebuilt
  assert.equal(isAutoEligible({ ...closed('C', AT), status: 'open' }), false);
  assert.equal(isAutoEligible(closed('D', AT, '~May–Jun 2026')), false);
});

test('dueEstimate = exit + 14 days', () => {
  assert.equal(dueEstimate('2026-09-21'), '2026-10-05');
  assert.equal(dueEstimate('undated'), null);
});

test('postmortemSummary: closed trades only, with auto flag and verdict', () => {
  const j = emptyJournal();
  j.trades.push(closed('A', AT), closed('B', '2026-06-14T12:00:00.000Z', '2026-06-14'), { trade_id: 'O', status: 'open', events: [] }, closed('N', AT));
  setPostmortem(j, 'A', { status: 'done', result: { verdict: 'good_process', stage: 'none', lesson: { category: 'none' } } });
  const s = postmortemSummary(j);
  assert.deepEqual(Object.keys(s).sort(), ['A', 'B', 'N']);
  assert.equal(s.N.due_estimate, '2026-10-05'); // auto-eligible, not checked yet → estimate from the exit
  assert.deepEqual(s.A, { status: 'done', verdict: 'good_process', stage: 'none', category: 'none', due_estimate: null, auto: true });
  assert.deepEqual(s.B, { status: null, verdict: null, stage: null, category: null, due_estimate: null, auto: false });
});
