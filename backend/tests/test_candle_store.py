"""Backend tests for the persisted OTC candle store — /api/market/candles.

Covers:
- Latest page shape (count ~500-501 due to forming-bucket overlay, has_more, ordering, uniqueness)
- Pagination with `before` (contiguous, no gap/overlap, byte-consistent on repeat)
- Restart persistence (identical response before + after `supervisorctl restart backend`)
- Timeframe matrix (5, 300, 3600, 14400, 86400), invalid tf / unknown symbol
- tf=5 limited depth (~2 days) then has_more=false
- Aggregation correctness: tf=300 open == first tf=60 open in bucket; high == max
"""
import os
import subprocess
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
SYM = "EURUSD_OTC"


def _get(params):
    r = requests.get(f"{BASE_URL}/api/market/candles", params=params, timeout=30)
    return r


# ---------- Latest page ----------
class TestLatestPage:
    def test_latest_shape(self):
        r = _get({"symbol": SYM, "tf": 60, "limit": 500})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["symbol"] == SYM
        assert d["tf"] == 60
        assert d["has_more"] is True
        candles = d["candles"]
        # forming bucket overlay adds 1 extra -> 500 or 501
        assert 500 <= len(candles) <= 501, f"got {len(candles)}"
        # Strictly ascending, unique times, aligned to tf bucket
        times = [c["time"] for c in candles]
        assert times == sorted(times)
        assert len(set(times)) == len(times)
        for t in times:
            assert t % 60 == 0
        # Last candle time == current minute bucket
        now_bucket = int(time.time()) - int(time.time()) % 60
        assert candles[-1]["time"] == now_bucket, f"last={candles[-1]['time']} nowb={now_bucket}"


# ---------- Pagination ----------
class TestPagination:
    def test_before_contiguous(self):
        first = _get({"symbol": SYM, "tf": 60, "limit": 500}).json()
        first_time = first["candles"][0]["time"]
        older = _get({"symbol": SYM, "tf": 60, "limit": 500, "before": first_time}).json()
        assert older["has_more"] is True
        assert len(older["candles"]) == 500
        # newest older == first_time - 60 (contiguous)
        assert older["candles"][-1]["time"] == first_time - 60
        # No overlap
        assert older["candles"][-1]["time"] < first_time
        # Ascending unique
        times = [c["time"] for c in older["candles"]]
        assert times == sorted(times)
        assert len(set(times)) == len(times)

    def test_before_repeated_identical(self):
        first = _get({"symbol": SYM, "tf": 60, "limit": 500}).json()
        before_ts = first["candles"][0]["time"]
        a = _get({"symbol": SYM, "tf": 60, "limit": 500, "before": before_ts}).json()
        b = _get({"symbol": SYM, "tf": 60, "limit": 500, "before": before_ts}).json()
        # historical page must be byte-identical between calls (consistency)
        assert a == b


# ---------- Restart persistence ----------
class TestRestartPersistence:
    def test_identical_after_restart(self):
        first = _get({"symbol": SYM, "tf": 60, "limit": 500}).json()
        before_ts = first["candles"][0]["time"]
        pre = _get({"symbol": SYM, "tf": 60, "limit": 500, "before": before_ts}).json()

        subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=True, timeout=30)
        # Wait for candle store to be ready again
        deadline = time.time() + 40
        while time.time() < deadline:
            try:
                probe = _get({"symbol": SYM, "tf": 60, "limit": 5})
                if probe.status_code == 200 and probe.json().get("candles"):
                    # Wait a touch more so has_more/store 'ready' is set
                    if probe.json().get("has_more") is True:
                        break
            except Exception:
                pass
            time.sleep(1)
        post = _get({"symbol": SYM, "tf": 60, "limit": 500, "before": before_ts}).json()
        assert pre == post, "historical page changed after restart"


# ---------- Timeframes ----------
class TestTimeframes:
    @pytest.mark.parametrize("tf", [5, 300, 3600, 14400, 86400])
    def test_tf_returns_data(self, tf):
        r = _get({"symbol": SYM, "tf": tf, "limit": 50})
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["candles"]) > 0
        for c in d["candles"]:
            assert c["time"] % tf == 0
            assert c["high"] >= c["low"]
            assert c["high"] >= c["open"] and c["high"] >= c["close"]
            assert c["low"] <= c["open"] and c["low"] <= c["close"]

    def test_invalid_tf(self):
        r = _get({"symbol": SYM, "tf": 7, "limit": 10})
        assert r.status_code == 400

    def test_unknown_symbol(self):
        r = _get({"symbol": "NOPE_OTC", "tf": 60, "limit": 10})
        assert r.status_code == 404

    def test_tf5_has_limited_depth(self):
        # Walk back through tf=5 pages until has_more is False; should hit within ~2 days worth
        # 2d @ 5s = 34,560 buckets. With limit=500 that's ~70 pages max. Cap to 80 for safety.
        d = _get({"symbol": SYM, "tf": 5, "limit": 500}).json()
        assert d["candles"], "tf=5 latest page should have candles"
        before_ts = d["candles"][0]["time"]
        # If the very first page already reports no more, that's still valid
        if d["has_more"] is False:
            return
        pages = 0
        while pages < 90:
            p = _get({"symbol": SYM, "tf": 5, "limit": 500, "before": before_ts}).json()
            pages += 1
            if not p["candles"]:
                # Should indicate no more history
                assert p["has_more"] is False
                return
            if not p["has_more"]:
                return
            before_ts = p["candles"][0]["time"]
        pytest.fail(f"tf=5 has_more never became false within {pages} pages")


# ---------- Aggregation correctness ----------
class TestAggregation:
    def test_5m_matches_1m(self):
        # Fetch aligned window: pick a 5m bucket from history, verify against 5 x 1m
        five = _get({"symbol": SYM, "tf": 300, "limit": 20}).json()
        # Use a completed bucket (not the last one which might be the forming overlay)
        bucket = five["candles"][-3]  # safely completed
        b = bucket["time"]
        # Fetch tf=60 window covering [b, b+300)
        # Use before=b+300 to align (exclusive upper bound). But easier: pull ~500 and filter.
        one_m = _get({"symbol": SYM, "tf": 60, "limit": 500, "before": b + 300}).json()["candles"]
        sub = [c for c in one_m if b <= c["time"] < b + 300]
        assert len(sub) == 5, f"expected 5 x 1m in bucket {b}, got {len(sub)}"
        assert bucket["open"] == pytest.approx(sub[0]["open"])
        assert bucket["high"] == pytest.approx(max(c["high"] for c in sub))
        assert bucket["low"] == pytest.approx(min(c["low"] for c in sub))
        assert bucket["close"] == pytest.approx(sub[-1]["close"])
