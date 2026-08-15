"""Admin panel routes — stats, user list, per-user detail. Admin role required."""
import uuid
import logging
from decimal import Decimal
from datetime import datetime, timezone, timedelta

import jwt
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, func, or_, desc, text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User, Profile, Wallet, Order
from auth import verify_password, get_current_user, JWT_SECRET, JWT_ALGO
from market import engine, INSTRUMENTS
from routes.sio_hub import broadcast_payouts

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_TOKEN_HOURS = 12


class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@router.post("/login")
async def admin_login(payload: AdminLoginRequest, db: AsyncSession = Depends(get_db)):
    email = payload.email.lower()
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Not an admin account")

    token = jwt.encode(
        {
            "sub": str(user.id), "email": user.email, "type": "access",
            "exp": datetime.now(timezone.utc) + timedelta(hours=ADMIN_TOKEN_HOURS),
        },
        JWT_SECRET, algorithm=JWT_ALGO,
    )
    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()
    return {"token": token, "email": user.email, "role": user.role}


@router.get("/me")
async def admin_me(admin: User = Depends(require_admin)):
    return {"id": str(admin.id), "email": admin.email, "role": admin.role}


@router.get("/stats")
async def admin_stats(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    day_ago = now - timedelta(days=1)

    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    google_users = (await db.execute(
        select(func.count(User.id)).where(User.auth_provider == "google")
    )).scalar() or 0
    verified_users = (await db.execute(
        select(func.count(User.id)).where(User.is_verified.is_(True))
    )).scalar() or 0
    new_users_24h = (await db.execute(
        select(func.count(User.id)).where(User.created_at >= day_ago)
    )).scalar() or 0

    total_trades = (await db.execute(select(func.count(Order.id)))).scalar() or 0
    open_trades = (await db.execute(
        select(func.count(Order.id)).where(Order.status == "open")
    )).scalar() or 0
    total_volume = (await db.execute(select(func.coalesce(func.sum(Order.stake), 0)))).scalar() or 0
    total_pnl = (await db.execute(select(func.coalesce(func.sum(Order.pnl), 0)))).scalar() or 0
    trades_24h = (await db.execute(
        select(func.count(Order.id)).where(Order.created_at >= day_ago)
    )).scalar() or 0
    total_balance = (await db.execute(select(func.coalesce(func.sum(Wallet.balance), 0)))).scalar() or 0

    wins = (await db.execute(
        select(func.count(Order.id)).where(Order.status == "won")
    )).scalar() or 0
    settled = (await db.execute(
        select(func.count(Order.id)).where(Order.status.in_(["won", "lost", "refunded"]))
    )).scalar() or 0

    return {
        "total_users": total_users,
        "google_users": google_users,
        "password_users": total_users - google_users,
        "verified_users": verified_users,
        "new_users_24h": new_users_24h,
        "total_trades": total_trades,
        "open_trades": open_trades,
        "trades_24h": trades_24h,
        "total_volume": float(total_volume),
        "total_pnl": float(total_pnl),
        "total_balance": float(total_balance),
        "win_rate": round(wins / settled * 100, 2) if settled else 0.0,
    }


@router.get("/users")
async def admin_users(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    search: str = Query("", max_length=120),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    stmt = select(User, Profile).join(Profile, Profile.user_id == User.id, isouter=True)
    count_stmt = select(func.count(User.id)).join(Profile, Profile.user_id == User.id, isouter=True)
    if search.strip():
        like = f"%{search.strip().lower()}%"
        cond = or_(
            func.lower(User.email).like(like),
            func.lower(func.coalesce(Profile.full_name, "")).like(like),
            func.lower(func.coalesce(Profile.nickname, "")).like(like),
            func.lower(func.coalesce(Profile.country, "")).like(like),
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)

    total = (await db.execute(count_stmt)).scalar() or 0
    rows = (await db.execute(
        stmt.order_by(desc(User.created_at)).limit(limit).offset(offset)
    )).all()

    user_ids = [u.id for u, _ in rows]
    balances: dict[uuid.UUID, dict] = {uid: {} for uid in user_ids}
    trade_stats: dict[uuid.UUID, dict] = {uid: {"trades": 0, "volume": 0.0, "pnl": 0.0} for uid in user_ids}

    if user_ids:
        for w in (await db.execute(select(Wallet).where(Wallet.user_id.in_(user_ids)))).scalars().all():
            balances[w.user_id][w.wallet_type] = round(float(w.balance), 2)
        agg = await db.execute(
            select(
                Order.user_id,
                func.count(Order.id),
                func.coalesce(func.sum(Order.stake), 0),
                func.coalesce(func.sum(Order.pnl), 0),
            ).where(Order.user_id.in_(user_ids)).group_by(Order.user_id)
        )
        for uid, cnt, vol, pnl in agg.all():
            trade_stats[uid] = {"trades": cnt, "volume": float(vol), "pnl": float(pnl)}

    items = []
    for u, p in rows:
        items.append({
            "id": str(u.id),
            "email": u.email,
            "full_name": p.full_name if p else None,
            "nickname": p.nickname if p else None,
            "country": p.country if p else None,
            "phone": p.phone if p else None,
            "avatar_url": p.avatar_url if p else None,
            "kyc_status": p.kyc_status if p else "none",
            "active_account": (p.active_account if p else "demo") or "demo",
            "unlocked_accounts": (p.unlocked_accounts if p else {}) or {},
            "role": u.role,
            "is_verified": u.is_verified,
            "is_active": u.is_active,
            "auth_provider": u.auth_provider or "password",
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            "balances": balances.get(u.id, {}),
            "stats": trade_stats.get(u.id, {"trades": 0, "volume": 0.0, "pnl": 0.0}),
        })

    return {"total": total, "limit": limit, "offset": offset, "items": items}


@router.get("/users/{user_id}")
async def admin_user_detail(
    user_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user id")

    user = await db.get(User, uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    profile = (await db.execute(select(Profile).where(Profile.user_id == uid))).scalar_one_or_none()
    wallets = (await db.execute(select(Wallet).where(Wallet.user_id == uid))).scalars().all()
    orders = (await db.execute(
        select(Order).where(Order.user_id == uid).order_by(desc(Order.created_at)).limit(100)
    )).scalars().all()

    return {
        "user": {
            "id": str(user.id),
            "email": user.email,
            "role": user.role,
            "is_verified": user.is_verified,
            "is_active": user.is_active,
            "auth_provider": user.auth_provider or "password",
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
            "full_name": profile.full_name if profile else None,
            "nickname": profile.nickname if profile else None,
            "country": profile.country if profile else None,
            "phone": profile.phone if profile else None,
            "address": profile.address if profile else None,
            "dob": profile.dob if profile else None,
            "avatar_url": profile.avatar_url if profile else None,
            "kyc_status": profile.kyc_status if profile else "none",
            "active_account": (profile.active_account if profile else "demo") or "demo",
            "unlocked_accounts": (profile.unlocked_accounts if profile else {}) or {},
        },
        "wallets": [
            {"type": w.wallet_type, "currency": w.currency, "balance": round(float(w.balance), 2)}
            for w in wallets
        ],
        "trades": [
            {
                "id": str(o.id),
                "symbol": o.symbol,
                "direction": o.direction,
                "amount": float(o.stake),
                "payout": float(o.payout_pct),
                "entry_price": float(o.entry_price),
                "exit_price": float(o.exit_price) if o.exit_price is not None else None,
                "pnl": float(o.pnl) if o.pnl is not None else None,
                "status": o.status,
                "duration": o.expiry_seconds,
                "created_at": o.created_at.isoformat() if o.created_at else None,
                "settled_at": o.settled_at.isoformat() if o.settled_at else None,
            }
            for o in orders
        ],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Markets — admin-controlled per-symbol payout table.
# ─────────────────────────────────────────────────────────────────────────────
class MarketPayoutUpdate(BaseModel):
    payout: float = Field(..., ge=0, le=100, description="Payout % (0 – 100)")


@router.get("/markets")
async def admin_list_markets(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List every OTC instrument with its current payout (from DB, source of truth)."""
    rows = (await db.execute(
        text("SELECT symbol, name, category, payout_pct, is_active FROM instruments ORDER BY symbol")
    )).all()
    # Fall back to the seed catalogue if the DB has not been populated yet.
    if not rows:
        return {
            "items": [
                {
                    "symbol": i["symbol"], "name": i["name"], "category": i["category"],
                    "payout": float(i["payout"]), "is_active": True,
                }
                for i in INSTRUMENTS
            ]
        }
    return {
        "items": [
            {
                "symbol": r.symbol, "name": r.name, "category": r.category,
                "payout": float(r.payout_pct), "is_active": bool(r.is_active),
            }
            for r in rows
        ]
    }


@router.patch("/markets/{symbol}")
async def admin_update_market_payout(
    symbol: str,
    payload: MarketPayoutUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Set a symbol's payout%. Persists to DB, hot-updates the engine, and
    fan-outs the new payout table over Socket.IO (binary) so every client
    refreshes instantly without a page reload."""
    if symbol not in engine.meta:
        raise HTTPException(status_code=404, detail="Unknown symbol")

    result = await db.execute(
        text("UPDATE instruments SET payout_pct = :p WHERE symbol = :sym"),
        {"p": Decimal(str(payload.payout)), "sym": symbol},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Instrument not found in DB")
    await db.commit()

    clamped = engine.set_payout(symbol, payload.payout)
    # Live push to every connected client (binary msgpack).
    await broadcast_payouts()
    logger.info(f"admin {admin.email} set {symbol} payout → {clamped}%")
    return {"symbol": symbol, "payout": clamped}

