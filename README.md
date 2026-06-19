# EGX Swing-Trading Dashboard

A personal, single-user dashboard for an Egyptian Exchange (EGX) swing-trading portfolio.
Not live-streaming — data is fetched only when you click **Refresh** or **Scan**. Two main
tabs (Portfolio, Opportunities) plus a History tab.

What makes it tick:

- **Autonomous live data** — a FastAPI bridge spawns the TradingView MCP server
  (`uvx tradingview-mcp`) over stdio and pulls real EGX indicators. No chat, no manual steps.
- **AI analysis layer** — the backend runs headless `claude -p` (default **Opus**) to analyze
  the fetched data against your strategy: per-position recommendation + refined stop/T1/T2, and
  AI-ranked entry opportunities. The deterministic engine owns instant status/colors; Claude
  owns the judgment.

## Architecture

```
React/Vite (5173) ──/api──▶ Express backend (3001) ──HTTP──▶ FastAPI bridge (8001) ──stdio MCP──▶ tradingview-mcp
                              │                                   
                              └── headless `claude -p` (Opus) for AI analysis
```

| Layer | Path | Port |
|-------|------|------|
| Portfolio JSON generator | `scripts/generate_portfolio_json.py` | — |
| MCP bridge (FastAPI) | `mcp_bridge/` | 8001 |
| Backend (Express) | `backend/` | 3001 |
| Frontend (Vite/React/TS) | `frontend/` | 5173 |

## Prerequisites

- Node.js 18+ and npm
- Python 3.10+ with `uv`/`uvx` on PATH (provides the TradingView MCP server)
- The Claude Code CLI (`claude`) on PATH and signed in (used for AI analysis)

## Your data files (not included in this repo)

This public repo ships the **app**, not personal trading data. You supply these locally (they
are gitignored): `build_portfolio_v3.py` (your positions — source of truth that
`scripts/generate_portfolio_json.py` parses), `STRATEGY.md` (fed to the AI analyst),
`PORTFOLIO.md` (history for the generator). Without them, `npm run gen` has nothing to parse —
drop your own copies in the project root first.

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

## Configuration

See `.env.example`. Most useful knobs:

- `ANALYSIS_MODEL` — `opus` (default, best) or `sonnet` (faster/cheaper) for AI analysis.
- `MCP_BRIDGE_URL` — where the backend reaches the bridge.

## How it works

- **Refresh** (two-phase): `POST /api/refresh` pulls live indicators + runs the deterministic
  status engine (instant), then the UI calls `POST /api/analyze` for the Opus portfolio analysis.
- **Scan**: `POST /api/scan-opportunities` runs the EGX screener, pulls per-candidate detail,
  filters by your thresholds, then Opus ranks the top entries with R:R and theses.
- **Log Order** (⚡): STOP-OUT / SELL (T1/T2) / BUY (new) / BUY (add) with FIFO cost basis —
  updates positions, realized P&L, action log, and exited positions.

## Strategy & data source

`build_portfolio_v3.py` is the source of truth for positions; `scripts/generate_portfolio_json.py`
parses it (via `ast`, no execution) into `backend/data/portfolio_data.json`. Strategy lives in
`STRATEGY.md` and is fed to the AI analyst verbatim. (Both are user-supplied — see above.)

> Educational/personal tool. Not financial advice. Thndr rule: ONE active order per stock —
> stop-loss OR limit sell, not both.
