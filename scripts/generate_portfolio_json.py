#!/usr/bin/env python3
"""
generate_portfolio_json.py — Tier 1 of the EGX dashboard build.

Parses the source-of-truth data out of build_portfolio_v3.py (the STOCKS list and the
Action Log LOG list) plus the exited-positions table from PORTFOLIO.md, and writes
backend/data/portfolio_data.json in the schema the dashboard backend consumes.

No execution of build_portfolio_v3.py and no openpyxl dependency: we read the literals
straight out of the source with `ast`, so this stays robust to that script's drawing code.

STOCKS tuple order (the ACTUAL order in the code — prompt.md's prose list is wrong):
  0 ticker      1 avg          2 live        3 shares      4 stop
  5 stop_raised 6 t1_price     7 t1_hit      8 t2_price    9 position_label
 10 daily_chg  11 chg_pos     12 status_key 13 tv_signal  14 analysis_notes
 15 add_zone   16 sell_plan
"""

from __future__ import annotations

import ast
import hashlib
import json
import re
import warnings
from pathlib import Path

# ── Paths ────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
BUILD_SRC = ROOT / "build_portfolio_v3.py"
PORTFOLIO_MD = ROOT / "PORTFOLIO.md"
OUT = ROOT / "backend" / "data" / "portfolio_data.json"

# ── Constants from the spec ──────────────────────────────────────────────────
ILLIQUID_OR_NO_LIVE = {"EGX30ETF", "BAL", "CCB"}  # is_liquid = False for these
REALIZED_PNL = 27.76
DEADLINE_POSITIONS = ["BAL", "CCB"]
DEADLINE_DATE = "2026-06-24T12:00:00"  # Cairo time, UTC+3 (per spec)


def _norm_minus(s: str) -> str:
    """Normalize unicode minus / dashes to ASCII '-'."""
    return s.replace("−", "-").replace("–", "-").replace("—", "-")


def extract_literal(source: str, var_name: str):
    """Return the Python object assigned to `var_name` anywhere in `source` (first match).

    Uses ast so we never execute the module. Handles implicitly-concatenated string
    literals and unicode escapes in the data.
    """
    with warnings.catch_warnings():
        # build_portfolio_v3.py contains a stray escape in an f-string; harmless to us.
        warnings.simplefilter("ignore", SyntaxWarning)
        tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == var_name:
                    return ast.literal_eval(node.value)
    raise ValueError(f"Could not find assignment to {var_name!r} in source")


# ── P&L extraction from free-text notes (best-effort, high precision) ─────────
_PNL_LABELLED = re.compile(
    r"(Loss|Profit|Net loss|Net|Realized|realized)\s*[:=]?\s*\+?(-?\d[\d,]*\.\d+)\s*EGP"
)
_PNL_EQUALS = re.compile(r"=\s*\+?(-?\d[\d,]*\.\d+)\s*EGP")
_PNL_SIGNED = re.compile(r"([+\-]\d[\d,]*\.\d+)\s*EGP")


def extract_pnl(notes: str):
    """Pull an explicit realized P&L (EGP) out of a notes string, or None."""
    if not notes:
        return None
    text = _norm_minus(notes)
    m = _PNL_LABELLED.search(text)
    if m:
        label, num = m.group(1).lower(), m.group(2)
        val = float(num.replace(",", ""))
        if "loss" in label and val > 0:  # "Loss: 78.40" without a sign → negative
            val = -val
        return round(val, 2)
    m = _PNL_EQUALS.search(text)
    if m:
        return round(float(m.group(1).replace(",", "")), 2)
    m = _PNL_SIGNED.search(text)
    if m:
        return round(float(m.group(1).replace(",", "")), 2)
    return None


def classify_action(action: str, notes: str) -> str:
    """Map a LOG row to a dashboard order type."""
    n = (notes or "").lower()
    if action == "BUY":
        return "BUY (add)" if ("add " in n or "added" in n) else "BUY"
    # SELL
    if "stop triggered" in n or "stop-out" in n or re.search(r"stop\s*@", n):
        return "STOP-OUT"
    return "SELL"


def stable_id(*parts) -> str:
    raw = "|".join(str(p) for p in parts)
    return hashlib.md5(raw.encode("utf-8")).hexdigest()[:12]


# ── Build positions[] from STOCKS ────────────────────────────────────────────
def build_positions(stocks) -> list[dict]:
    positions = []
    for s in stocks:
        (ticker, avg, live, shares, stop, stop_raised, t1, t1_hit, t2,
         pos_label, daily_chg, chg_pos, status_key, tv_sig,
         notes, add_zone, sell_plan) = s

        is_liquid = ticker not in ILLIQUID_OR_NO_LIVE
        if live and live > 0:
            unrealized_pnl = round((live - avg) * shares, 2)
            unrealized_pct = round((live - avg) / avg * 100, 2) if avg else None
        else:
            unrealized_pnl = None
            unrealized_pct = None

        positions.append({
            "ticker": ticker,
            "avg_cost": avg,
            "live_price": live,
            "shares": shares,
            "stop_loss": stop,
            "stop_raised": bool(stop_raised),
            "t1_hit": bool(t1_hit),
            "t1_price": t1,
            "t2_price": t2,
            "position_label": pos_label,
            "daily_chg": daily_chg,
            "chg_pos": chg_pos,            # True / False / None (no live data)
            "status_key": status_key,
            "tv_signal": tv_sig,
            "analysis_notes": notes,
            "add_zone": add_zone,
            "sell_plan": sell_plan,
            "unrealized_pnl": unrealized_pnl,
            "unrealized_pct": unrealized_pct,
            "is_liquid": is_liquid,
            # live indicator fields — filled by the bridge on refresh
            "adx": None, "plus_di": None, "minus_di": None, "rsi": None,
            "macd_histogram": None, "ema20": None, "ema50": None,
            "bb_upper": None, "bb_lower": None,
            "alert": None,
            # AI analysis — filled by /api/analyze (headless claude)
            "ai": None,
        })
    return positions


# ── Build action_log[] from the build-script LOG ─────────────────────────────
def build_action_log(log) -> list[dict]:
    entries = []
    for row in log:
        date, action, stock, qty, price, new_avg, tot_sh, notes = row
        entries.append({
            "id": stable_id(date, action, stock, qty, price),
            "date": date,
            "type": classify_action(action, notes),
            "ticker": stock,
            "shares": qty,
            "price": price,
            "new_avg_cost": new_avg,
            "total_shares": tot_sh,
            "fifo_cost": None,
            "realized_pnl": extract_pnl(notes),
            "notes": notes,
        })
    return entries


# ── Build exited_positions[] from PORTFOLIO.md table ─────────────────────────
def build_exited_positions(md_text: str) -> list[dict]:
    lines = md_text.splitlines()
    # locate the "## Fully Exited Positions" section
    start = next((i for i, l in enumerate(lines)
                  if l.strip().lower().startswith("## fully exited positions")), None)
    if start is None:
        return []
    out = []
    for l in lines[start + 1:]:
        st = l.strip()
        if st.startswith("## "):  # next section
            break
        if not st.startswith("|"):
            continue
        cells = [c.strip() for c in st.strip("|").split("|")]
        if len(cells) < 5:
            continue
        # skip header + separator rows
        if cells[0].lower() in ("stock", "") or set(cells[1]) <= {"-", ":", " "}:
            continue
        stock_raw, exit_date, exit_price_raw, shares_raw, pnl_raw = cells[:5]

        ticker = re.split(r"\s*\(", stock_raw)[0].strip()
        approx = "~" in exit_price_raw or "~" in pnl_raw or "~" in shares_raw

        pm = re.search(r"-?\d[\d,]*\.?\d*", _norm_minus(exit_price_raw))
        exit_price = float(pm.group().replace(",", "")) if pm else None
        exit_type = "STOP-OUT" if "stop" in exit_price_raw.lower() else "SELL"

        sm = re.search(r"\d[\d,]*", shares_raw)
        shares = int(sm.group().replace(",", "")) if sm else None

        plm = re.search(r"-?\d[\d,]*\.?\d*", _norm_minus(pnl_raw))
        realized_pnl = float(plm.group().replace(",", "")) if plm else None

        # back out avg cost: avg = exit_price - pnl/shares  (exact for full exits)
        avg_cost = None
        if exit_price is not None and realized_pnl is not None and shares:
            avg_cost = round(exit_price - realized_pnl / shares, 4)

        out.append({
            "ticker": ticker,
            "exit_date": exit_date,
            "exit_price": exit_price,
            "shares": shares,
            "avg_cost": avg_cost,
            "realized_pnl": realized_pnl,
            "exit_type": exit_type,
            "approximate": approx,
        })
    return out


def main():
    src = BUILD_SRC.read_text(encoding="utf-8")
    stocks = extract_literal(src, "STOCKS")
    log = extract_literal(src, "LOG")
    md = PORTFOLIO_MD.read_text(encoding="utf-8")

    data = {
        "positions": build_positions(stocks),
        "realized_pnl": REALIZED_PNL,
        "last_refresh": None,
        "deadline_positions": DEADLINE_POSITIONS,
        "deadline_date": DEADLINE_DATE,
        "action_log": build_action_log(log),
        "exited_positions": build_exited_positions(md),
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    # ── Verification ─────────────────────────────────────────────────────────
    print(f"Wrote {OUT}")
    print(f"positions       : {len(data['positions'])}")
    print(f"action_log       : {len(data['action_log'])}")
    print(f"exited_positions : {len(data['exited_positions'])}")
    tickers = [p["ticker"] for p in data["positions"]]
    print(f"tickers          : {tickers}")
    liq = [p['ticker'] for p in data['positions'] if p['is_liquid']]
    print(f"liquid           : {liq}")
    unreal = sum(p["unrealized_pnl"] for p in data["positions"]
                 if p["unrealized_pnl"] is not None)
    print(f"sum unrealized   : {round(unreal, 2)} EGP")
    cana = next(p for p in data["positions"] if p["ticker"] == "CANA")
    print(f"CANA unreal_pnl  : {cana['unrealized_pnl']} (exp 330.0), "
          f"pct {cana['unrealized_pct']} (exp ~3.68), status {cana['status_key']}")
    raya_exit = next((e for e in data["exited_positions"] if e["ticker"] == "RAYA"), None)
    if raya_exit:
        print(f"RAYA exit avg_cost: {raya_exit['avg_cost']} (exp 7.67), "
              f"pnl {raya_exit['realized_pnl']}")
    pnl_filled = sum(1 for e in data["action_log"] if e["realized_pnl"] is not None)
    print(f"action_log P&L filled: {pnl_filled}/{len(data['action_log'])}")


if __name__ == "__main__":
    main()
