# Changelog

## 1.2.0

**Multi-timeframe analysis** (W/D/4H/1H/15m via `multi_timeframe_analysis`)
- Refresh now pulls multi-timeframe bias for each liquid position; scan pulls it for the
  candidates that pass the filter so the AI ranks with weekly confirmation.
- The higher-timeframe trend is wired into the exit framework — the 50%-vs-100% rule now
  escalates to a full exit when weekly/daily is no longer bullish (it can finally evaluate
  its own "W/D still bullish" condition).
- A compact W↑D↑ alignment badge on position and opportunity cards (full per-TF detail on hover).
- The AI analyst receives the `mtf` summary and is told the weekly sets bias.

**R-multiples** (no capital/position-sizing needed)
- Opportunity cards show targets in R (T1/T2) and 1R in EGP/share; position cards show live
  unrealized in R, distance-to-stop in R, and a volatility chip (Bollinger-width based, since
  ATR is unavailable for EGX). The AI also reasons in R.

**News fixed** — replaced the broken yahoo-finance2 path (that version exposes no `search`
method, so news always returned empty) with auth-free Google News RSS, which returns real EGX
headlines by company name.

**Robustness** — the scan now degrades gracefully when the screener returns no data (e.g.
pre-market) instead of failing with a 503, and reports a clear note in the UI.

_Note: volume confirmation was evaluated and deferred — no reliable EGX volume baseline exists
in the available data sources (TradingView returns a 0 baseline; Yahoo rate-limits)._

## 1.1.0

**T1/T2-filled awareness**
- Logging a T1/T2 sell now records the fill price + date, relabels the position a "runner",
  and (via a default-on checkbox in the Log Order modal) raises the stop to break-even.
- Position cards show a "T1 ✓ FILLED" / "T2 ✓ FILLED" chip, and the price-range bar marks
  filled targets.
- The AI analyst now receives `t1_hit` / `t2_hit` / `stop_raised` / fill price and a derived
  `phase`, with runner-management guidance — so it reasons about break-even stops, holding for
  T2, and whether a pullback is an add ("scale in on strength") or just a hold.
- Existing portfolio data is upgraded non-destructively on load (no regeneration needed).

**Opportunity scan history**
- Every scan run is saved (last 50) to `backend/data/scan_history.json`.
- A "Past runs" selector in the Opportunities tab lets you reopen any previous run read-only,
  or jump back to a live scan. Includes a "Clear history" action.
- New endpoints: `GET /api/scan-history`, `GET /api/scan-history/:id`, `DELETE /api/scan-history`.

## 1.0.0

Initial release — three-service EGX swing-trading dashboard (FastAPI MCP bridge, Express
backend with headless-Claude AI analyst, React/Vite frontend), order logging with FIFO,
History tab, and the `start-dashboard.bat` launcher.
