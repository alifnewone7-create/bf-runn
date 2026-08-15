"""Password hashing, JWT tokens, current-user helper, brute-force protection (Redis)."""
import os
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import HTTPException, Request, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User
from redis_client import redis_client

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = "HS256"
ACCESS_MIN = 15
REFRESH_DAYS = 7

# Brute-force config
MAX_ATTEMPTS = 5
LOCKOUT_SECS = 15 * 60  # 15 min


# ---------- Password ----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# ---------- JWT ----------
def create_access_token(user_id: str, email: str) -> str:
    return jwt.encode(
        {"sub": user_id, "email": email, "type": "access",
         "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_MIN)},
        JWT_SECRET, algorithm=JWT_ALGO,
    )


def create_refresh_token(user_id: str) -> str:
    return jwt.encode(
        {"sub": user_id, "type": "refresh",
         "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_DAYS)},
        JWT_SECRET, algorithm=JWT_ALGO,
    )


def decode_token(token: str, expected_type: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("type") != expected_type:
        raise HTTPException(status_code=401, detail="Invalid token type")
    return payload


# ---------- Current user ----------
def _extract_token(request: Request) -> Optional[str]:
    tok = request.cookies.get("access_token")
    if tok:
        return tok
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    tok = _extract_token(request)
    if not tok:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(tok, "access")
    try:
        uid = uuid.UUID(payload["sub"])
    except (ValueError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.get(User, uid)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# WebSocket variant (returns None instead of raising)
async def get_user_from_token(token: str, db: AsyncSession) -> Optional[User]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        if payload.get("type") != "access":
            return None
        uid = uuid.UUID(payload["sub"])
    except Exception:
        return None
    user = await db.get(User, uid)
    return user if user and user.is_active else None


# ---------- Brute-force (Redis) ----------
def _attempts_key(ip: str, email: str) -> str:
    return f"bfg:login_attempts:{ip}:{email.lower()}"


async def check_lockout(ip: str, email: str) -> None:
    key = _attempts_key(ip, email)
    val = await redis_client.get(key)
    if val and int(val) >= MAX_ATTEMPTS:
        ttl = await redis_client.ttl(key)
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed attempts. Try again in {max(1, ttl // 60)} min.",
        )


async def record_failed_attempt(ip: str, email: str) -> None:
    key = _attempts_key(ip, email)
    cnt = await redis_client.incr(key)
    if cnt == 1:
        await redis_client.expire(key, LOCKOUT_SECS)


async def clear_attempts(ip: str, email: str) -> None:
    await redis_client.delete(_attempts_key(ip, email))


# ---------- Cookie helpers ----------
def set_auth_cookies(response, access: str, refresh: str) -> None:
    response.set_cookie(
        "access_token", access, httponly=True, secure=True, samesite="none",
        max_age=ACCESS_MIN * 60, path="/",
    )
    response.set_cookie(
        "refresh_token", refresh, httponly=True, secure=True, samesite="none",
        max_age=REFRESH_DAYS * 86400, path="/",
    )


def clear_auth_cookies(response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
