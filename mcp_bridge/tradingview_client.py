"""
tradingview_client.py — MCP client wrapper around the TradingView MCP server.

The server is the local stdio program `uvx --from tradingview-mcp-server tradingview-mcp`
(discovered from Claude Desktop's config; no auth/keys). We open a fresh stdio connection
per bridge request and reuse it across all the tool calls that request needs — robust and
simple for a single-user local app. Override the command via env if it ever moves:

    TV_MCP_COMMAND   (default "uvx")
    TV_MCP_ARGS      (default "--from,tradingview-mcp-server,tradingview-mcp", comma-split)
"""

from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

TV_MCP_COMMAND = os.environ.get("TV_MCP_COMMAND", "uvx")
TV_MCP_ARGS = os.environ.get(
    "TV_MCP_ARGS", "--from,tradingview-mcp-server,tradingview-mcp"
).split(",")

CALL_TIMEOUT = float(os.environ.get("TV_MCP_CALL_TIMEOUT", "45"))


# ── result parsing ───────────────────────────────────────────────────────────
def _parse_result(result) -> dict:
    """Turn a CallToolResult into a dict (the tools return JSON text blocks)."""
    if getattr(result, "isError", False):
        text = _first_text(result) or "tool error"
        return {"error": text}
    text = _first_text(result)
    if text is None:
        return {}
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return {"_raw": text}


def _first_text(result):
    for block in getattr(result, "content", []) or []:
        text = getattr(block, "text", None)
        if text:
            return text
    return None


def clean_symbol(sym: str) -> str:
    """'EGX:COMI' -> 'COMI'."""
    if not sym:
        return sym
    return sym.split(":", 1)[1] if ":" in sym else sym


# ── connection ───────────────────────────────────────────────────────────────
@asynccontextmanager
async def tv_session():
    """Open a connected MCP session to the TradingView server for the duration of a block."""
    params = StdioServerParameters(command=TV_MCP_COMMAND, args=TV_MCP_ARGS)
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            yield TradingView(session)


class TradingView:
    """Thin typed wrapper over the MCP tool calls we use."""

    def __init__(self, session: ClientSession):
        self.session = session

    async def call(self, name: str, args: dict) -> dict:
        try:
            result = await asyncio.wait_for(
                self.session.call_tool(name, args), timeout=CALL_TIMEOUT
            )
        except asyncio.TimeoutError:
            return {"error": f"{name} timed out after {CALL_TIMEOUT}s"}
        except Exception as exc:  # noqa: BLE001 - surface any MCP failure to the caller
            return {"error": f"{name} failed: {exc!r}"}
        return _parse_result(result)

    async def list_tools(self) -> list[str]:
        resp = await self.session.list_tools()
        return [t.name for t in resp.tools]

    # high-level tool methods --------------------------------------------------
    async def coin_analysis(self, symbol, exchange="EGX", timeframe="1D"):
        return await self.call(
            "coin_analysis",
            {"symbol": symbol, "exchange": exchange, "timeframe": timeframe},
        )

    async def market_overview(self, timeframe="1D", limit=10):
        return await self.call("egx_market_overview", {"timeframe": timeframe, "limit": limit})

    async def screener(self, timeframe="1D", min_score=55, index_filter="", limit=20):
        return await self.call(
            "egx_stock_screener",
            {"timeframe": timeframe, "min_score": min_score,
             "index_filter": index_filter, "limit": limit},
        )

    async def sector_scan(self, sector="", timeframe="1D", limit=20):
        return await self.call(
            "egx_sector_scan", {"sector": sector, "timeframe": timeframe, "limit": limit}
        )

    async def trade_plan(self, symbol, timeframe="1D"):
        return await self.call("egx_trade_plan", {"symbol": symbol, "timeframe": timeframe})

    async def news(self, symbol=None, category="stocks", limit=10):
        args = {"category": category, "limit": limit}
        if symbol:
            args["symbol"] = symbol
        return await self.call("financial_news", args)


# ── indicator extraction (from a coin_analysis response) ─────────────────────
def extract_indicators(a: dict) -> dict:
    """Pull the flat indicator set the dashboard + status engine need from coin_analysis."""
    if not a or "error" in a:
        return {"error": (a or {}).get("error", "no data")}

    pd = a.get("price_data", {}) or {}
    adx = a.get("adx", {}) or {}
    rsi = a.get("rsi", {}) or {}
    macd = a.get("macd", {}) or {}
    ema = a.get("ema", {}) or {}
    bb = a.get("bollinger_bands", {}) or {}
    sr = a.get("support_resistance", {}) or {}
    ms = a.get("market_sentiment", {}) or {}
    struct = a.get("market_structure", {}) or {}

    return {
        "price": pd.get("current_price"),
        "open": pd.get("open"),
        "high": pd.get("high"),
        "low": pd.get("low"),
        "volume": pd.get("volume"),
        "daily_change_pct": pd.get("change_percent"),

        "adx": adx.get("value"),
        "plus_di": adx.get("plus_di"),
        "minus_di": adx.get("minus_di"),
        "adx_strength": adx.get("trend_strength"),
        "di_signal": adx.get("di_signal"),

        "rsi": rsi.get("value"),
        "rsi_signal": rsi.get("signal"),
        "rsi_direction": rsi.get("direction"),

        "macd_histogram": macd.get("histogram"),
        "macd_crossover": macd.get("crossover"),

        "ema20": ema.get("ema20"),
        "ema50": ema.get("ema50"),
        "ema200": ema.get("ema200"),

        "bb_upper": bb.get("upper"),
        "bb_middle": bb.get("middle"),
        "bb_lower": bb.get("lower"),

        "pivot": sr.get("pivot"),
        "support_1": sr.get("support_1"),
        "support_2": sr.get("support_2"),
        "resistance_1": sr.get("resistance_1"),
        "resistance_2": sr.get("resistance_2"),

        "tv_signal": ms.get("buy_sell_signal"),
        "tv_rating": ms.get("overall_rating"),
        "momentum": ms.get("momentum"),
        "trend_state": a.get("trend_state"),
        "grade": a.get("grade"),
        "stock_score": a.get("stock_score"),
        "trend": struct.get("trend"),
    }
