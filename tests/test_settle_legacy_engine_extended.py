"""Extended regression: legacy-engine settlement — lost/lower/unknown-symbol.

Complements /app/tests/test_settle_legacy_engine.py.
Run: python3 /app/tests/test_settle_legacy_engine_extended.py
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

sys.path.insert(0, '/app/backend')
os.environ.setdefault('DATABASE_URL', 'postgresql+asyncpg://u:p@127.0.0.1:5432/none')
os.environ.setdefault('REDIS_URL', 'redis://127.0.0.1:6379/0')
os.environ.setdefault('JWT_SECRET', 'test-secret')


class LegacyEngine:
    def __init__(self):
        self.meta = {"EURUSD_OTC": {"name": "EUR/USD", "payout": 90.0}}

    def price(self, sym):
        if sym not in self.meta:
            raise KeyError(sym)
        return 1.09000

    def payouts(self):
        return {s: m["payout"] for s, m in self.meta.items()}


class NoPayoutsEngine:
    """Even older engine: no payouts() method, only meta['payout']."""
    def __init__(self):
        self.meta = {"EURUSD_OTC": {"name": "EUR/USD", "payout": 80.0}}

    def price(self, sym):
        return 1.07000  # below entry 1.08 → higher loses, lower wins


class FakeDB:
    def __init__(self, wallet):
        self.wallet = wallet
        self.added = []

    async def get(self, _model, _id):
        return self.wallet

    def add(self, obj):
        self.added.append(obj)


def make_order(direction="higher", entry="1.08000", payout="90.00", symbol="EURUSD_OTC"):
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id="ord-x", user_id="user-1", wallet_id="w-1", symbol=symbol,
        direction=direction, stake=Decimal("10.00"), payout_pct=Decimal(payout),
        entry_price=Decimal(entry), expiry_seconds=60,
        expiry_at=now - timedelta(seconds=1), created_at=now - timedelta(seconds=61),
        status="open", exit_price=None, pnl=None, settled_at=None,
    )


async def main():
    import routes.ws_routes as ws
    ws.Transaction = lambda **kw: SimpleNamespace(**kw)
    failures = []

    # A) LOST — higher, exit 1.09 above entry? Actually price=1.09, entry=1.10 → lost.
    ws.engine = LegacyEngine()
    order = make_order(entry="1.10000", direction="higher")
    wallet = SimpleNamespace(id="w-1", balance=Decimal("100.00"))
    closed, bal = await ws._settle_one(FakeDB(wallet), order)
    print("A) higher-lost:", closed["status"], "profit", closed["profit"], "bal", bal)
    if closed["status"] != "lost" or closed["profit"] != -10.0 or bal != 100.0:
        failures.append(f"A expected lost -10 bal 100 got {closed} bal={bal}")

    # B) LOWER direction wins when exit < entry.
    ws.engine = LegacyEngine()
    order = make_order(entry="1.10000", direction="lower")
    wallet = SimpleNamespace(id="w-1", balance=Decimal("100.00"))
    closed, bal = await ws._settle_one(FakeDB(wallet), order)
    print("B) lower-won:", closed["status"], "profit", closed["profit"], "bal", bal)
    if closed["status"] != "won" or closed["profit"] != 9.0:
        failures.append(f"B expected won 9.0 got {closed}")

    # C) Unknown symbol — engine.price() raises → refund path, stake returned.
    ws.engine = LegacyEngine()
    order = make_order(symbol="XXX_OTC")
    wallet = SimpleNamespace(id="w-1", balance=Decimal("100.00"))
    closed, bal = await ws._settle_one(FakeDB(wallet), order)
    print("C) unknown-sym:", closed["status"], "profit", closed["profit"], "bal", bal)
    if closed["status"] != "tie" or closed["profit"] != 0.0 or bal != 110.0:
        failures.append(f"C expected tie/refund bal=110 got {closed} bal={bal}")

    # D) Engine without payouts() — must fall back to meta[sym]['payout'].
    ws.engine = NoPayoutsEngine()
    order = make_order(entry="1.08000", direction="higher", payout="90.00")  # exit 1.07 → lost
    wallet = SimpleNamespace(id="w-1", balance=Decimal("100.00"))
    closed, _ = await ws._settle_one(FakeDB(wallet), order)
    # payout_pct should have been rewritten from 90 to 80 via meta fallback
    print("D) no-payouts-fn: payout_pct", order.payout_pct, "status", closed["status"])
    if order.payout_pct != Decimal("80"):
        failures.append(f"D expected payout_pct 80 (meta fallback) got {order.payout_pct}")

    # E) Exit == entry — refund/tie.
    ws.engine = LegacyEngine()
    order = make_order(entry="1.09000", direction="higher")  # exit==entry
    wallet = SimpleNamespace(id="w-1", balance=Decimal("100.00"))
    closed, bal = await ws._settle_one(FakeDB(wallet), order)
    print("E) tie exact:", closed["status"], "bal", bal)
    if closed["status"] != "tie" or bal != 110.0:
        failures.append(f"E expected tie bal 110 got {closed} bal={bal}")

    print("\nFAILURES:", failures or "none")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
