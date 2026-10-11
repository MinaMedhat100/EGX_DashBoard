import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLive, rateLimitNotice } from '../routes/refresh.js';

const pos = (ticker, extra = {}) => ({
  ticker, is_liquid: true, shares: 100, avg_cost: 10, stop_loss: 9, t1_price: 11, t2_price: 12, ...extra,
});
const fresh = { price: 10.5, daily_change_pct: 1, adx: 30, plus_di: 25, minus_di: 15, rsi: 55 };

test('applyLive updates priced tickers, skips errors, and bumps last_refresh only when something updated', () => {
  const data = { positions: [pos('BRKT'), pos('CLSC', { live_price: 9.9 })], last_refresh: 'OLD' };
  const n = applyLive(data, { BRKT: fresh, CLSC: { error: 'tradingview_rate_limited' } });
  assert.equal(n, 1);
  assert.equal(data.positions[0].live_price, 10.5);
  assert.equal(data.positions[1].live_price, 9.9); // last good price kept
  assert.notEqual(data.last_refresh, 'OLD');

  const stale = { positions: [pos('CLSC', { live_price: 9.9 })], last_refresh: 'OLD' };
  assert.equal(applyLive(stale, { CLSC: { error: 'tradingview_rate_limited' }, _rate_limited: { retry_after_s: 42 } }), 0);
  assert.equal(stale.last_refresh, 'OLD'); // nothing refreshed: don't claim we did
});

test('rateLimitNotice reads the bridge flag', () => {
  assert.deepEqual(rateLimitNotice({ BRKT: fresh, _rate_limited: { retry_after_s: 42 } }),
    { reason: 'tradingview_rate_limited', retry_after_s: 42 });
  assert.equal(rateLimitNotice({ BRKT: fresh }), null);
  assert.equal(rateLimitNotice(null), null);
});
