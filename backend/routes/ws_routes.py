"""Background loops: market tick broadcast + trade settlement (PostgreSQL)."""
import asyncio
import logging
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from database import SessionLocal
from models import Order, Wallet, Transaction
from market import engine
from routes.sio_hub import broadcast_tick, push_trade_closed

logger = logging.getLogger(__name__)


def _live_payout(symbol: str):
    """Current admin payout for `symbol`, or None when unavailable.

    Written defensively because older deployments of `market.py` may not expose
    `payouts()`; the frozen order payout is used as the fallback.
    """
    try:
        payouts = getattr(engine, "payouts", None)
        if callable(payouts):
            v = payouts().get(symbol)
            if v is not None:
                return v
        return engine.meta.get(symbol, {}).get("payout")
    except Exception:  # noqa: BLE001 — never let this break settlement
        return None


def _exit_price(order: Order):
    """Price at the expiry instant, falling back to the current price.

    `price_at` only exists on newer engines — guard it so an older deployed
    `market.py` cannot break the whole settle loop.
    """
    price_at = getattr(engine, "price_at", None)
    px = None
    if callable(price_at):
        try:
            px = price_at(order.symbol, order.expiry_at.timestamp())
        except Exception:  # noqa: BLE001
            px = None
    if px is None:
        try:
            px = engine.price(order.symbol)
        except Exception:  # noqa: BLE001
            px = None
    return px


async def _settle_one(db: AsyncSession, order: Order) -> tuple[dict, float]:
    """Settle a single expired order. Returns (closed_dict, new_balance)."""
    # Exit price is read at the EXPIRY instant, not at the moment the settle loop
    # runs — otherwise ticks that arrive after expiry could flip a win to a loss.
    px = _exit_price(order)
    stake = order.stake
    # Payout is taken LIVE from the engine (admin-controlled), not from the value
    # frozen at placement time: if an admin raises/lowers a market's payout while
    # a trade is still running, the settlement uses the current payout.
    live_payout = _live_payout(order.symbol)
    payout = order.payout_pct
    if live_payout is not None:
        try:
            payout = Decimal(str(live_payout))
        except Exception:  # noqa: BLE001
            payout = order.payout_pct
    if payout != order.payout_pct:
        order.payout_pct = payout

    if px is None:
        # No price available for this symbol (e.g. delisted) — refund instead of
        # letting the order sit open forever and block the whole settle batch.
        exit_price = order.entry_price
        status = "refunded"
        profit = Decimal("0")
        credit = stake
    else:
        exit_price = Decimal(str(px))
        if exit_price == order.entry_price:
            status = "refunded"
            profit = Decimal("0")
            credit = stake
        elif (exit_price > order.entry_price) == (order.direction == "higher"):
            status = "won"
            profit = (stake * payout / Decimal("100")).quantize(Decimal("0.01"))
            credit = stake + profit
        else:
            status = "lost"
            profit = -stake
            credit = Decimal("0")

    now = datetime.now(timezone.utc)
    order.status = status
    order.exit_price = exit_price
    order.pnl = profit
    order.settled_at = now

    wallet = await db.get(Wallet, order.wallet_id)
    if credit > 0:
        wallet.balance = wallet.balance + credit
        db.add(Transaction(
            wallet_id=wallet.id, user_id=order.user_id,
            tx_type="pnl" if status == "won" else "refund",
            amount=credit, balance_after=wallet.balance,
            provider="demo", status="completed",
            reference_id=order.id,
        ))

    closed_dict = {
        "id": str(order.id),
        "user_id": str(order.user_id),
        "symbol": order.symbol,
        "name": engine.meta.get(order.symbol, {}).get("name", order.symbol),
        "direction": order.direction,
        "amount": float(stake),
        "entry_price": float(order.entry_price),
        "entry_time": order.created_at.isoformat() if order.created_at else None,
        "expiry_time": order.expiry_at.isoformat() if order.expiry_at else None,
        "duration": order.expiry_seconds,
        "status": "won" if status == "won" else ("tie" if status == "refunded" else "lost"),
        "exit_price": float(exit_price),
        "profit": float(profit),
        "closed_at": now.isoformat(),
    }
    return closed_dict, round(float(wallet.balance), 2)


async def settle_loop():
    while True:
        try:
            now = datetime.now(timezone.utc)
            async with SessionLocal() as db:
                q = await db.execute(
                    select(Order).where(and_(Order.status == "open", Order.expiry_at <= now)).limit(500)
                )
                orders = q.scalars().all()
                results = []
                for o in orders:
                    try:
                        closed, bal = await _settle_one(db, o)
                    except Exception as e:  # noqa: BLE001
                        # One bad order must never block every other trade from
                        # settling (the batch used to abort and retry forever).
                        logger.exception(f"settle error on order {o.id}: {e}")
                        continue
                    results.append((str(o.user_id), closed, bal))
                if results:
                    await db.commit()
            # push over Socket.IO after commit
            for uid, closed, bal in results:
                await push_trade_closed(uid, closed, bal)
        except Exception as e:
            logger.exception(f"settle_loop error: {e}")
        # 100ms cadence — a trade closes (and the result reaches the client) the
        # moment its duration ends instead of up to a second later.
        await asyncio.sleep(0.1)



async def market_loop():
    """Tick the OTC engine 4x per second and broadcast via Socket.IO."""
    while True:
        try:
            now, updates = engine.tick_all()
            await broadcast_tick(now, updates)
        except Exception as e:
            logger.exception(f"market_loop error: {e}")
        await asyncio.sleep(0.25)
