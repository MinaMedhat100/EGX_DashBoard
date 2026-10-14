"""Checks for the index support/resistance levels (v2.9.0).

Standalone assert script, same convention as test_levels.py:
    python -m mcp_bridge.test_index_levels
Exits non-zero on failure.

Why: the Indices page showed one support and one resistance (pivot S1/R1). The zones need every level
coin_analysis offers, daily and weekly — but not TradingView's 1W pivots, which are unusable (a weekly
pivot far below the index while the daily ones bracket it).
"""
from mcp_bridge.tradingview_client import extract_levels


def check(desc, got, want):
    assert got == want, f"FAIL: {desc}: got {got!r}, want {want!r}"
    print(f"ok: {desc}")


RAW = {
    "price_data": {"current_price": 1000, "high": 1010, "low": 990},
    "support_resistance": {"pivot": 1005, "support_1": 980, "support_2": 960, "support_3": 940,
                           "resistance_1": 1020, "resistance_2": 1040, "resistance_3": None},
    "ema": {"ema10": 1001, "ema20": 1002, "ema30": 1003, "ema50": 1004, "ema100": 0, "ema200": 900.456},
    "sma": {"sma50": 950, "sma200": 800},
    "bollinger_bands": {"upper": 1050, "middle": 1000, "lower": 950},
}

d = {x["name"]: x for x in extract_levels(RAW, "D")}
check("daily pivot", d["Pivot"], {"name": "Pivot", "tf": "D", "value": 1005})
check("daily S3", d["Pivot S3"]["value"], 940)
check("daily R3 None skipped", "Pivot R3" in d, False)
check("ema100 <= 0 skipped", "EMA100" in d, False)
check("ema200 rounded 2", d["EMA200"]["value"], 900.46)
check("daily has no SMA", "SMA50" in d, False)
check("bb lower", d["BB lower"]["value"], 950)
check("day high", d["Day high"]["value"], 1010)
check("day low", d["Day low"]["value"], 990)
check("daily count", len(d), 16)  # pivot + S1-S3 + R1-R2, 5 EMAs (EMA100 is 0), 3 BB, day high/low

w = {x["name"]: x for x in extract_levels(RAW, "W")}
check("weekly pivots ignored", any(k.startswith("Pivot") for k in w), False)
check("weekly tf", w["EMA50"]["tf"], "W")
check("weekly sma50", w["SMA50"]["value"], 950)
check("weekly sma200", w["SMA200"]["value"], 800)
check("week high", w["Week high"]["value"], 1010)
check("week low name", "Day low" in w, False)

check("error reply -> []", extract_levels({"error": "no data"}, "D"), [])
check("None -> []", extract_levels(None, "W"), [])
check("bool ignored", extract_levels({"ema": {"ema10": True}}, "W"), [])

print("all index-level checks passed")
