"""Settlement must work against an OLD engine that has no `price_at`.

Reproduces the VPS failure `'Engine' object has no attribute 'price_at'` which
kept every expired trade open, and verifies the live-payout rule.
Run: python3 /app/tests/test_settle_legacy_engine.py
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
    """Old deployed engine: has price()/meta/payouts but NO price_at()."""

    def __init__(self):
        self.meta = {"EURUSD_OTC": {"name": "EUR/USD", "payout": 90.0}}

    def price(self, sym):
        return 1.09000

    def payouts(self):
        return {s: m["payout"] for s, m in self.meta.items()}


class FakeDB:
    def __init__(self, wallet):
        self.wallet = wallet
        self.added = []

    async def get(self, _model, _id):
        return self.wallet

    def add(self, obj):
        self.added.append(obj)


def make_order(direction="higher", entry="1.08000", payout="90.00"):
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id="ord-1", user_id="user-1", wallet_id="w-1", symbol="EURUSD_OTC",
        direction=direction, stake=Decimal("10.00"), payout_pct=Decimal(payout),
        entry_price=Decimal(entry), expiry_seconds=60,
        expiry_at=now - timedelta(seconds=1), created_at=now - timedelta(seconds=61),
        status="open", exit_price=None, pnl=None, settled_at=None,
    )


async def main():
    import routes.ws_routes as ws

    ws.engine = LegacyEngine()
    ws.Transaction = lambda **kw: SimpleNamespace(**kw)

    failures = []

    # 1) Legacy engine (no price_at) must still settle.
    order = make_order()
    wallet = SimpleNamespace(id="w-1", balance=Decimal("100.00"))
    closed, bal = await ws._settle_one(FakeDB(wallet), order)
    print("1) legacy settle:", closed["status"], closed["profit"], "balance", bal)
    if closed["status"] != "won":
        failures.append("legacy engine settle did not produce a win")
    if closed["profit"] != 9.0:
        failures.append(f"expected profit 9.0 at 90% payout, got {closed['profit']}")

    # 2) Payout raised mid-trade → settlement uses the NEW payout.
    ws.engine.meta["EURUSD_OTC"]["payout"] = 50.0
    order = make_order(payout="90.00")
    wallet = SimpleNamespace(id="w-1", balance=Decimal("100.00"))
    closed, _ = await ws._settle_one(FakeDB(wallet), order)
    print("2) live payout 50%:", closed["profit"], "order.payout_pct", order.payout_pct)
    if closed["profit"] != 5.0:
        failures.append(f"expected profit 5.0 with live 50% payout, got {closed['profit']}")
    if order.payout_pct != Decimal("50"):
        failures.append("order.payout_pct not updated to the applied payout")

    # 3) No price available → refund instead of hanging forever.
    class DeadEngine(LegacyEngine):
        def price(self, sym):
            raise KeyError(sym)

    ws.engine = DeadEngine()
    order = make_order()
    wallet = SimpleNamespace(id="w-1", balance=Decimal("100.00"))
    closed, _ = await ws._settle_one(FakeDB(wallet), order)
    print("3) dead engine:", closed["status"], closed["profit"])
    if closed["status"] != "tie":
        failures.append(f"expected refund/tie when no price, got {closed['status']}")

    print("\nFAILURES:", failures or "none")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
