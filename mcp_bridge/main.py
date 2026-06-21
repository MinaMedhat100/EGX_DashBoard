"""
main.py — FastAPI MCP bridge (port 8001) for the EGX dashboard.

Bridges the Node backend to the TradingView MCP server. Owns data fetching + indicator
extraction; the status engine + AI analysis live in the Node backend. Endpoints mirror the
spec: /refresh-prices, /scan-opportunities, /market-overview, /news/{ticker}.

Run:  uvicorn mcp_bridge.main:app --port 8001
"""

from __future__ import annotations

import json
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .tradingview_client import (
    clean_symbol,
    extract_indicators,
    extract_mtf,
    start_client,
    stop_client,
    tv_session,
)

ROOT = Path(__file__).resolve().parent.parent
CACHE_FILE = ROOT / "backend" / "data" / "last_refresh.json"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await start_client()  # one persistent MCP connection for the app's lifetime
    yield
    await stop_client()


app = FastAPI(title="EGX TradingView MCP Bridge", version="1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat()


async def _fetch_mtf(tv, ticker, attempts: int = 3):
    """Multi-timeframe is the heaviest call and occasionally fails transiently mid-scan;
    retry a couple of times before giving up (the data almost always exists)."""
    for _ in range(attempts):
        mtf = extract_mtf(await tv.multi_timeframe(ticker))
        if mtf:
            return mtf
    return None


# ── request models ───────────────────────────────────────────────────────────
class RefreshBody(BaseModel):
    tickers: list[str]


class ScanBody(BaseModel):
    min_adx: float = 35
    min_di_gap: float = 5
    rsi_min: float = 40
    rsi_max: float = 70
    exclude_tickers: list[str] = []
    detail_limit: int = 12


# ── deterministic level suggestions (baseline; AI refines later) ─────────────
def suggest_levels(ind: dict) -> dict | None:
    """A bounded, deterministic baseline for entry/stop/targets. The AI analyst refines
    this; it only has to be sane as a fallback. Stop is kept 1.5–10% below entry, T1 ≥ +3%,
    T2 ≥ +10% and strictly above T1, so R:R never collapses to noise."""
    price = ind.get("price")
    if not price:
        return None
    ema20, ema50 = ind.get("ema20"), ind.get("ema50")
    s1, r1, r2 = ind.get("support_1"), ind.get("resistance_1"), ind.get("resistance_2")
    bbu = ind.get("bb_upper")
    entry_hi = round(price, 2)
    entry_lo = round(min(price, ema20 or price), 2)

    # stop: closest structural support below price, clamped to 1.5%–10% below entry
    below = [x for x in (ema50, s1) if x and x < price]
    raw_stop = (max(below) * 0.99) if below else price * 0.95
    stop = round(min(max(raw_stop, price * 0.90), price * 0.985), 2)

    # T1: nearest resistance above price, at least +3%
    above_t1 = [x for x in (r1, bbu) if x and x > price]
    t1 = round(max(min(above_t1) if above_t1 else price * 1.06, price * 1.03), 2)

    # T2: next resistance above T1, at least +10% and clearly above T1
    above_t2 = [x for x in (r2, r1, bbu) if x and x > t1 * 1.01]
    t2 = round(max(min(above_t2) if above_t2 else price * 1.15, t1 * 1.04, price * 1.10), 2)

    risk = entry_hi - stop
    rr = round((t2 - entry_hi) / risk, 2) if risk > 0 else None
    return {
        "entry_zone": [entry_lo, entry_hi],
        "stop": stop, "t1": t1, "t2": t2,
        "t1_pct": round((t1 - entry_hi) / entry_hi * 100, 2),
        "t2_pct": round((t2 - entry_hi) / entry_hi * 100, 2),
        "rr": rr,
    }


# ── endpoints ────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "service": "mcp-bridge", "time": _now_iso()}


@app.get("/mcp-check")
async def mcp_check():
    """Verify the MCP server is reachable and list its tools."""
    try:
        async with tv_session() as tv:
            tools = await tv.list_tools()
        return {"connected": True, "tool_count": len(tools), "tools": tools}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"MCP connect failed: {exc!r}")


@app.post("/refresh-prices")
async def refresh_prices(body: RefreshBody):
    if not body.tickers:
        return {}
    out: dict[str, dict] = {}
    try:
        async with tv_session() as tv:
            for ticker in body.tickers:
                analysis = await tv.coin_analysis(ticker)
                ind = extract_indicators(analysis)
                # multi-timeframe (W/D/4H/1H/15m) for each liquid position
                ind["mtf"] = await _fetch_mtf(tv, ticker)
                out[ticker] = ind
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"refresh failed: {exc!r}")

    # cache for resilience / "last refreshed" display
    try:
        CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        CACHE_FILE.write_text(
            json.dumps({"timestamp": _now_iso(), "data": out}, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    except OSError:
        pass
    return out


@app.post("/scan-opportunities")
async def scan_opportunities(body: ScanBody):
    exclude = {t.upper() for t in body.exclude_tickers}
    results: list[dict] = []
    note: str | None = None
    try:
        async with tv_session() as tv:
            scr = await tv.screener(min_score=55, limit=40)
            # Don't raise inside the MCP task group (it wraps into ExceptionGroup). The
            # screener returns empty/error pre-market — degrade to a clean empty result.
            raw = (scr.get("qualified_trades") or []) + (scr.get("watchlist") or [])
            if scr.get("error") or not raw:
                note = scr.get("error") or "screener returned no data (market may be pre-open or closed)"
                raw = []
            seen: set[str] = set()
            candidates = []
            for item in raw:
                sym = clean_symbol(item.get("symbol", ""))
                if not sym or sym in seen or sym.upper() in exclude:
                    continue
                seen.add(sym)
                candidates.append(item)
            candidates.sort(key=lambda x: x.get("stock_score", 0), reverse=True)
            candidates = candidates[: body.detail_limit]

            for item in candidates:
                sym = clean_symbol(item["symbol"])
                ind = extract_indicators(await tv.coin_analysis(sym))
                if "error" in ind:
                    continue
                adx = ind.get("adx") or 0
                gap = (ind.get("plus_di") or 0) - (ind.get("minus_di") or 0)
                rsi = ind.get("rsi") or 0
                passes = (
                    adx > body.min_adx
                    and gap > body.min_di_gap
                    and body.rsi_min <= rsi <= body.rsi_max
                )
                results.append({
                    "ticker": sym,
                    "sector": item.get("sector"),
                    "stock_score": item.get("stock_score"),
                    "grade": item.get("grade"),
                    "trend_state": item.get("trend_state"),
                    "signals": item.get("signals", []),
                    "di_gap": round(gap, 2),
                    "indicators": ind,
                    "suggested": suggest_levels(ind),
                    "passes_filter": passes,
                })

            # multi-timeframe (W/D/4H/1H/15m) for the candidates that passed the filter,
            # so the AI ranks with weekly confirmation. Bounded to the passed set.
            for r in results:
                if r["passes_filter"]:
                    r["indicators"]["mtf"] = await _fetch_mtf(tv, r["ticker"])
    except Exception as exc:  # noqa: BLE001 — genuine connection failure
        raise HTTPException(status_code=503, detail=f"scan failed: {exc!r}")

    passed = [r for r in results if r["passes_filter"]]
    return {
        "params": body.model_dump(),
        "candidates": passed,
        "all_scanned": results,
        "passed_count": len(passed),
        "scanned_count": len(results),
        "note": note,
        "timestamp": _now_iso(),
    }


@app.get("/market-overview")
async def market_overview():
    try:
        async with tv_session() as tv:
            ov = await tv.market_overview(limit=8)
            scr = await tv.screener(min_score=60, limit=40)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"market-overview failed: {exc!r}")

    stats = ov.get("market_stats", {}) or {}
    adv, dec = stats.get("advancing", 0) or 0, stats.get("declining", 0) or 0
    direction = "Bullish" if adv > dec * 1.1 else "Bearish" if dec > adv * 1.1 else "Mixed"
    ratio = adv / (adv + dec) if (adv + dec) else 0.5
    sentiment = "Risk-On" if ratio > 0.6 else "Risk-Off" if ratio < 0.4 else "Neutral"

    agg = defaultdict(lambda: {"count": 0, "score_sum": 0})
    for item in (scr.get("watchlist") or []) + (scr.get("qualified_trades") or []):
        sec = item.get("sector") or "other"
        agg[sec]["count"] += 1
        agg[sec]["score_sum"] += item.get("stock_score", 0)
    top_sectors = sorted(
        ({"sector": k, "strong_count": v["count"],
          "avg_score": round(v["score_sum"] / v["count"], 1)} for k, v in agg.items()),
        key=lambda x: (x["strong_count"], x["avg_score"]), reverse=True,
    )[:4]

    def trim(items):
        return [{
            "ticker": clean_symbol(i.get("symbol", "")),
            "price": i.get("price"),
            "change_pct": i.get("changePercent"),
            "rsi": i.get("rsi"),
            "signal": i.get("signal"),
        } for i in (items or [])[:5]]

    return {
        "direction": direction,
        "change_pct": stats.get("avg_change"),
        "sentiment": sentiment,
        "breadth": {"advancing": adv, "declining": dec, "unchanged": stats.get("unchanged")},
        "top_sectors": top_sectors,
        "top_gainers": trim(ov.get("top_gainers")),
        "top_losers": trim(ov.get("top_losers")),
        "most_active": trim(ov.get("most_active")),
        "total_analyzed": ov.get("total_analyzed"),
        "timestamp": _now_iso(),
    }


@app.get("/news/{ticker}")
async def news(ticker: str):
    try:
        async with tv_session() as tv:
            nw = await tv.news(symbol=ticker, limit=5)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"news failed: {exc!r}")
    items = nw.get("items") or []
    out = [{
        "headline": i.get("title") or i.get("headline"),
        "time": i.get("published") or i.get("time"),
        "sentiment": i.get("sentiment"),
        "url": i.get("link") or i.get("url"),
    } for i in items[:5]]
    return {"ticker": ticker, "items": out, "source": "mcp:financial_news", "count": len(out)}
