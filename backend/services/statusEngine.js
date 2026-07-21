// statusEngine.js — strategy-aware status + the single Thndr action per position.
// v1.5.1: target-aware. One classifier (classifyPosition) is the source of truth for
// {status, action}; evaluateStatus (status_key) and buildAlert (thndr_action) both use it,
// so colour and action can never drift. State is chosen by the next unbooked target.

// The first target not yet booked.
function nextTarget(position) {
  if (!position.t1_hit) return 'T1';
  if (!position.t2_hit) return 'T2';
  return 'none';
}

function plainHold(adx, stop) {
  if (adx < 25) return { status: 'red', action: 'EXIT 100% at market (no trend)' };
  return { status: 'yellow', action: stop > 0 ? `Hold — keep stop @ ${stop}` : 'Hold' };
}

function runnerHold(position, adx, stop) {
  if (adx < 25) return { status: 'red', action: 'EXIT 100% at market (no trend)' };
  if (!position.stop_raised && position.avg_cost > 0) {
    return { status: 'yellow', action: `Raise stop to break-even (${position.avg_cost})` };
  }
  return { status: 'yellow', action: stop > 0 ? `Hold runner toward T2 — keep stop @ ${stop}` : 'Hold runner' };
}

// classifyPosition -> {status, action} | null (null when live momentum data is insufficient).
export function classifyPosition(position, live) {
  const { adx, plus_di, minus_di, price } = live;
  if ([adx, plus_di, minus_di, price].some((v) => v == null)) return null;

  const diGap = plus_di - minus_di;
  const stop = position.stop_loss;
  const half = Math.round(position.shares / 2);
  const rem = position.shares;
  const htfBullish = live.mtf ? live.mtf.higher_tf_bullish : null;
  const pctTo = (x) => ((x - price) / price) * 100;

  // 1) Stop breach — highest priority (unchanged RED framework).
  if (stop > 0 && price < stop) {
    let action;
    if (adx < 40) action = 'EXIT 100% at market (no trend)';
    else if (minus_di > plus_di) action = 'EXIT 100% at market (trend reversed)';
    else if (htfBullish === false) action = 'EXIT 100% at market — higher TF (W/D) turned';
    else action = `EXIT 50% (${half}sh) at market — keep runner`;
    return { status: 'red', action };
  }

  const target = nextTarget(position);

  // 2) Next target = T1 (not yet filled).
  if (target === 'T1' && position.t1_price > 0) {
    const t1 = position.t1_price;
    if (price >= t1) return { status: 'green', action: `T1 reached — sell ${half}sh now` };
    const pct = pctTo(t1);
    if (pct <= 2 && adx > 40 && diGap > 5) return { status: 'green', action: `Switch to LIMIT SELL ${half}sh @ ${t1}` };
    if (pct <= 4 && adx > 40 && diGap > 3) return { status: 'orange_hot', action: `Prepare LIMIT SELL ${half}sh @ ${t1}` };
    return plainHold(adx, stop);
  }

  // 3) Next target = T2 (T1 filled — runner).
  if (target === 'T2' && position.t2_price > 0) {
    const t2 = position.t2_price;
    if (price >= t2) {
      if (htfBullish === true) return { status: 'yellow', action: 'T2 reached — trail stop below recent swing, keep runner' };
      return { status: 'green', action: `T2 reached — sell remaining ${rem}sh now` };
    }
    const pct = pctTo(t2);
    if (pct <= 2 && adx > 40 && diGap > 5) return { status: 'green', action: `Switch to LIMIT SELL ${rem}sh @ ${t2}` };
    if (pct <= 4 && adx > 40 && diGap > 3) return { status: 'orange_hot', action: `Prepare LIMIT SELL ${rem}sh @ ${t2}` };
    return runnerHold(position, adx, stop);
  }

  // 4) Runner heading to T2 but T2 not set -> runner-hold leaf.
  if (target === 'T2') return runnerHold(position, adx, stop);

  // 5) Both targets filled -> trailing runner.
  if (target === 'none') {
    if (adx < 25) return { status: 'red', action: 'EXIT 100% at market (no trend)' };
    return { status: 'yellow', action: stop > 0 ? `Trailing runner — keep stop @ ${stop}` : 'Trailing runner' };
  }

  // 6) T1 is next but T1 price not set -> plain hold leaf.
  return plainHold(adx, stop);
}

export function evaluateStatus(position, live) {
  const c = classifyPosition(position, live);
  return c ? c.status : position.status_key; // insufficient live data -> keep existing
}

export function buildAlert(position, live, status, prev) {
  if (live.price == null) return null;
  const { price, plus_di, minus_di } = live;
  const stop = position.stop_loss;
  const flags = [];

  if (stop > 0 && price < stop) flags.push('STOP_BREACH');

  // Next-target imminent (<=2%), measured vs the next UNBOOKED target (respects t1_hit/t2_hit).
  const target = nextTarget(position);
  const tgtPrice = target === 'T1' ? position.t1_price : target === 'T2' ? position.t2_price : 0;
  if (tgtPrice > 0 && ((tgtPrice - price) / price) * 100 <= 2) flags.push('TARGET_IMMINENT');

  if (
    prev && prev.plus_di != null && prev.minus_di != null &&
    prev.plus_di > prev.minus_di && minus_di >= plus_di
  ) {
    flags.push('CROSSOVER');
  }

  const c = classifyPosition(position, live);
  let thndr = c ? c.action : null;
  // A stop breach must always carry an action, even when momentum data (adx/DI) is missing
  // and classifyPosition returns null — restores the pre-refactor behavior for that edge case.
  if (thndr == null && flags.includes('STOP_BREACH')) thndr = 'EXIT — stop breached';

  if (!flags.length && !thndr) return null;
  return { flags, thndr_action: thndr, severity: status };
}

// Exit-framework tooltip text for RED positions (unchanged).
export function exitFramework(live) {
  if (!live || live.adx == null) return null;
  if (live.adx < 40) return 'EXIT 100% (no trend)';
  if (live.minus_di > live.plus_di) return 'EXIT 100% (trend reversed)';
  if (live.mtf && live.mtf.higher_tf_bullish === false) return 'EXIT 100% (higher TF W/D turned)';
  return 'EXIT 50% — keep runner';
}
