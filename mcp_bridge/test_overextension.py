"""Checks for the overextension inputs, the flags and the pullback-anchored entry zone (v2.5.0).

Standalone assert script, same convention as test_levels.py / test_selfheal.py:
    python -m mcp_bridge.test_overextension
Exits non-zero on failure.

Root causes these guard (SPIN Aug-Sep 2026, ALUM Aug-Sep 2026): the AI could not see how far price
had run from its own moving average, that the high had been rejected on a long upper wick, or that
its entry zone had crept up to equal the live price across successive scans.
"""
from mcp_bridge.tradingview_client import extract_indicators, extract_mtf


def check(desc, got, want):
    assert got == want, f"FAIL: {desc}: got {got!r}, want {want!r}"
    print(f"ok: {desc}")


# ALUM as of its Aug 28 2026 opportunity card: price 29.60, EMA20 27.06, daily ATR ~1.30, RSI 69.9
ALUM_28 = {
    "price_data": {"current_price": 29.60},
    "ema": {"ema20": 27.06},
    "atr": {"value": 1.30, "percent_of_price": 4.39},
    "rsi": {"value": 69.9, "previous": 69.1, "direction": "Rising"},
    "adx": {"value": 42.0, "plus_di": 35.68, "minus_di": 10.11},
    "market_structure": {"candle": {"type": "Bullish", "body_ratio": 0.62,
                                    "upper_wick_pct": 18.0, "lower_wick_pct": 20.0}},
    "trade_setup": {"entry_points": {"breakout_entry": 30.95, "pullback_entry": 27.90}},
}

ind = extract_indicators(ALUM_28)
check("rsi_prev copied", ind["rsi_prev"], 69.1)
check("candle_type copied", ind["candle_type"], "Bullish")
check("body_ratio copied", ind["body_ratio"], 0.62)
check("upper_wick_pct copied", ind["upper_wick_pct"], 18.0)
check("lower_wick_pct copied", ind["lower_wick_pct"], 20.0)
check("pullback_entry copied", ind["pullback_entry"], 27.90)
check("breakout_entry copied", ind["breakout_entry"], 30.95)
# (29.60 - 27.06) / 27.06 * 100
check("ext_ema20_pct", ind["ext_ema20_pct"], 9.39)
# (29.60 - 27.06) / 1.30 -> 1.95 ATR, i.e. under two ordinary days for a 4.4%-ATR name
check("ext_ema20_atr", ind["ext_ema20_atr"], 1.95)

bare = extract_indicators({"price_data": {"current_price": 10}})
check("no ema20 -> ext pct None", bare["ext_ema20_pct"], None)
check("no ema20 -> ext atr None", bare["ext_ema20_atr"], None)
check("no candle -> wick None", bare["upper_wick_pct"], None)
check("no trade_setup -> pullback None", bare["pullback_entry"], None)
check("no rsi -> rsi_prev None", bare["rsi_prev"], None)

no_atr = extract_indicators({"price_data": {"current_price": 29.60}, "ema": {"ema20": 27.06}})
check("pct works without ATR", no_atr["ext_ema20_pct"], 9.39)
check("atr multiple needs ATR", no_atr["ext_ema20_atr"], None)

zero_atr = extract_indicators({"price_data": {"current_price": 29.60}, "ema": {"ema20": 27.06},
                               "atr": {"value": 0}})
check("ATR 0 -> None (no divide by zero)", zero_atr["ext_ema20_atr"], None)

# multi-timeframe: the weekly RSI the AI never saw for SPIN rides on a call the scan already makes
MTF = {
    "timeframes": {
        "1W": {"bias": "Bullish", "rsi": {"value": 82.1, "previous": 78.4, "direction": "Rising"}},
        "1D": {"bias": "Bullish", "rsi": {"value": 69.9, "previous": 69.1, "direction": "Rising"}},
    },
    "alignment": {"status": "MOSTLY BULLISH", "confidence": "High", "net_score": 4},
    "recommendation": {"action": "BUY"},
}
m = extract_mtf(MTF)
check("weekly_rsi", m["weekly_rsi"], 82.1)
check("weekly_rsi_prev", m["weekly_rsi_prev"], 78.4)
check("weekly_rsi_dir", m["weekly_rsi_dir"], "Rising")
check("daily_rsi", m["daily_rsi"], 69.9)
check("weekly bias still parsed", m["weekly_bias"], "Bullish")
check("wd_aligned still parsed", m["wd_aligned"], True)

m_bare = extract_mtf({"timeframes": {"1W": {"bias": "Bullish"}}})
check("mtf without rsi -> None", m_bare["weekly_rsi"], None)
check("mtf error -> None", extract_mtf({"error": "x"}), None)

from mcp_bridge.main import (  # noqa: E402  (imported after the extraction checks above)
    overextension_flags,
    suggest_levels,
    WEEKLY_RSI_OVERBOUGHT,
    RSI_BAND_CEILING,
    EXT_EMA20_ATR,
    EXT_EMA20_PCT_MAX,
    UPPER_WICK_PCT,
    UPPER_WICK_BODY_MAX,
    ADX_EXHAUSTION,
)

check("thresholds are the agreed values",
      [WEEKLY_RSI_OVERBOUGHT, RSI_BAND_CEILING, EXT_EMA20_ATR, EXT_EMA20_PCT_MAX,
       UPPER_WICK_PCT, UPPER_WICK_BODY_MAX, ADX_EXHAUSTION],
      [75.0, 68.0, 2.0, 12.0, 40.0, 0.40, 50.0])

check("no data -> no flags", overextension_flags({}, None), [])

# ALUM Aug 28: RSI 69.9 is at the band ceiling, but 1.95 ATR above EMA20 is NOT overextended.
check("ALUM Aug-28 flags the RSI ceiling only",
      overextension_flags(extract_indicators(ALUM_28), {"weekly_rsi": 55.6}),
      ["rsi_at_band_ceiling"])

# A quiet name 9% above its EMA20 with a 1.8 ATR is five ordinary days out — that IS chasing.
quiet = extract_indicators({"price_data": {"current_price": 109.0},
                            "ema": {"ema20": 100.0}, "atr": {"value": 1.8}})
check("low-ATR name 9% above EMA20 does flag", overextension_flags(quiet), ["extended_above_ema20"])

check("weekly RSI 75 flags", overextension_flags({}, {"weekly_rsi": 75.0}), ["weekly_rsi_overbought"])
check("weekly RSI 74.9 does not", overextension_flags({}, {"weekly_rsi": 74.9}), [])
check("daily RSI 68 flags", overextension_flags({"rsi": 68.0}), ["rsi_at_band_ceiling"])
check("daily RSI 67.9 does not", overextension_flags({"rsi": 67.9}), [])
check("ADX 50 flags", overextension_flags({"adx": 50.0}), ["adx_exhaustion"])
check("ADX 49.9 does not", overextension_flags({"adx": 49.9}), [])
check("a long wick needs a small body too",
      overextension_flags({"upper_wick_pct": 45.0, "body_ratio": 0.55}), [])
check("wick 45 on body 0.30 flags",
      overextension_flags({"upper_wick_pct": 45.0, "body_ratio": 0.30}), ["upper_wick_rejection"])
check("the 12% backstop fires without ATR",
      overextension_flags({"ext_ema20_pct": 12.0}), ["extended_above_ema20"])
check("flag order is stable",
      overextension_flags({"rsi": 70.0, "adx": 60.0, "ext_ema20_atr": 3.0,
                           "upper_wick_pct": 50.0, "body_ratio": 0.2}, {"weekly_rsi": 80.0}),
      ["weekly_rsi_overbought", "rsi_at_band_ceiling", "extended_above_ema20",
       "upper_wick_rejection", "adx_exhaustion"])

# ── entry zone ────────────────────────────────────────────────────────────────
clean = {"price": 100.0, "ema20": 99.0, "ema50": 98.0, "atr": 1.0}
check("unflagged zone is v2.4.0 behaviour", suggest_levels(clean)["entry_zone"], [99.0, 100.0])

far = suggest_levels({"price": 100.0, "ema20": 90.0, "ema50": 88.0, "atr": 2.0,
                      "pullback_entry": 92.0}, ["extended_above_ema20"])
check("flagged zone anchors to the nearest level below price", far["entry_zone"], [90.62, 92.0])

nolevels = suggest_levels({"price": 100.0, "ema20": 105.0, "atr": 1.0}, ["adx_exhaustion"])
check("no level below price -> 3% under", nolevels["entry_zone"], [95.55, 97.0])

# structural support sits just under price while the pullback level is far below: the stop must be
# pulled under the lowered entry, even though that crosses the price*0.90 floor (intended).
clamped = suggest_levels({"price": 100.0, "ema20": 88.0, "ema50": 99.0, "atr": 0.5,
                          "pullback_entry": 88.0}, ["extended_above_ema20"])
check("stop is pulled under a lowered entry", clamped["stop"], 86.68)
check("stop stays below the zone top", clamped["stop"] < clamped["entry_zone"][1], True)
check("R:R is measured from the entry, not the live price", clamped["rr"] is not None, True)

print("\nALL PASS")
