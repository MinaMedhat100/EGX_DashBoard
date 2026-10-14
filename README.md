# EGX Swing-Trading Dashboard

A personal, single-user dashboard for an Egyptian Exchange (EGX) swing-trading portfolio. It pulls
live indicators from TradingView, asks Claude to read them against your written strategy, tracks
positions and orders the way you place them on Thndr / ThndrX, and reviews every closed trade so
the same mistakes get noticed.

It is not live-streaming. Data is fetched only when you click **Refresh** or **Scan**. Nothing is
traded automatically, and the AI never changes a level on its own: it proposes, you decide.

## What it does

**Portfolio**
- Positions with live price, P&L, a price-range bar (stop · entry · now · T1 · T2) and an instant
  status from a deterministic engine (colours, alerts).
- **Classic** positions (one Thndr order per stock: stop-loss *or* limit sell) and **ThndrX
  brackets**: two lots, A → T1 and B → T2, each with its own stop and take-profit.
- **AI read per position** (Refresh): a HOLD / ADD / TRIM / EXIT / WATCH call, conviction, thesis and key risk,
  plus suggested stop and targets — per lot on brackets. New positions adopt them; for existing ones
  you get an **Apply** chip only when a level actually moved.
- **Stop guard**: an AI stop is held back if it would move down, sit at or above the price, or land
  within 1.5× daily ATR of it (inside ordinary noise). Correcting an entry warns you when the
  existing stop ends up within 1.5× ATR of the new entry, with a safer stop and same-risk share count.
- **Book insights**: open risk if every stop hit, largest exposure, unprotected positions, and an AI
  read of the whole book (posture, concentration, correlated clusters).
- **Log Trade** (⚡): BUY, ADD, SELL (T1/T2), STOP-OUT and entry corrections, with FIFO cost basis,
  realized P&L, an action log and exited positions.

**Opportunities**
- Market scan: the EGX screener, per-candidate indicators and multi-timeframe data, your
  ADX / DI / RSI filters, then Claude ranks entries with entry zone, stop, T1/T2, R:R and a thesis.
  A watchlist scan does the same for tickers you choose.
- **Scan memory**: each candidate reaches the AI with its own previous read, so fading momentum
  lowers conviction instead of raising it (↘ / ↗ chips).
- **Overextension flags** (far above EMA20 in ATRs, stretched weekly RSI, long upper wick, an entry
  zone creeping up to the price) and an **entry guard** that holds back chasing entries.
- **Log this as a bracket** opens the order form pre-filled from the card.
- The analyses also get recent news headlines and the current market regime.

**EGX Indices** — EGX30 / 70 / 100 level, trend, breadth and sector internals, with an AI regime
read (Risk-On / Neutral / Risk-Off) that feeds the other analyses.

**Goldx** — a gold swing tracker (PAXG as the spot-gold proxy, USD/oz, with USD/EGP, DXY and the US
10-year yield) with its own AI entries and position.

**History** — the action log and exited positions. Each trade has a **📓 Journal**: the frozen
opportunity card it came from, every AI read, every stop/target change and who made it, every order
and correction, in the order they happened (late-logged orders are tagged).

**Learning loop**
- **Post-mortem** on every fully closed trade, wins and losses alike, once ten sessions of prices
  exist after the exit. Code first computes the facts from Yahoo daily bars and the journal (stop
  distance in ATRs, worst drop and best gain while held, whether price came back after a stop-out,
  the market's move over the same days, late logs). Then one tools-off Claude call judges the
  *decisions* — not the P&L — against your strategy: verdict, stage, evidence, what the rules would
  have done, and one lesson in a fixed category. About $0.09 per trade. You can add a one-line note
  to any closed trade; the review reads it as your reason.
- **🧠 Lessons** counts those categories across trades in code (no AI) and flags one once three
  trades with a problem verdict share it, listing the trades behind it. It also measures how often
  stops sat inside daily noise and whether those trades came back. Acting on a flag is up to you.

**Resilience** — when TradingView rate-limits the data source, the bridge stops calling it for as
long as it asks and the board shows the last good prices with "retry in N s" instead of timing out.
No paid AI read is spent on prices that couldn't be refreshed.

Six tabs in all: Portfolio, EGX Indices, Opportunities, Goldx, History, Lessons. Three themes
(Desk, Paper, Neon) in the sidebar footer.

## Architecture

```
React/Vite (5173) ──/api──▶ Express backend (3001) ──HTTP──▶ FastAPI bridge (8001) ──stdio MCP──▶ tradingview-mcp
                              │                                  └── circuit breaker for TradingView rate limits
                              ├── headless `claude -p` (Opus 5.5) for analyses and post-mortems
                              └── Yahoo daily bars (post-mortem evidence, cached once a day)
```

| Layer | Path | Port |
|-------|------|------|
| Portfolio JSON generator | `scripts/generate_portfolio_json.py` | — |
| MCP bridge (FastAPI) | `mcp_bridge/` | 8001 |
| Backend (Express) | `backend/` | 3001 |
| Frontend (Vite/React/TS) | `frontend/` | 5173 |

The TradingView MCP server is the community
[`tradingview-mcp-server`](https://github.com/atilaahmettaner/tradingview-mcp), started by the bridge
with `uvx` and pinned to `mcp<2` (mcp 2.0 dropped the FastMCP module it needs).

## Prerequisites

- Node.js 22.18+ and npm (developed on Node 24; the frontend tests use Node's built-in TypeScript
  support)
- Python 3.10+ with `uv` / `uvx` on PATH (provides the TradingView MCP server)
- The Claude Code CLI (`claude`) on PATH and signed in. The default model, Claude Opus 5.5, needs
  CLI 2.1.286 or later (`claude update`).

## Your data files (not included in this repo)

This public repo ships the **app**, not personal trading data. You supply these locally; they are
gitignored:

- `build_portfolio_v3.py` — your positions, the source of truth that
  `scripts/generate_portfolio_json.py` parses (via `ast`, no execution).
- `STRATEGY.md` — your rules, fed to every AI analysis verbatim (the post-mortem leaves out a
  "Realized P&L Log" section if you have one).
- `PORTFOLIO.md` — history for the generator.

Everything the app writes lives in `backend/data/` and is gitignored too: the portfolio, the trade
journal, scan history, index and gold snapshots, the last refresh, and the Yahoo bars cache.

## Setup

```bash
npm install                 # installs concurrently (root)
npm run setup               # installs python + backend + frontend deps, generates the data file
```

(Or manually: `pip install -r mcp_bridge/requirements.txt`, `npm --prefix backend install`,
`npm --prefix frontend install`, `npm run gen`.)

## Run (all three services)

**Windows — easiest:** double-click **`start-dashboard.bat`**. It installs deps on first run,
generates the data file if missing, frees ports 8001/3001/5173 from any previous run, starts all
three services, and opens your browser. Keep the window open; press Ctrl+C to stop everything.
(Set `EGX_NO_BROWSER=1` to skip the auto-open.)

**Or from a terminal:**

```bash
npm run dev
```

Then open **http://localhost:5173**. Or run each service in its own terminal:

```bash
npm run bridge      # FastAPI MCP bridge  :8001
npm run backend     # Express API         :3001
npm run frontend    # Vite dev server     :5173
```

Automatic post-mortems run only while the backend is up (60 s after start, then every 6 hours).

## Configuration

See `.env.example`. The useful knobs:

- `ANALYSIS_MODEL` — model for the analyses (default `claude-opus-5-5`; `sonnet` is faster and cheaper).
- `POSTMORTEM_MODEL` — model for post-mortems (default `claude-opus-5-5`).
- `POSTMORTEM_AUTO=off` — turn off automatic post-mortems (manual runs still work).
- `POSTMORTEM_COST_HINT` — the per-review cost shown on the Analyse / Re-run buttons.
- `MCP_BRIDGE_URL` — where the backend reaches the bridge.
- `TV_COOLDOWN_S` — fallback pause when TradingView rate-limits without saying for how long (60).

## Tests

```bash
npm --prefix backend test          # node --test
npm --prefix frontend test         # node --test on the pure .ts helpers
python -m mcp_bridge.test_ratelimit && python -m mcp_bridge.test_selfheal \
  && python -m mcp_bridge.test_levels && python -m mcp_bridge.test_overextension
```

No test calls the AI or the network.

## How it works

- **Refresh** (two phases): `POST /api/refresh` pulls live indicators and runs the status engine
  (instant), then `POST /api/analyze` runs the portfolio analysis. A single card's Refresh does both
  for one position.
- **Scan**: `POST /api/scan-opportunities` (or `/scan-watchlist`) runs the screener and filters, then
  the AI ranks the survivors; if the AI fails, a deterministic ranking is shown with the reason.
- **Journal**: every order, AI read, level change and correction is appended to the trade's journal
  after the portfolio is saved. A journal failure never blocks a trade; it shows a warning instead.
- **Post-mortem**: `POST /api/journal/:id/postmortem` (or the scheduler) builds the evidence, makes
  one isolated `claude -p` call with tools, MCP servers and project settings switched off, validates
  the JSON reply and stores it on the journal record.
- **Lessons**: `GET /api/lessons` computes the counts on read; `POST /api/lessons/analyse-remaining`
  reviews the older trades one at a time and stops at the first AI error.

See `CHANGELOG.md` for the full history.

> Educational/personal tool. Not financial advice. Thndr rule: ONE active order per stock —
> stop-loss OR limit sell, not both (ThndrX brackets pair them as one-cancels-the-other).
