"""Challenge plans + Binance Pay purchases (server-side verified)."""
import logging
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, and_, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

import binance_pay
from auth import get_current_user
from database import get_db
from models import User, Profile, Wallet, Challenge, ChallengePurchase
from routes.admin_routes import require_admin
from routes.trade_routes import ACCOUNT_PLANS

logger = logging.getLogger(__name__)
router = APIRouter(tags=["challenges"])


def _plan_public(key: str, plan: dict) -> dict:
    return {
        "key": key,
        "label": plan["label"],
        "tagline": plan.get("tagline", ""),
        "price_usd": plan.get("price_usd"),
        "funded_usd": plan["balance"],
        "quotex_usd": plan.get("quotex_usd"),
        "popular": bool(plan.get("popular")),
        "rules": plan["rules"],
        "perks": plan.get("perks", []),
    }


@router.get("/challenges/plans")
async def list_plans(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """The three purchasable challenges + which ones this user already owns."""
    await db.refresh(user, ["profile"])
    unlocked = (user.profile.unlocked_accounts if user.profile else {}) or {}
    plans = [
        {**_plan_public(k, p), "owned": bool(unlocked.get(k))}
        for k, p in ACCOUNT_PLANS.items() if p.get("locked")
    ]
    return {
        "plans": plans,
        "payment": {
            "provider": "binance_pay",
            "binance_id": binance_pay.receiver_id(),
            "account_name": binance_pay.receiver_name(),
            "currency": "USDT",
        },
    }


class PurchaseRequest(BaseModel):
    plan: str
    order_id: str = Field(min_length=6, max_length=40)

    @field_validator("order_id")
    @classmethod
    def digits_only(cls, v: str) -> str:
        v = v.strip()
        if not v.isdigit():
            raise ValueError("Order ID must contain numbers only")
        return v


def _purchase_dict(p: ChallengePurchase, email: str = "", name: str = "") -> dict:
    return {
        "id": str(p.id),
        "user_id": str(p.user_id),
        "user_email": email,
        "user_name": name,
        "plan": p.plan,
        "amount_usd": float(p.amount_usd),
        "currency": p.currency,
        "order_id": p.order_id,
        "order_type": p.order_type,
        "payer_binance_id": p.payer_binance_id,
        "payer_name": p.payer_name,
        "receiver_binance_id": p.receiver_binance_id,
        "receiver_name": p.receiver_name,
        "account_size": float(p.account_size),
        "status": p.status,
        "paid_at": p.paid_at.isoformat() if p.paid_at else None,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


@router.post("/challenges/purchase")
async def purchase_challenge(
    payload: PurchaseRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    key = payload.plan.lower()
    plan = ACCOUNT_PLANS.get(key)
    if not plan or not plan.get("locked"):
        raise HTTPException(status_code=400, detail="Unknown challenge plan")

    await db.refresh(user, ["profile"])
    unlocked = (user.profile.unlocked_accounts if user.profile else {}) or {}
    if unlocked.get(key):
        raise HTTPException(status_code=409, detail=f"Your {plan['label']} account is already unlocked.")

    # One Order ID can only ever unlock one challenge.
    dup = await db.execute(select(ChallengePurchase).where(ChallengePurchase.order_id == payload.order_id))
    if dup.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="This Order ID has already been used.")

    price = Decimal(str(plan["price_usd"]))
    try:
        info = await binance_pay.verify_payment(payload.order_id, price)
    except binance_pay.PaymentError as e:
        raise HTTPException(status_code=400, detail=str(e))

    rules = plan["rules"]
    size = Decimal(str(plan["balance"]))
    paid_at = None
    if info.get("transaction_time"):
        try:
            paid_at = datetime.fromtimestamp(int(info["transaction_time"]) / 1000, tz=timezone.utc)
        except Exception:  # noqa: BLE001
            paid_at = None

    challenge = Challenge(
        user_id=user.id, plan=key, fee_paid=price, account_size=size,
        profit_target=(size * Decimal(str(rules["profit_target_pct"])) / 100),
        max_daily_loss=(size * Decimal(str(rules.get("daily_loss_pct") or 100)) / 100),
        max_total_loss=(size * Decimal(str(rules["max_loss_pct"])) / 100),
        duration_days=int(rules["duration_days"]),
        status="active",
        ended_at=datetime.now(timezone.utc) + timedelta(days=int(rules["duration_days"])),
    )
    db.add(challenge)
    await db.flush()

    purchase = ChallengePurchase(
        user_id=user.id, challenge_id=challenge.id, plan=key,
        amount_usd=info["amount"], currency=info["currency"],
        order_id=info["order_id"], order_type=info["order_type"],
        payer_binance_id=info["payer_binance_id"], payer_name=info["payer_name"],
        receiver_binance_id=info["receiver_binance_id"], receiver_name=info["receiver_name"],
        account_size=size, status="completed", paid_at=paid_at, raw=info["raw"],
    )
    db.add(purchase)

    # Unlock the account and fund the wallet with the challenge balance.
    if not user.profile:
        db.add(Profile(user_id=user.id, active_account=key, unlocked_accounts={key: True}))
    else:
        user.profile.unlocked_accounts = {**unlocked, key: True}
        user.profile.active_account = key

    q = await db.execute(select(Wallet).where(
        and_(Wallet.user_id == user.id, Wallet.wallet_type == key, Wallet.currency == "USD")))
    wallet = q.scalar_one_or_none()
    if wallet is None:
        db.add(Wallet(user_id=user.id, currency="USD", wallet_type=key, balance=size))
    else:
        wallet.balance = size

    await db.commit()
    await db.refresh(purchase)
    logger.info(f"challenge purchased: user={user.email} plan={key} order={payload.order_id}")
    return {
        "ok": True,
        "plan": key,
        "label": plan["label"],
        "balance": float(size),
        "purchase": _purchase_dict(purchase),
    }


@router.get("/challenges/purchases")
async def my_purchases(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    q = await db.execute(
        select(ChallengePurchase).where(ChallengePurchase.user_id == user.id)
        .order_by(desc(ChallengePurchase.created_at))
    )
    return {"items": [_purchase_dict(p) for p in q.scalars().all()]}


@router.get("/admin/purchases")
async def admin_purchases(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    limit: int = 100,
    offset: int = 0,
):
    total = (await db.execute(select(func.count()).select_from(ChallengePurchase))).scalar_one()
    q = await db.execute(
        select(ChallengePurchase, User, Profile)
        .join(User, User.id == ChallengePurchase.user_id)
        .outerjoin(Profile, Profile.user_id == ChallengePurchase.user_id)
        .order_by(desc(ChallengePurchase.created_at))
        .limit(min(limit, 200)).offset(offset)
    )
    items = [
        _purchase_dict(p, email=u.email, name=(pr.full_name if pr else ""))
        for p, u, pr in q.all()
    ]
    return {"items": items, "total": total}
