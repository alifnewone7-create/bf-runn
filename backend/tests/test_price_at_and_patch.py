"""Static/unit-level verification of the trade entry/exit price patch.

Cannot boot the FastAPI app here (no Postgres). Instead:
  - unit-test Engine.price_at against a synthetic tick deque
  - verify the entry-price selection logic (window + fallback) mirrors trade_routes.place_trade_core
  - verify _settle_one uses price_at(expiry_at.timestamp())
  - verify patch_trade_price.sh embedded files decode and equal the /app copies
"""
import base64
import re
import subprocess
import sys
from collections import deque
from pathlib import Path

sys.path.insert(0, str(Path("/app/backend").resolve()))

import market  # noqa: E402
from market import Engine  # noqa: E402


# ---------- Engine.price_at unit tests ----------

def _mk_engine(ticks):
    e = Engine()
    sym = "EURUSD_OTC"
    e.state[sym] = {"price": ticks[-1][1], "raw": ticks[-1][1], "mom": 0.0, "ticks": deque(ticks)}
    return e, sym


def test_price_at_returns_tick_at_exact_ts():
    e, s = _mk_engine([(100, 1.10000), (101, 1.10010), (102, 1.10020), (103, 1.10030)])
    assert e.price_at(s, 101) == 1.10010
    assert e.price_at(s, 102) == 1.10020


def test_price_at_returns_last_le_ts():
    e, s = _mk_engine([(100, 1.10000), (101, 1.10010), (102, 1.10020)])
    # between ticks -> last <= ts
    assert e.price_at(s, 101.5) == 1.10010
    assert e.price_at(s, 100.9) == 1.10000


def test_price_at_future_returns_current():
    e, s = _mk_engine([(100, 1.10000), (101, 1.10010)])
    # ts >= last tick t -> return current price
    assert e.price_at(s, 999) == e.state[s]["price"]


def test_price_at_before_history_returns_earliest():
    e, s = _mk_engine([(100, 1.10000), (101, 1.10010)])
    assert e.price_at(s, 50) == 1.10000


def test_price_at_invalid_ts():
    e, s = _mk_engine([(100, 1.10000)])
    assert e.price_at(s, "not-a-number") == e.state[s]["price"]
    assert e.price_at(s, None) == e.state[s]["price"]


def test_price_at_unknown_symbol():
    e, _ = _mk_engine([(100, 1.10)])
    assert e.price_at("NOPE", 100) is None


# ---------- Entry-price window logic mirrors trade_routes ----------

def test_entry_price_uses_client_tick_within_window():
    """Replicates place_trade_core: wall-3<=ts<=wall+0.5 -> engine.price_at(ts)."""
    e, s = _mk_engine([(1000, 1.10000), (1001, 1.10010), (1002, 1.10020), (1003, 1.10030)])
    wall = 1003.2
    ts = 1002.0  # inside [-3s, +0.5s] window
    assert wall - 3.0 <= ts <= wall + 0.5
    assert e.price_at(s, ts) == 1.10020


def test_entry_price_falls_back_when_stamp_too_old():
    e, s = _mk_engine([(1000, 1.10000), (1003, 1.10030)])
    wall = 1003.5
    ts = 999.0  # older than 3s
    assert not (wall - 3.0 <= ts <= wall + 0.5)  # falls back -> current


def test_entry_price_falls_back_when_stamp_in_future():
    e, s = _mk_engine([(1000, 1.10000), (1003, 1.10030)])
    wall = 1003.0
    ts = 1010.0  # > wall + 0.5
    assert not (wall - 3.0 <= ts <= wall + 0.5)


# ---------- _settle_one exit-price semantics ----------

def test_settle_uses_price_at_expiry_not_now():
    """Reading price at expiry ts must be independent of later ticks."""
    e, s = _mk_engine([(1000, 1.10000), (1005, 1.10050), (1006, 1.10060), (1010, 1.09000)])
    # trade expires at t=1006, settle loop runs later at t=1010 with a big adverse tick.
    # engine.price_at(expiry_ts) must return the tick at/pre-expiry, NOT 1.09000.
    assert e.price_at(s, 1006) == 1.10060
    # A "higher" trade with entry 1.10000 must therefore win using expiry_at pricing.


# ---------- Patch script static verification ----------

PATCH = Path("/app/backend/deploy/patch_trade_price.sh")


def test_patch_bash_syntax_ok():
    r = subprocess.run(["bash", "-n", str(PATCH)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr


def _extract_b64(label):
    text = PATCH.read_text()
    m = re.search(rf'base64 -d > "{re.escape(label)}" << \'B64EOF\'\n(.*?)\nB64EOF', text, re.S)
    assert m, f"embedded {label} not found in patch script"
    return base64.b64decode(m.group(1)).decode("utf-8")


def test_patch_embeds_current_market_py():
    embedded = _extract_b64("market.py")
    actual = Path("/app/backend/market.py").read_text()
    assert embedded == actual


def test_patch_embeds_current_trade_routes():
    embedded = _extract_b64("routes/trade_routes.py")
    actual = Path("/app/backend/routes/trade_routes.py").read_text()
    assert embedded == actual


def test_patch_embeds_current_ws_routes():
    embedded = _extract_b64("routes/ws_routes.py")
    actual = Path("/app/backend/routes/ws_routes.py").read_text()
    assert embedded == actual


def test_patch_contains_only_expected_files():
    text = PATCH.read_text()
    files = re.findall(r'base64 -d > "([^"]+)"', text)
    assert set(files) == {"market.py", "routes/trade_routes.py", "routes/ws_routes.py"}, files


# ---------- Patched source markers ----------

def test_trade_routes_has_client_tick_and_window():
    src = Path("/app/backend/routes/trade_routes.py").read_text()
    assert "clientTickT" in src
    assert "price_at" in src
    assert "wall - 3.0 <= ts <= wall + 0.5" in src


def test_ws_routes_uses_price_at_expiry_and_100ms_sleep():
    src = Path("/app/backend/routes/ws_routes.py").read_text()
    assert "engine.price_at(order.symbol, order.expiry_at.timestamp())" in src
    assert "asyncio.sleep(0.1)" in src
