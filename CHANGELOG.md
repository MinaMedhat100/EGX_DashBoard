# Changelog

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
