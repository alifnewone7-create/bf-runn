"""Entry-price resolution must survive an OLD engine without `price_at`.

Reproduces the VPS "server error" on every trade placed from the UI (the client
always sends clientTickT, and the deployed market.py has no price_at).
Run: python3 /app/tests/test_entry_price_legacy_engine.py
"""
import os
import sys
import time

sys.path.insert(0, '/app/backend')
os.environ.setdefault('DATABASE_URL', 'postgresql+asyncpg://u:p@127.0.0.1:5432/none')
os.environ.setdefault('REDIS_URL', 'redis://127.0.0.1:6379/0')
os.environ.setdefault('JWT_SECRET', 'test-secret')

import routes.trade_routes as tr  # noqa: E402


class LegacyEngine:
    """Old deployed engine — price() only, NO price_at()."""
    def price(self, sym):
        return 1.09500


class NewEngine(LegacyEngine):
    def price_at(self, sym, ts):
        return 1.09321


class BrokenEngine(LegacyEngine):
    def price_at(self, sym, ts):
        raise RuntimeError("tick history unavailable")


def main():
    now = time.time()
    checks = []

    tr.engine = LegacyEngine()
    px = tr.resolve_entry_price("EURUSD_OTC", now, now)
    checks.append(("legacy engine + clientTickT falls back to price()", px == 1.09500))

    tr.engine = NewEngine()
    px = tr.resolve_entry_price("EURUSD_OTC", now, now)
    checks.append(("new engine uses price_at", px == 1.09321))

    px = tr.resolve_entry_price("EURUSD_OTC", now - 30, now)
    checks.append(("stale timestamp falls back to price()", px == 1.09500))

    px = tr.resolve_entry_price("EURUSD_OTC", now + 60, now)
    checks.append(("future timestamp falls back to price()", px == 1.09500))

    px = tr.resolve_entry_price("EURUSD_OTC", None, now)
    checks.append(("no clientTickT uses price()", px == 1.09500))

    px = tr.resolve_entry_price("EURUSD_OTC", "not-a-number", now)
    checks.append(("garbage timestamp does not raise", px == 1.09500))

    tr.engine = BrokenEngine()
    px = tr.resolve_entry_price("EURUSD_OTC", now, now)
    checks.append(("price_at raising falls back to price()", px == 1.09500))

    for label, ok in checks:
        print(f"{'PASS' if ok else 'FAIL'} — {label}")
    all_ok = all(ok for _, ok in checks)
    print("RESULT:", "ALL PASS" if all_ok else "FAILURES PRESENT")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
