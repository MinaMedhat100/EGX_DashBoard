// portfolioStats.js — deterministic book-level aggregates (no account size needed).
const r2 = (n) => Math.round(n * 100) / 100;

export function portfolioStats(positions) {
  const ps = positions || [];
  let invested = 0;
  let unrealized = 0;
  let open_risk_egp = 0;
  const unprotected = [];
  let largest = null;
  for (const p of ps) {
    const exposure = (p.avg_cost || 0) * (p.shares || 0);
    invested += exposure;
    unrealized += p.unrealized_pnl ?? 0;
    if (p.is_liquid) {
      if (p.brackets) {
        const open = p.brackets.lots.filter((l) => !l.tp_hit && !l.stopped);
        let anyUnprotected = false;
        for (const l of open) {
          if (l.stop > 0) open_risk_egp += Math.max(0, p.avg_cost - l.stop) * l.shares;
          else anyUnprotected = true;
        }
        if (anyUnprotected) unprotected.push(p.ticker);
      } else if (p.stop_loss > 0) {
        open_risk_egp += Math.max(0, p.avg_cost - p.stop_loss) * p.shares;
      } else {
        unprotected.push(p.ticker);
      }
    }
    if (!largest || exposure > largest.exposure) largest = { ticker: p.ticker, exposure };
  }
  invested = r2(invested);
  return {
    invested,
    unrealized: r2(unrealized),
    open_risk_egp: r2(open_risk_egp),
    unprotected,
    largest: largest
      ? { ticker: largest.ticker, exposure: r2(largest.exposure), pct: invested > 0 ? r2((largest.exposure / invested) * 100) : 0 }
      : null,
    count: ps.length,
  };
}
