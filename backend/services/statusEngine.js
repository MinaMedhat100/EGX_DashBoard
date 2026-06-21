// statusEngine.js — strategy-aware status + alerts (the deterministic engine).
// Mirrors prompt.md's evaluateStatus() + alert/THNDR_ACTION logic. Owns nothing the AI owns.

export function evaluateStatus(position, live) {
  const { adx, plus_di, minus_di, price } = live;
  if ([adx, plus_di, minus_di, price].some((v) => v == null)) {
    return position.status_key; // not enough live data -> keep existing
  }
  const diGap = plus_di - minus_di;
  const t1 = position.t1_price;
  const pctToT1 = t1 > 0 ? ((t1 - price) / price) * 100 : Infinity;
  const stop = position.stop_loss;

  // Stop breached -> red (both 50% and 100% sub-cases are still 'red' per spec)
  if (stop > 0 && price < stop) return 'red';

  // T1 zone
  if (pctToT1 <= 2 && adx > 40 && diGap > 5) return 'green';
  if (pctToT1 <= 4 && adx > 40 && diGap > 3) return 'orange_hot';

  // Normal hold
  if (adx >= 40 && plus_di > minus_di) return 'yellow';
  if (adx < 25) return 'red';
  return 'yellow';
}

export function buildAlert(position, live, status, prev) {
  if (live.price == null) return null;
  const { price, plus_di, minus_di, adx } = live;
  const stop = position.stop_loss;
  const t1 = position.t1_price;
  const half = Math.round(position.shares / 2);
  const flags = [];

  if (stop > 0 && price < stop) flags.push('STOP_BREACH');
  const pctToT1 = t1 > 0 ? ((t1 - price) / price) * 100 : null;
  if (pctToT1 != null && pctToT1 <= 2) flags.push('T1_IMMINENT');
  if (
    prev && prev.plus_di != null && prev.minus_di != null &&
    prev.plus_di > prev.minus_di && minus_di >= plus_di
  ) {
    flags.push('CROSSOVER');
  }

  // THNDR action text (the one active order to set in Thndr)
  const htfBullish = live.mtf ? live.mtf.higher_tf_bullish : null;
  let thndr = null;
  if (status === 'red') {
    if (stop > 0 && price < stop) {
      if (adx < 40) thndr = 'EXIT 100% at market (no trend)';
      else if (minus_di > plus_di) thndr = 'EXIT 100% at market (trend reversed)';
      // ADX>40 + +DI>-DI -> 50% rule, BUT only if higher timeframe still bullish
      else if (htfBullish === false) thndr = 'EXIT 100% at market — higher TF (W/D) turned';
      else thndr = `EXIT 50% (${half}sh) at market — keep runner`;
    } else {
      thndr = adx != null && adx < 25 ? 'EXIT 100% at market (no trend)' : 'EXIT at market';
    }
  } else if (status === 'green') {
    thndr = `Switch to LIMIT SELL ${half}sh @ ${t1}`;
  } else if (status === 'orange_hot') {
    thndr = `Prepare LIMIT SELL ${half}sh @ ${t1}`;
  } else if (status === 'yellow') {
    thndr = stop > 0 ? `Hold — keep stop @ ${stop}` : 'Hold';
  }

  if (!flags.length && !thndr) return null;
  return { flags, thndr_action: thndr, severity: status };
}

// Exit-framework tooltip text for RED positions (per prompt.md constraints + W/D check).
export function exitFramework(live) {
  if (!live || live.adx == null) return null;
  if (live.adx < 40) return 'EXIT 100% (no trend)';
  if (live.minus_di > live.plus_di) return 'EXIT 100% (trend reversed)';
  if (live.mtf && live.mtf.higher_tf_bullish === false) return 'EXIT 100% (higher TF W/D turned)';
  return 'EXIT 50% — keep runner';
}
