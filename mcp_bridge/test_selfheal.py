"""Unit test for the bridge's transient/throttle detection (self-heal trigger).

The project has no pytest setup, so this is a standalone assert script:
    python mcp_bridge/test_selfheal.py
Exits non-zero on failure.

Root cause it guards: TradingView hands the MCP tool an EMPTY body when a connection is
throttled/stuck; the tool returns that as a RESULT payload (not an exception), e.g.
  coin_analysis -> {"error": "Analysis failed: Expecting value: line 1 column 1 (char 0)"}
  screener      -> {"error": "No data returned for EGX stocks"}
The manager must recognise these as recoverable (reconnect + retry), NOT as a genuine
per-symbol "no data".
"""
from mcp_bridge.tradingview_client import _is_transient


def check(desc, got, want):
    assert got == want, f"FAIL: {desc}: got {got!r}, want {want!r}"
    print(f"ok: {desc}")


# recoverable empty-body / throttle signatures -> True
check("coin_analysis empty-body JSON error",
      _is_transient({"error": "Analysis failed: Expecting value: line 1 column 1 (char 0)"}), True)
check("screener empty-body error",
      _is_transient({"error": "No data returned for EGX stocks"}), True)
check("bare json-parse error",
      _is_transient({"error": "Expecting value: line 1 column 1 (char 0)"}), True)

# genuine / unrelated results -> False (must NOT trigger a reconnect)
check("successful result", _is_transient({"price": 127.5, "adx": 14.7}), False)
check("empty dict", _is_transient({}), False)
check("unrelated error", _is_transient({"error": "symbol NOTATICKER not found"}), False)
check("timeout error is not a throttle signature",
      _is_transient({"error": "coin_analysis timed out after 45s"}), False)
check("non-dict input", _is_transient("nope"), False)

print("\nALL PASS")
