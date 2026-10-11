"""Checks for failing fast while TradingView rate-limits us (v2.7.1).

Standalone assert script, same convention as test_selfheal.py:
    python -m mcp_bridge.test_ratelimit
Exits non-zero on failure.

Root cause it guards (2026-10-11): TradingView answered HTTP 429 with an empty body. The 0.8.1 server
turns that into a structured {"error": {"code": "UPSTREAM_ERROR", "retryable": true,
"retry_after_s": 60, "message": "...Expecting value..."}} RESULT. The bridge read it as the old
stuck-connection signature, respawned the server and retried, and _fetch_mtf retried again on top:
one ticker took over 180 s while every retry kept hitting the rate limit.
"""
import asyncio
import json
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace

import mcp_bridge.tradingview_client as tvc
import mcp_bridge.main as bridge_main
from mcp_bridge.tradingview_client import (
    CircuitBreaker, _Manager, _is_transient, is_rate_limited, upstream_retry_after,
)

RATE_LIMITED_TXT = "tradingview_rate_limited"
UPSTREAM_429 = {"error": {
    "code": "UPSTREAM_ERROR",
    "message": "Analysis failed: JSONDecodeError('Expecting value: line 1 column 1 (char 0)'). Wait ~60s before retrying.",
    "retryable": True, "retry_after_s": 60,
}}
OK_ANALYSIS = {"price_data": {"current_price": 10.0, "change_percent": 1.0}, "adx": {"value": 30}}


def check(desc, got, want):
    assert got == want, f"FAIL: {desc}: got {got!r}, want {want!r}"
    print(f"ok: {desc}")


# ── classification ───────────────────────────────────────────────────────────
check("structured 429 is rate-limited (60 s)", upstream_retry_after(UPSTREAM_429), 60.0)
check("structured 429 is NOT the stuck-connection signature", _is_transient(UPSTREAM_429), False)
check("explicit retry_after_s is used",
      upstream_retry_after({"error": {"code": "UPSTREAM_RATE_LIMIT", "message": "m", "retry_after_s": 30}}), 30.0)
check("non-retryable structured error is not rate-limited",
      is_rate_limited({"error": {"code": "NO_DATA", "message": "no rows"}}), False)
check("legacy string error is not rate-limited",
      is_rate_limited({"error": "Analysis failed: Expecting value: line 1 column 1 (char 0)"}), False)
check("success is not rate-limited", is_rate_limited({"price": 10}), False)

# ── breaker (fake clock) ─────────────────────────────────────────────────────
now = [1000.0]
b = CircuitBreaker(clock=lambda: now[0])
check("closed at start", b.blocked("coin_analysis"), None)
b.record("coin_analysis", UPSTREAM_429)
blocked = b.blocked("coin_analysis")
check("opens on a TradingView 429", blocked["error"]["code"], "UPSTREAM_COOLDOWN")
check("reports the seconds left", blocked["error"]["retry_after_s"], 60)
check("yahoo_price is exempt", b.blocked("yahoo_price"), None)
check("financial_news is exempt", b.blocked("financial_news"), None)
now[0] += 45
check("counts down", b.blocked("multi_timeframe_analysis")["error"]["retry_after_s"], 15)
check("cooldown errors are rate-limited too", is_rate_limited(b.blocked("coin_analysis")), True)
now[0] += 16
check("expires after retry_after_s", b.blocked("coin_analysis"), None)
b.record("coin_analysis", UPSTREAM_429)
b.record("coin_analysis", OK_ANALYSIS)
check("a success closes it", b.blocked("coin_analysis"), None)
b2 = CircuitBreaker(clock=lambda: now[0])
b2.record("yahoo_price", UPSTREAM_429)
check("an exempt tool's failure does not open it", b2.blocked("coin_analysis"), None)
check("state() when open", (b.record("coin_analysis", UPSTREAM_429), b.state()["open"])[1], True)


# ── manager: no reconnect, short-circuit, exempt pass-through ────────────────
class _Result:
    def __init__(self, payload):
        self.isError = False
        self.content = [SimpleNamespace(text=json.dumps(payload))]


def run_manager_scenario():
    spawns = {"n": 0}
    calls: list[str] = []
    replies = {"coin_analysis": UPSTREAM_429, "yahoo_price": {"price": 50.0}}

    class FakeSession:
        def __init__(self, *_a):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_a):
            return False

        async def initialize(self):
            pass

        async def list_tools(self):
            return SimpleNamespace(tools=[])

        async def call_tool(self, name, _args):
            calls.append(name)
            return _Result(replies[name])

    @asynccontextmanager
    async def fake_stdio(_params):
        spawns["n"] += 1
        yield (None, None)

    real = (tvc.stdio_client, tvc.ClientSession)
    tvc.stdio_client, tvc.ClientSession = fake_stdio, FakeSession
    clock = [5000.0]
    try:
        async def scenario():
            m = _Manager(breaker=CircuitBreaker(clock=lambda: clock[0]))
            await m.start()
            first = await m.call("coin_analysis", {"symbol": "COMI"})
            second = await m.call("multi_timeframe_analysis", {"symbol": "COMI"})
            yahoo = await m.call("yahoo_price", {"symbol": "EGP=X"})
            clock[0] += 61
            replies["coin_analysis"] = OK_ANALYSIS
            third = await m.call("coin_analysis", {"symbol": "COMI"})
            await m.stop()
            return first, second, yahoo, third, m

        return (*asyncio.run(scenario()), spawns, calls)
    finally:
        tvc.stdio_client, tvc.ClientSession = real


first, second, yahoo, third, mgr, spawns, calls = run_manager_scenario()
check("429 is returned as-is", first["error"]["code"], "UPSTREAM_ERROR")
check("no reconnect on a 429 (one server process)", spawns["n"], 1)
check("next TradingView call short-circuits", second["error"]["code"], "UPSTREAM_COOLDOWN")
check("short-circuited call never reached the server", "multi_timeframe_analysis" in calls, False)
check("yahoo_price still goes through", yahoo, {"price": 50.0})
check("after the cooldown a success comes through", "error" in third, False)
check("and closes the breaker", mgr.breaker.state()["open"], False)


# ── endpoints: stop looping, keep good cache, flag the response ──────────────
class FakeTV:
    """coin_analysis succeeds for the first `ok` tickers, then the breaker is open."""

    def __init__(self, ok):
        self.ok = ok
        self.calls: list[tuple[str, str]] = []

    async def coin_analysis(self, symbol, exchange="EGX", timeframe="1D"):
        self.calls.append(("coin", symbol))
        if len([c for c in self.calls if c[0] == "coin"]) <= self.ok:
            return OK_ANALYSIS
        _open_breaker()
        return UPSTREAM_429

    async def multi_timeframe(self, symbol, exchange="EGX"):
        self.calls.append(("mtf", symbol))
        if tvc._manager.breaker.remaining() > 0:
            return tvc._manager.breaker.blocked("multi_timeframe_analysis")
        return {"timeframes": {}}


def _open_breaker():
    tvc._manager.breaker.record("coin_analysis", UPSTREAM_429)


def run_refresh(fake, tickers, cache_file):
    @asynccontextmanager
    async def fake_session():
        yield fake

    real = (bridge_main.tv_session, bridge_main.CACHE_FILE)
    bridge_main.tv_session, bridge_main.CACHE_FILE = fake_session, cache_file
    tvc._manager.breaker = CircuitBreaker()
    try:
        return asyncio.run(bridge_main.refresh_prices(bridge_main.RefreshBody(tickers=tickers)))
    finally:
        bridge_main.tv_session, bridge_main.CACHE_FILE = real
        tvc._manager.breaker = CircuitBreaker()


with tempfile.TemporaryDirectory() as d:
    cache = Path(d) / "last_refresh.json"
    cache.write_text(json.dumps({"timestamp": "OLD", "data": {"MKTA": {"price": 1.0}, "MKTB": {"price": 2.0}}}))
    fake = FakeTV(ok=1)
    out = run_refresh(fake, ["MKTA", "MKTB", "MKTC"], cache)
    check("first ticker refreshed", out["MKTA"].get("price"), 10.0)
    check("rate-limited ticker gets a clear error", out["MKTB"]["error"], "tradingview_rate_limited")
    check("remaining tickers are not even tried", ("coin", "MKTC") in fake.calls, False)
    check("remaining tickers get the same error", out["MKTC"]["error"], "tradingview_rate_limited")
    check("response carries the retry hint", out["_rate_limited"]["retry_after_s"], 60)
    saved = json.loads(cache.read_text())
    check("cache keeps the old good entry for MKTB", saved["data"]["MKTB"], {"price": 2.0})
    check("cache takes the fresh MKTA", saved["data"]["MKTA"]["price"], 10.0)
    check("no error ever written to the cache", any("error" in v for v in saved["data"].values()), False)

    cache.write_text(json.dumps({"timestamp": "OLD", "data": {"MKTA": {"price": 1.0}}}))
    fake = FakeTV(ok=0)
    out = run_refresh(fake, ["MKTA"], cache)
    check("nothing refreshed: cache untouched", json.loads(cache.read_text())["timestamp"], "OLD")
    check("no mtf call after a rate-limited coin_analysis", ("mtf", "MKTA") in fake.calls, False)


# _fetch_mtf: no retries on a rate-limited reply
class MtfTV:
    def __init__(self):
        self.n = 0

    async def multi_timeframe(self, symbol, exchange="EGX"):
        self.n += 1
        return UPSTREAM_429


m_tv = MtfTV()
check("_fetch_mtf gives up at once on a rate limit", asyncio.run(bridge_main._fetch_mtf(m_tv, "MKTA")), None)
check("_fetch_mtf made exactly one call", m_tv.n, 1)


# ── other endpoints fail fast with a clear reason ────────────────────────────
RATE_LIMITED_TXT = "tradingview_rate_limited"


class LimitedTV:
    """Every TradingView call is refused (the breaker opens on the first one)."""

    def __init__(self):
        self.calls = 0

    async def _refuse(self, *_a, **_k):
        self.calls += 1
        _open_breaker()
        return UPSTREAM_429

    coin_analysis = multi_timeframe = screener = market_overview = index_analysis = _refuse

    async def yahoo_price(self, symbol):
        return {"price": 50.0}


def run_endpoint(coro_factory):
    tv = LimitedTV()

    @asynccontextmanager
    async def fake_session():
        yield tv

    real = bridge_main.tv_session
    bridge_main.tv_session = fake_session
    tvc._manager.breaker = CircuitBreaker()
    try:
        try:
            return asyncio.run(coro_factory()), tv
        except bridge_main.HTTPException as e:
            return e, tv
    finally:
        bridge_main.tv_session = real
        tvc._manager.breaker = CircuitBreaker()


res, tv = run_endpoint(lambda: bridge_main.scan_opportunities(bridge_main.ScanBody()))
check("scan-opportunities: one call, then stops", tv.calls, 1)
check("scan-opportunities: flagged", res["rate_limited"]["retry_after_s"], 60)
check("scan-opportunities: note says why", RATE_LIMITED_TXT in res["note"], True)

res, tv = run_endpoint(lambda: bridge_main.scan_watchlist(bridge_main.WatchlistScanBody(tickers=["MKTA", "MKTB", "MKTC"])))
check("scan-watchlist: one call, then stops", tv.calls, 1)
check("scan-watchlist: flagged", res["rate_limited"]["retry_after_s"], 60)
check("scan-watchlist: note says why", RATE_LIMITED_TXT in res["note"], True)

for name, factory in (
    ("market-overview", lambda: bridge_main.market_overview()),
    ("index-tracker", lambda: bridge_main.index_tracker()),
    ("gold-analysis", lambda: bridge_main.gold_analysis()),
):
    res, tv = run_endpoint(factory)
    check(f"{name}: one call, then a 503", (tv.calls, getattr(res, "status_code", None)), (1, 503))
    check(f"{name}: the 503 names the rate limit", RATE_LIMITED_TXT in res.detail, True)

print("\nALL PASS")
