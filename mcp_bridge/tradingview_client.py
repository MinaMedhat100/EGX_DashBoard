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


# ── persistent connection (one warm MCP connection, owned by a single task) ──
# Spawning a fresh uvx process per request gets rate-limited/blocked by TradingView
# (empty bodies — the market-wide screener fails first). One long-lived connection,
# owned entirely by a single task, avoids that and sidesteps anyio cross-task teardown.
class _Manager:
    def __init__(self):
        self._queue: asyncio.Queue | None = None
        self._task = None
        self.tools: list[str] = []
        self.connected = False

    async def start(self):
        if self._task is not None:
            return
        self._queue = asyncio.Queue()
        self._task = asyncio.create_task(self._run())

    async def stop(self):
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None

    async def _run(self):
        while True:
            try:
                params = StdioServerParameters(command=TV_MCP_COMMAND, args=TV_MCP_ARGS)
                async with stdio_client(params) as (read, write):
                    async with ClientSession(read, write) as session:
                        await session.initialize()
                        try:
                            resp = await session.list_tools()
                            self.tools = [t.name for t in resp.tools]
                        except Exception:  # noqa: BLE001
                            self.tools = []
                        self.connected = True
                        while True:
                            name, args, fut = await self._queue.get()
                            if fut.done():
                                continue
                            try:
                                res = await asyncio.wait_for(
                                    session.call_tool(name, args), timeout=CALL_TIMEOUT
                                )
                                fut.set_result(_parse_result(res))
                            except asyncio.TimeoutError:
                                fut.set_result({"error": f"{name} timed out after {CALL_TIMEOUT}s"})
                            except Exception as exc:  # noqa: BLE001
                                fut.set_result({"error": f"{name} failed: {exc!r}"})
                                raise  # connection likely broken -> reconnect
            except asyncio.CancelledError:
                break
            except Exception:  # noqa: BLE001
                self.connected = False
                await asyncio.sleep(2)  # brief pause, then reconnect

    async def call(self, name: str, args: dict) -> dict:
        if self._queue is None:
            return {"error": "MCP client not started"}
        fut = asyncio.get_event_loop().create_future()
        await self._queue.put((name, args, fut))
        return await fut


_manager = _Manager()


async def start_client():
    await _manager.start()


async def stop_client():
    await _manager.stop()


@asynccontextmanager
async def tv_session():
    """Backwards-compatible: yields the shared persistent client (no per-call spawn)."""
    yield tv


class TradingView:
    """Facade over the persistent manager (same method surface as before)."""

    async def call(self, name: str, args: dict) -> dict:
        return await _manager.call(name, args)

    async def list_tools(self) -> list[str]:
        return list(_manager.tools)

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

    async def multi_timeframe(self, symbol, exchange="EGX"):
        return await self.call(
            "multi_timeframe_analysis", {"symbol": symbol, "exchange": exchange}
        )

    async def news(self, symbol=None, category="stocks", limit=10):
        args = {"category": category, "limit": limit}
        if symbol:
            args["symbol"] = symbol
        return await self.call("financial_news", args)


# shared persistent client singleton (yielded by tv_session)
tv = TradingView()


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


def extract_mtf(a: dict) -> dict | None:
    """Compact multi-timeframe summary from multi_timeframe_analysis (W/D/4H/1H/15m)."""
    if not a or "error" in a:
        return None
    tfs = a.get("timeframes", {}) or {}
    align = a.get("alignment", {}) or {}
    rec = a.get("recommendation", {}) or {}

    def bias(tf):
        return (tfs.get(tf, {}) or {}).get("bias")

    w, d = bias("1W"), bias("1D")
    return {
        "weekly_bias": w,
        "daily_bias": d,
        "bias_4h": bias("4h"),
        "bias_1h": bias("1h"),
        "bias_15m": bias("15m"),
        # both higher TFs clearly up
        "wd_aligned": w == "Bullish" and d == "Bullish",
        # the condition the 50%/100% exit rule needs: "W/D still bullish"
        "higher_tf_bullish": w == "Bullish" and d != "Bearish",
        "alignment_status": align.get("status"),
        "confidence": align.get("confidence"),
        "net_score": align.get("net_score"),
        "recommendation": rec.get("action"),
    }
