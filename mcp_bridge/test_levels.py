"""Checks for ATR extraction + the ATR-floored baseline stop (v2.4.0).

Standalone assert script, same convention as test_selfheal.py:
    python -m mcp_bridge.test_levels
Exits non-zero on failure.

Root cause it guards: TradingView's coin_analysis returns the daily ATR, but extract_indicators
dropped it, so no AI prompt could size a stop to volatility (SPIN, Sep 2026: a stop ~1.4x ATR
under price was hit on ordinary noise).
"""
from mcp_bridge.tradingview_client import extract_indicators
from mcp_bridge.main import suggest_levels, STOP_ATR_MULT


def check(desc, got, want):
    assert got == want, f"FAIL: {desc}: got {got!r}, want {want!r}"
    print(f"ok: {desc}")


# extract_indicators copies ATR (value + % of price) from coin_analysis
ind = extract_indicators({"price_data": {"current_price": 18.38},
                          "atr": {"value": 0.9465, "percent_of_price": 5.15}})
check("atr copied", ind["atr"], 0.9465)
check("atr_pct copied", ind["atr_pct"], 5.15)
bare = extract_indicators({"price_data": {"current_price": 1}})
check("atr absent -> None", bare["atr"], None)
check("atr_pct absent -> None", bare["atr_pct"], None)

check("multiplier is 1.5", STOP_ATR_MULT, 1.5)

# structural support just under price: without ATR the stop hugs it (EMA50 99 * 0.99 = 98.01)
near = {"price": 100, "ema50": 99}
check("no ATR -> structural stop unchanged", suggest_levels(near)["stop"], 98.01)

# with ATR 2, the stop may be no closer than 100 - 1.5*2 = 97.0
check("ATR floors the stop at 1.5x ATR", suggest_levels({**near, "atr": 2})["stop"], 97.0)

# a huge ATR cannot push the baseline past the 10% cap
check("10% cap still wins", suggest_levels({**near, "atr": 10})["stop"], 90.0)

# structure already deeper than 1.5x ATR -> ATR doesn't move it (SPIN 08-28 baseline was 17.24)
spin = {"price": 19.16, "ema20": 17.68, "ema50": 16.27, "support_1": 13.86,
        "resistance_1": 17.76, "resistance_2": 19.78, "bb_upper": 20.96, "atr": 0.95}
check("deeper structure unaffected by ATR", suggest_levels(spin)["stop"], 17.24)

print("\nALL PASS")
