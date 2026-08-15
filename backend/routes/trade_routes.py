"""Wallet + trade routes (PostgreSQL-backed)."""
import uuid
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User, Profile, Wallet, Order, Transaction, Challenge
from auth import get_current_user
from market import engine

router = APIRouter(tags=["trade"])

DEMO_STARTING_BALANCE = Decimal("500")

# Locked prop-challenge accounts. `locked=True` means the user must purchase to unlock.
ACCOUNT_PLANS = {
    "demo": {
        "label": "Demo",
        "balance": 500,
        "locked": False,
        "rules": {},
    },
    "basic": {
        "label": "Basic",
        "tagline": "Start your funded journey",
        "balance": 1000,
        "quotex_usd": 500,
        "locked": True,
        "price_usd": 25,
        "perks": [
            "$1,000 challenge account",
            "$500 real Quotex balance on passing",
            "Certificate on completion",
            "40+ live & OTC markets",
        ],
        "rules": {
            "daily_profit_pct": 6,
            "daily_loss_pct": 20,
            "max_loss_pct": 40,
            "profit_target_pct": 60,
            "duration_days": 13,
            "per_trade_pct": 2,
        },
    },
    "standard": {
        "label": "Standard",
        "tagline": "Best value for serious traders",
        "balance": 2500,
        "quotex_usd": 1400,
        "locked": True,
        "price_usd": 50,
        "popular": True,
        "perks": [
            "$2,500 challenge account",
            "$1,400 real Quotex balance on passing",
            "Certificate on completion",
            "Priority funding review",
        ],
        "rules": {
            "daily_profit_pct": 5,
            "daily_loss_pct": 30,
            "max_loss_pct": 50,
            "profit_target_pct": 60,
            "duration_days": 15,
            "per_trade_pct": 1.5,
        },
    },
    "premium": {
        "label": "Premium",
        "tagline": "Maximum capital & flexibility",
        "balance": 5000,
        "quotex_usd": 3000,
        "locked": True,
        "price_usd": 80,
        "perks": [
            "$5,000 challenge account",
            "$3,000 real Quotex balance on passing",
            "No daily loss limit",
            "Certificate + priority funding",
        ],
        "rules": {
            "daily_profit_pct": 4,
            "daily_loss_pct": None,
            "max_loss_pct": 50,
            "profit_target_pct": 65,
            "duration_days": 18,
            "per_trade_pct": 1,
        },
    },
}


class PlaceTradeRequest(BaseModel):
    symbol: str
    direction: str  # higher | lower  (or legacy "call"/"put")
    amount: float = Field(gt=0)
    duration: int = Field(ge=5, le=14400)  # 5s → 4h
    optionType: Optional[int] = Field(default=None, description="Quotex-style optionType (100=binary)")
    requestId: Optional[int] = Field(default=None, description="Client-supplied idempotency key")
    isDemo: Optional[int] = Field(default=1)
    account: Optional[str] = Field(default=None, description="demo|basic|standard|premium")
    clientTickT: Optional[float] = Field(
        default=None,
        description="Unix ts of the tick the client was showing — the entry price is taken "
                    "from the server's own tick history at that instant so the trade opens "
                    "on exactly the price the trader saw.",
    )


def resolve_entry_price(symbol: str, client_tick_t, now_ts: float):
    """Entry price for a new order.

    The client timestamp is trusted only as a timestamp (never as a price): the
    server re-reads its own tick history at that instant so the confirmed entry
    matches what the trader saw. Stale/absent/future stamps — and older engines
    without `price_at` — fall back to the current price.
    """
    if client_tick_t is not None:
        try:
            ts = float(client_tick_t)
        except (TypeError, ValueError):
            ts = None
        if ts is not None and now_ts - 3.0 <= ts <= now_ts + 0.5:
            price_at = getattr(engine, "price_at", None)
            if callable(price_at):
                try:
                    px = price_at(symbol, ts)
                except Exception:  # noqa: BLE001
                    px = None
                if px is not None:
                    return px
    return engine.price(symbol)


def _normalize_direction(d: str) -> str:
    d = (d or "").lower()
    if d in ("call", "higher", "up"):
        return "higher"
    if d in ("put", "lower", "down"):
        return "lower"
    return d


async def get_active_wallet(db: AsyncSession, user: User, account: Optional[str] = None) -> Wallet:
    """Return the wallet for the requested account type, creating on demand."""
    await db.refresh(user, ["profile"])
    active = (account or (user.profile.active_account if user.profile else "demo") or "demo").lower()
    if active not in ACCOUNT_PLANS:
        active = "demo"

    plan = ACCOUNT_PLANS[active]
    unlocked = (user.profile.unlocked_accounts if user.profile else {}) or {}
    if plan["locked"] and not unlocked.get(active):
        raise HTTPException(status_code=403, detail=f"{plan['label']} account is locked. Purchase to unlock.")

    q = await db.execute(
        select(Wallet).where(
            and_(Wallet.user_id == user.id, Wallet.wallet_type == active, Wallet.currency == "USD")
        )
    )
    w = q.scalar_one_or_none()
    if not w:
        w = Wallet(user_id=user.id, currency="USD", wallet_type=active,
                   balance=Decimal(str(plan["balance"])))
        db.add(w)
        await db.flush()
    return w


def order_to_dict(o: Order, instrument_name: str = "") -> dict:
    # NOTE: `payout` field is intentionally NOT included — the admin-controlled
    # payout table is only exposed to clients via the binary Socket.IO event
    # `markets/payouts` so it never appears in plain-text HTTP responses.
    return {
        "id": str(o.id),
        "user_id": str(o.user_id),
        "symbol": o.symbol,
        "name": instrument_name or engine.meta.get(o.symbol, {}).get("name", o.symbol),
        "direction": o.direction,
        "amount": float(o.stake),
        "entry_price": float(o.entry_price),
        "entry_time": o.created_at.isoformat() if o.created_at else None,
        "expiry_time": o.expiry_at.isoformat() if o.expiry_at else None,
        "duration": o.expiry_seconds,
        "status": o.status,
        "exit_price": float(o.exit_price) if o.exit_price is not None else None,
        "profit": float(o.pnl) if o.pnl is not None else None,
        "closed_at": o.settled_at.isoformat() if o.settled_at else None,
    }


@router.get("/wallet")
async def get_wallet(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    w = await get_active_wallet(db, user)
    await db.commit()
    return {
        "balance": round(float(w.balance), 2),
        "currency": "USD",
        "type": w.wallet_type,
    }


@router.post("/wallet/reset")
async def reset_wallet(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    w = await get_active_wallet(db, user)
    plan = ACCOUNT_PLANS.get(w.wallet_type, ACCOUNT_PLANS["demo"])
    w.balance = Decimal(str(plan["balance"]))
    await db.commit()
    return {"balance": float(w.balance), "currency": "USD", "type": w.wallet_type}


# ---------- Accounts ----------
@router.get("/accounts")
async def list_accounts(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the four account plans, whether each is unlocked, current balance, and active flag."""
    await db.refresh(user, ["profile"])
    active = (user.profile.active_account if user.profile else "demo") or "demo"
    unlocked = (user.profile.unlocked_accounts if user.profile else {}) or {}

    q = await db.execute(select(Wallet).where(Wallet.user_id == user.id))
    wallets = {w.wallet_type: w for w in q.scalars().all()}

    cq = await db.execute(select(Challenge).where(
        and_(Challenge.user_id == user.id, Challenge.status == "active")
    ).order_by(Challenge.created_at))
    active_challenges = {c.plan: c for c in cq.scalars().all()}
    now = datetime.now(timezone.utc)

    out = []
    for key, plan in ACCOUNT_PLANS.items():
        w = wallets.get(key)
        is_unlocked = (not plan["locked"]) or bool(unlocked.get(key))
        days_left = None
        ch = active_challenges.get(key)
        if is_unlocked and ch and ch.ended_at:
            ended = ch.ended_at if ch.ended_at.tzinfo else ch.ended_at.replace(tzinfo=timezone.utc)
            days_left = max(0, -(-int((ended - now).total_seconds()) // 86400))
        out.append({
            "key": key,
            "label": plan["label"],
            "balance": round(float(w.balance), 2) if w else float(plan["balance"]),
            "starting_balance": plan["balance"],
            "locked": plan["locked"],
            "unlocked": is_unlocked,
            "price_usd": plan.get("price_usd"),
            "rules": plan["rules"],
            "is_active": key == active,
            "days_left": days_left,
        })
    return out


class SwitchAccountRequest(BaseModel):
    account: str  # demo|basic|standard|premium


@router.post("/accounts/switch")
async def switch_account(
    payload: SwitchAccountRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    key = payload.account.lower()
    if key not in ACCOUNT_PLANS:
        raise HTTPException(status_code=400, detail="Unknown account")
    plan = ACCOUNT_PLANS[key]
    await db.refresh(user, ["profile"])
    unlocked = (user.profile.unlocked_accounts if user.profile else {}) or {}
    if plan["locked"] and not unlocked.get(key):
        raise HTTPException(status_code=403, detail=f"{plan['label']} account is locked.")

    if not user.profile:
        db.add(Profile(user_id=user.id, active_account=key, unlocked_accounts={}))
    else:
        user.profile.active_account = key
    # Ensure wallet exists
    q = await db.execute(select(Wallet).where(
        and_(Wallet.user_id == user.id, Wallet.wallet_type == key, Wallet.currency == "USD")))
    if q.scalar_one_or_none() is None:
        db.add(Wallet(user_id=user.id, currency="USD", wallet_type=key,
                      balance=Decimal(str(plan["balance"]))))
    await db.commit()
    w = await get_active_wallet(db, user)
    return {"active": key, "balance": round(float(w.balance), 2)}


@router.post("/trade/place")
async def place_trade(
    payload: PlaceTradeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await place_trade_core(payload, user, db)


async def place_trade_core(
    payload: "PlaceTradeRequest",
    user: User,
    db: AsyncSession,
) -> dict:
    """Shared trade-placement logic — HTTP endpoint above and Socket.IO handler
    both call this so validation/settlement stay identical on both transports.
    """
    if payload.symbol not in engine.state:
        raise HTTPException(status_code=404, detail="Unknown symbol")
    direction = _normalize_direction(payload.direction)
    if direction not in ("higher", "lower"):
        raise HTTPException(status_code=400, detail="Invalid direction")
    if payload.amount < 1:
        raise HTTPException(status_code=400, detail="Minimum investment is $1")

    w = await get_active_wallet(db, user, payload.account)
    amount = Decimal(str(round(payload.amount, 2)))
    if amount > w.balance:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    # Per-trade % rule for locked (challenge) accounts.
    plan = ACCOUNT_PLANS.get(w.wallet_type, ACCOUNT_PLANS["demo"])
    per_trade_pct = plan["rules"].get("per_trade_pct")
    if per_trade_pct:
        limit_amt = Decimal(str(plan["balance"])) * Decimal(per_trade_pct) / Decimal(100)
        if amount > limit_amt:
            raise HTTPException(
                status_code=400,
                detail=f"{plan['label']} account allows max ${float(limit_amt):.2f} per trade.",
            )

    ins = engine.meta[payload.symbol]
    now = datetime.now(timezone.utc)
    # Entry price — taken from the server's tick history at the instant the
    # client was showing (never trusted as a price, only as a timestamp), so the
    # trade opens exactly where the trader clicked. Stale/absent/future stamps
    # fall back to the current price.
    entry = resolve_entry_price(payload.symbol, payload.clientTickT, now.timestamp())
    order = Order(
        user_id=user.id,
        wallet_id=w.id,
        symbol=payload.symbol,
        direction=direction,
        stake=amount,
        payout_pct=Decimal(str(ins["payout"])),
        entry_price=Decimal(str(entry)),
        expiry_seconds=payload.duration,
        expiry_at=now + timedelta(seconds=payload.duration),
        status="open",
    )
    w.balance = w.balance - amount
    db.add(order)
    db.add(Transaction(
        wallet_id=w.id, user_id=user.id, tx_type="stake",
        amount=-amount, balance_after=w.balance, provider=w.wallet_type,
        status="completed",
    ))
    await db.commit()
    await db.refresh(order)

    # Broadcast the confirmed open event on the Socket.IO room for this user.
    try:
        from routes.sio_hub import push_trade_open
        await push_trade_open(
            str(user.id),
            order_to_dict(order, ins["name"]),
            round(float(w.balance), 2),
            request_id=payload.requestId,
        )
    except Exception:
        pass

    return {
        "trade": order_to_dict(order, ins["name"]),
        "balance": round(float(w.balance), 2),
        "requestId": payload.requestId,
        "account": w.wallet_type,
    }


@router.get("/trade/open")
async def open_trades(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = await db.execute(
        select(Order).where(and_(Order.user_id == user.id, Order.status == "open"))
        .order_by(Order.created_at.desc()).limit(100)
    )
    return [order_to_dict(o) for o in q.scalars().all()]


@router.get("/trade/history")
async def trade_history(
    limit: int = 50,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = await db.execute(
        select(Order).where(and_(Order.user_id == user.id, Order.status != "open"))
        .order_by(Order.expiry_at.desc()).limit(min(limit, 200))
    )
    return [order_to_dict(o) for o in q.scalars().all()]
