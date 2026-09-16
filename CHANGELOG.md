# Changelog

## 2.5.0

**The scan remembers what it said last time.** Each candidate now reaches the AI with its own
previous read — score, conviction, ADX/+DI/RSI, the entry zone it proposed, how long ago, and how
many past scans the name has appeared in. The prompt states the rule the post-mortems asked for:
if score or conviction is rising while +DI, RSI or ADX are falling, that is fading momentum, and
conviction goes *down*. Cards show a ↘ fading or ↗ improving chip.

**Deterministic overextension flags.** The bridge now keeps the candle wicks, the prior RSI, the
pullback entry and the weekly RSI it was already fetching and throwing away, and computes six
flags: weekly RSI ≥ 75, daily RSI ≥ 68, price ≥ 2× daily ATR above EMA20 (or ≥ 12%), an upper wick
≥ 40% on a body ≤ 40%, ADX ≥ 50, and an entry zone that rose with price since the last scan until
it reached price. One flag caps AI conviction at 3, two or more at 2. The extension check is
ATR-relative on purpose: 9% above the EMA20 is two ordinary days for a 5%-ATR name and five for a
1.8%-ATR one.

**An entry zone can now sit below the live price.** The deterministic baseline used to end the zone
*at* the price, so "wait for a pullback" and "buy now" were the same instruction no matter how
extended the stock was. When a candidate is flagged, the zone anchors to a real pullback level
below price instead, and the stop is clamped under the zone top so a lowered entry can never invert
risk. Cards and the Log window show the AI's wait-for condition with the board's own numbers.

**The Log window shows what an entry risks.** Shares × (entry − stop) in EGP, as a percentage of
the entry, and as a share of current book open risk — advisory only, nothing is blocked.

**Opportunity cards show the live price**, and stale news no longer reaches the AI: prompts see
only the last 30 days (a 431-day-old headline had been arriving as a "catalyst"), while the news
panels still show everything. A failed news lookup is now distinguishable from a quiet news week.

**Fixed: on a scan where nothing passed the momentum filter, the per-ticker attachments silently
missed.** The map was built from the filtered candidate list while the AI was ranking the unfiltered
one, so multi-timeframe data never reached those cards.

## 2.4.0

**Stops that respect volatility — and a guard on the AI's stop suggestions.** From the SPIN
post-mortem: the AI trailed a stop below the entry, before T1, inside one day's normal range, and the
position was stopped out on noise.
- **The AI now sees ATR.** The bridge passes TradingView's daily ATR (and ATR as a % of price) to every
  analysis. Scans keep stops at least 1.5× ATR below entry, and the baseline levels used when the AI is
  unavailable do the same (still capped at 10%).
- **A guard on AI stop suggestions for held positions.** A Refresh no longer offers a stop that moves
  down, sits at or above the price, raises below your entry before T1, or lands within 1.5× ATR of the
  price — raising to break-even after T1 is always allowed, and a position with no stop can still get
  its first one. A held-back suggestion is left out of the Apply chip (target changes still come
  through), the AI panel shows **"⚠ Held back: …"** with the reason, and the next Refresh tells the AI
  what was held back. Your own manual stop edits are never blocked.

## 2.3.2

**Opportunities now say *why* the AI ranking is unavailable.** When the AI step failed, the scan
quietly fell back to screener-score order and every card read "AI analysis unavailable" — an expired
Claude login, a timeout, and an unreadable reply all looked the same. The page now shows an orange
notice with the actual cause (e.g. *"Claude CLI is not logged in — run `claude` in a terminal, then
/login"*), each fallback card carries the reason, the backend logs the error, and saved runs keep it.
Applies to market and watchlist scans.

**STOP-OUT opens with the stop already filled in.** Logging a STOP-OUT on a held position pre-fills
Price with its resting stop — a classic position's stop, or the selected lot's stop on a bracket
(following A / B as you switch; ALL uses the stop the open lots share). The label marks it as
*current stop*. A price you type is never overwritten, switching away from STOP-OUT clears an
auto-filled stop so a SELL can't inherit it, and a position with no stop leaves Price empty.

**Sidebar note updated.** The old single-rule Thndr note is now a short legend of both position
styles: **Classic** (one Thndr order per stock — stop-loss OR limit sell) and **Bracket** (ThndrX two
lots, A→T1 and B→T2, each with its own stop + take-profit).

## 2.3.1

**Open the dashboard from your phone on the same network.** The Vite dev server now binds all
interfaces (`host: true`), so `npm run dev` prints a Network URL — browse to `http://<pc-ip>:5173`
from a phone on the same Wi-Fi. Only the frontend is exposed: the app fetches relative `/api` paths
which Vite proxies locally to Express on 3001, and the FastAPI bridge stays on 127.0.0.1, so neither
needs to face the network. Windows Firewall must allow inbound TCP 5173 on the Private profile.

Note that the dashboard has **no authentication** — anyone on that network can read the book and log
orders. Fine on a trusted home network; think twice on a shared one.

**Fixed: a compiled `vite.config.js` was silently shadowing `vite.config.ts`.** Stale `tsc` output
(`frontend/vite.config.js` + `.d.ts`) sat beside the real config, and Vite resolves `.js` *before*
`.ts` — so the dev server had been reading a months-old copy and every edit to `vite.config.ts` was
ignored. The two happened to agree, so nothing broke visibly, but the next config change would have.
`tsconfig.node.json` now emits to `node_modules/.tmp/config` (`outDir` + `tsBuildInfoFile`) instead
of beside the source, so the shadowing can't come back on the next build.

## 2.3.0

**The price range bar is back on bracket cards.** Two-lot bracket positions previously showed only
two text chips — the visual bar was skipped entirely. They now draw the same bar as classic cards,
on a shared renderer, with lot-aware markers:
- **`SL · AVG · NOW · T1·A · T2·B`** on one price axis. The stop marker comes from the lots still
  resting in ThndrX, so a settled lot's stop drops off; while the open lots agree it's a single `SL`,
  and if they ever diverge it splits into `SL·A` / `SL·B`.
- **The dashed "path to target" now follows the open lot.** After Lot A banks, the dashes run
  NOW → T2 instead of staying stuck on a target you already took. (The classic bar hardcoded T1.)
- **Filled targets stay visible** — a banked lot shows a green ✓ dot, a stopped lot keeps its target
  marked `✗` at low opacity so you can still see the level it never reached.
- Lot chips are kept underneath for shares and state; a settled lot now shows its **exit fill**
  instead of the stale stop/TP it no longer has. Chips still render when there's no live price.

## 2.2.1

**Bracket SELL modal — remove the redundant Target toggle.** On a two-lot bracket position, the SELL
order modal was showing both the Lot picker (A / B / ALL) and a T1 / T2 Target toggle. The lot already
encodes the target (Lot A → T1, Lot B → T2) and the backend ignores `target` for brackets entirely, so
the toggle was dead, contradictory UI. It's now hidden whenever the lot picker is shown (classic SELL is
unchanged), and the ignored `target` field is no longer sent for brackets. The lot picker also spans the
full modal width so its three buttons are no longer crowded beside the Price field.

## 2.2.0

**Opportunity → bracket workflow + bracket AI verification.**
- **Log from an opportunity** — each opportunity (and watchlist) card gets a **"Log this as a bracket"**
  button that opens the order modal pre-filled from the card: entry price (editable), stop / T1 / T2, and
  the AI split. You only set shares. The Classic toggle is still available.
- **The AI now verifies bracket levels** — logging a bracket triggers the per-position AI (like classic).
  It reads your placed levels and either confirms them ("levels look good") or, on a real difference,
  shows an advisory **Apply AI levels?** chip. Apply writes only to the **open lots** (the real, editable
  ThndrX orders) and re-syncs — so on later refreshes it also **manages the runner**: after Lot A fills,
  the AI can propose a trailed stop and an adjusted T2 for Lot B, which you apply after editing in ThndrX.
  (Bracket levels never get silently overwritten — the dashboard stays in sync with your resting orders.)

## 2.1.0

**Theme system — three switchable, persistent themes.** A segmented control in the sidebar footer
switches between:
- **Desk** (the new default) — a flat, modern dark "trading terminal": cool slate surfaces, hairline
  borders, and a single restrained brass accent. Data-first, no glow.
- **Paper** — a clean flat light theme (near-white canvas, white cards, calm blue accent).
- **Neon** — the original glow/gradient/glass look, kept intact.

The choice is saved and re-applied on every load (persists across reloads), and applied before first
paint so there's no flash. Built on CSS-variable design tokens: one token set drives every surface,
border, text, and accent; status colors (red/orange/green for stops, targets, P&L) stay semantic and
constant across themes, tuned for contrast on light. Numbers use tabular figures so columns align.

## 2.0.1

**Guard add-to-position on brackets.** "Add to position" (`BUY_ADD`) re-averages cost and shares
directly — which would silently desync a ThndrX bracket's lots. It's now blocked for bracketed
positions (backend rejects it; the order modal shows a note and disables submit when you pick
"BUY (add)" on a bracket). Classic positions are unaffected. A proper "add = a new independent
bracket" flow is planned as a later sub-project.

## 2.0.0

**ThndrX two-lot brackets.** A single EGX entry can now be placed and tracked as two
self-managing ThndrX brackets — Lot A (take-profit at T1) and Lot B (take-profit at T2), each
stop-protected — so the two-target plan runs itself. Retires the manual "switch the stop into a
limit-sell at T1" dance.

- **Bracket entry** — the order modal gains a *Classic / ThndrX bracket* toggle: enter total shares,
  a split (default 50/50, overridable), a shared stop, T1 and T2. Odd totals give Lot A the extra share.
- **Self-managing tracking** — each lot has its own stop and take-profit and its own fill state. Logging
  a fill is lot-aware (Lot A / Lot B / all-remaining); ThndrX's OCO is mirrored (a filled take-profit
  retires that lot's stop). Once Lot A fills, the card's guided action becomes **"raise Lot B stop to
  break-even"** instead of a manual order switch.
- **Bracket-aware everywhere** — the position card shows the two brackets and per-lot state; open-risk
  (Book Insights) sums per open lot, staying correct once Lot B's stop is raised; the status engine and
  AI narrative reason per-lot.
- **AI-recommended split on opportunities** — every opportunity and watchlist result leads with the AI's
  best split for that stock (weighted by conviction / trend strength / room to T2), shown with a reason
  and a per-lot R:R, and overridable inline.

Classic single-target positions are unchanged — bracket mode is opt-in per entry, and existing positions
stay classic.

## 1.7.1

**Fixed AI level confusion on Refresh.** Two issues where the position card showed disagreeing numbers
after a portfolio Refresh:
- **Narrative vs. suggestion.** The AI thesis could cite the *old* stored target (e.g. "T1 347 is 6.4%
  away") while its suggested-levels row proposed a *different* one (T1 337). The portfolio prompt now
  requires the thesis / action-line to reference the levels the AI is **suggesting** and to state any
  level move explicitly — no more narrating a target it isn't proposing.
- **No way to adopt new levels.** A full Refresh surfaced new AI-suggested levels but never offered the
  **Apply** chip (only the per-position refresh did), so the price bar stayed on the old levels with no
  one-click way to update. Refresh now surfaces the same "Apply AI levels?" chip whenever a level
  actually moved, so the price bar reconciles in one click.

## 1.7.0

**Portfolio-level Book Insights.** The Portfolio tab now has a book-level panel above the positions:
- **Open risk** (EGP lost if every stop hit), your **largest exposure** (% of book), and any
  **unprotected** positions (no stop) — computed live from your holdings.
- An AI **book read** (from Refresh): overall posture, sector concentration, correlated clusters, and
  the strongest / weakest holding — labeled with its analysis time. The AI infers sectors itself.

## 1.6.0

**AI now reasons with news, market regime, and memory.**
- **News grounding** — the portfolio, opportunity, and gold analyses now receive recent headlines
  (via the existing Google-News path) so the AI factors real catalysts, not just technicals. Gold
  also gets live **DXY** and **US 10-year yield**, so its macro read uses actual prints.
- **Regime aware** — the Indices tab's Risk-On/Neutral/Risk-Off regime is fed into the portfolio and
  opportunity prompts (defensive in Risk-Off), instead of being siloed in its own tab.
- **Memory** — each analysis sees its previous read and reports **vs prior: unchanged / changed**
  (with a reason), and stops churning levels on noise. Cards show a vs-prior chip and a catalyst line.

## 1.5.4

**Fat-finger entry guard.** A position whose average cost is wildly off from the live price
(≥ 5× either way — e.g. the share count typed into the price field) now shows a red warning on the
card with a **Correct entry** button. The inline editor fixes shares + average cost in place
(recording a `CORRECT` entry in the action log) instead of forcing a delete-and-re-log.

## 1.5.3

**Fix: MCP bridge crash-loop after the `mcp` SDK 2.0 release.** The TradingView MCP server
(`tradingview-mcp-server`, spawned via `uvx`) imports `mcp.server.fastmcp`, which `mcp` 2.0
removed (FastMCP 2.x is now a separate package). An unconstrained `uvx` resolve began pulling
`mcp` 2.0, so the server crash-looped with `ModuleNotFoundError: No module named
'mcp.server.fastmcp'` and every refresh/scan/analysis came back with no live data. The bridge now
pins the spawned server to `mcp<2` (`--with mcp<2`), and `mcp_bridge/requirements.txt` caps the
bridge's own `mcp` at `<2` so a dependency reinstall can't drift either.

## 1.5.2

**AI analysis now runs on Claude Opus 5.** The headless-Claude analysis layer (portfolio,
opportunities, indices, and gold) now defaults to `claude-opus-5` instead of Opus 4.8. Override
with the `ANALYSIS_MODEL` env var as before (e.g. `sonnet` for a faster/cheaper run).

## 1.5.1

**Portfolio status fixes — target-aware badges.**
- Position cards now recognize when a **target is hit or surpassed**. A position that runs past T2
  no longer shows a stale _"Hold — keep stop"_ — it reads _"T2 reached — sell remaining"_ (or, when
  the weekly/daily is still bullish, _"trail stop, keep runner"_).
- After **T1 is filled**, a pullback into the old T1 zone no longer re-suggests trimming 50% at T1
  again. The card manages the runner instead (raise stop to break-even, then hold toward T2). The
  deterministic badge and the AI notes now agree.
- **New-position copy** reworded: the stop is framed as a planning level the AI sets on the next
  refresh (not a Thndr order you must place), and a new position stays visibly "pending" if the AI
  can't set a stop instead of silently having none.

## 1.5.0

**Goldx — a tab for swing-trading gold.**
- New **Goldx** tab (under Opportunities): the AI analyzes gold (via PAXG — 1 token = 1 oz gold, full
  technicals + multi-timeframe) and its news, and finds an entry with our normal stop/T1/T2, using the
  same swing strategy as stocks with a gold-aware, macro/news-driven, fee-aware AI read.
- **Unit toggle** — view price and levels as USD/oz, USD/gram, or EGP/gram (the technicals and R are the
  same across units). The AI reasons about Thndr's 2% round-trip vs Binance's ~0.2% fees.
- **Self-contained position tracker** — log a gold buy/add/sell/stop, AI-set levels, live P&L in R and
  status, kept out of the EGX portfolio. A chip counts down to the next Thndr window (10:00/13:00/15:00).

New endpoints: bridge `GET /gold-analysis`; backend `GET /api/gold`, `POST /api/gold/analyze`,
`POST /api/gold/order`, `POST /api/gold/apply-levels`.

## 1.4.2

**Three position-card fixes.**
- **Analysis notes** no longer sticks on _"New position — pending first refresh."_ forever. The field
  was written once at position creation and never updated again, so it went stale immediately. It now
  holds only a note you actually typed when logging the order, and the section hides itself when
  empty — the AI block above it already carries the live thesis / key risk / action line. Existing
  positions are migrated on load (no regen needed).
- Removed the **expired "BAL+CCB exit by Jun 24" deadline** — both the sidebar banner and the red
  chip on the BAL/CCB position cards — plus the now-dead `deadlineDate` prop and `daysUntil` helper.
- **Price-range bar:** when two markers sat close together (e.g. STDI's AVG and T1), their labels and
  prices overlapped and neither was readable. Colliding markers are now staggered into a second
  vertical lane, and the extra vertical room is reserved only when a stagger actually happens.

## 1.4.1

**Fix: Opportunities scans intermittently returned "No data" until a bridge restart.**
When the TradingView MCP connection got throttled, the upstream handed back empty bodies
and the bridge surfaced them as a normal tool result (not an error), so the one warm
connection stayed stuck and *every* market/watchlist scan came back empty until the bridge
was manually restarted. The bridge now detects the empty-body/throttle signature and
self-heals — it reconnects and retries the call on a fresh connection (bounded), so scans
recover on their own at any time.

## 1.4.0

**Watchlist scan + EGX Indices Tracker.**
- The Opportunities tab can now scan a **saved watchlist** of specific tickers (🎯 Scan Watchlist)
  in addition to the full-market scan (🔍 Scan Market). Watchlist scans analyze **every** name you
  list (none dropped); a stock that fails the ADX/DI/RSI momentum profile is flagged with a
  `✗ momentum` badge but still ranked. Runs are saved to history tagged by mode.
- New **EGX Indices Tracker** tab (below Portfolio): EGX30 / EGX70 / EGX100 with live level, trend
  read, an AI **regime** call (Risk-On / Neutral / Risk-Off) + thesis, and an expandable drill-down
  (breadth bar, sector rotation, top gainers/losers). Manual Refresh; the latest snapshot is cached.

New endpoints: bridge `POST /scan-watchlist`, `GET /index-tracker`; backend `GET/PUT /api/watchlist`,
`POST /api/scan-watchlist`, `GET /api/indices`, `POST /api/indices/refresh`.

## 1.3.0

**AI sets position levels on Log Trade.**
- BUY (new position) no longer asks you to type the stop/T1/T2 — you log just shares + price, and
  the AI derives the stop/targets from live indicators automatically right after.
- Logging any order auto-runs a fast, **single-ticker** refresh + AI analysis (no full ~2-min
  portfolio refresh). A nudge offers a full refresh for the rest of the book when convenient.
- New positions **adopt** the AI's levels; existing positions get an **"Apply AI levels?"** proposal
  you confirm — so a runner's break-even stop is never silently overwritten (the diff warns in amber
  if a suggestion would lower a raised stop).
- If the bridge/AI is unavailable, the position stays "Levels pending" with a manual-set fallback.
- The app version now shows in the sidebar footer.

New endpoints: `POST /api/positions/:ticker/refresh-ai`, `POST /api/positions/:ticker/apply-levels`.

## 1.2.1

**Fix: scans returning empty / no market data (intermittent).**
Root cause: the bridge spawned a fresh `uvx` MCP process per request, and TradingView
rate-limits/blocks fresh connections (empty bodies — the market-wide screener fails first),
so repeated scans/refreshes would start coming back empty. The bridge now holds **one
persistent warm MCP connection** (an owner-task that owns a single long-lived stdio session),
which matches the working pattern and avoids the throttling. Verified: `/market-overview`
returns 237 analyzed and scans return real candidates again.

Also:
- Multi-timeframe now retries on transient failure, so it reliably attaches to every scan pick
  (previously some picks silently got `mtf=null`).
- The AI no longer invents a `weekly_bias` when multi-timeframe data is genuinely missing —
  it reports "Unknown" instead of guessing "Neutral".

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
