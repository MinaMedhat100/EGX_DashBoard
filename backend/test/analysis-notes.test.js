import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOrder } from '../services/orderService.js';
import { normalize, LEGACY_NEW_POSITION_NOTE } from '../services/portfolioStore.js';

function emptyData() {
  return { positions: [], action_log: [], exited_positions: [], realized_pnl: 0 };
}

test('BUY_NEW without a note leaves analysis_notes empty (no stale placeholder)', () => {
  const data = emptyData();
  applyOrder(data, { type: 'BUY_NEW', ticker: 'sdti', shares: 100, price: 12.5, date: '2026-07-01' });
  assert.equal(data.positions[0].analysis_notes, '');
});

test('BUY_NEW keeps a note the user actually typed', () => {
  const data = emptyData();
  applyOrder(data, {
    type: 'BUY_NEW', ticker: 'sdti', shares: 100, price: 12.5, date: '2026-07-01',
    notes: 'breakout retest',
  });
  assert.equal(data.positions[0].analysis_notes, 'breakout retest');
});

test('normalize clears the legacy "pending first refresh" placeholder', () => {
  const data = { positions: [{ ticker: 'SDTI', analysis_notes: LEGACY_NEW_POSITION_NOTE }] };
  normalize(data);
  assert.equal(data.positions[0].analysis_notes, '');
});

test('normalize leaves a real analysis note untouched', () => {
  const data = { positions: [{ ticker: 'CANA', analysis_notes: 'held since Feb, trend intact' }] };
  normalize(data);
  assert.equal(data.positions[0].analysis_notes, 'held since Feb, trend intact');
});
