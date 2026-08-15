"""Auth routes: register / login / logout / me / refresh / password reset / Google OAuth / profile."""
import os
import uuid
import random
import secrets
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
import jwt as _jwt
from fastapi import APIRouter, HTTPException, Depends, Request, Response, BackgroundTasks
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User, Profile, Wallet, PasswordResetToken, EmailVerificationToken, TwoFactorCode
from emailer import (
    send_email, build_welcome_email, build_verification_email, build_reset_email,
    build_google_welcome_email, build_2fa_email, smtp_configured,
    FRONTEND_BASE_URL, VERIFY_TOKEN_HOURS, RESET_TOKEN_MINUTES, TWO_FA_CODE_MINUTES,
)
from auth import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
    get_current_user, check_lockout, record_failed_attempt, clear_attempts,
    set_auth_cookies, clear_auth_cookies,
    JWT_SECRET, JWT_ALGO,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

DEMO_STARTING_BALANCE = 500  # New users get $500 in the demo account

TWO_FA_MAX_ATTEMPTS = 5
TWO_FA_RESEND_SECONDS = 30


# ---------- Two step verification helpers ----------
def _mask_email(email: str) -> str:
    name, _, domain = email.partition("@")
    if len(name) <= 2:
        masked = (name[:1] or "*") + "*"
    else:
        masked = name[0] + "*" * (len(name) - 2) + name[-1]
    return f"{masked}@{domain}"


def _create_pending_2fa_token(user_id: str) -> str:
    return _jwt.encode(
        {"sub": user_id, "type": "2fa",
         "exp": datetime.now(timezone.utc) + timedelta(minutes=TWO_FA_CODE_MINUTES)},
        JWT_SECRET, algorithm=JWT_ALGO,
    )


async def _issue_2fa_code(db: AsyncSession, user: User, purpose: str) -> str:
    """Invalidate live codes of the same purpose and mint a fresh 6 digit code."""
    now = datetime.now(timezone.utc)
    live = (await db.execute(
        select(TwoFactorCode).where(
            TwoFactorCode.user_id == user.id,
            TwoFactorCode.purpose == purpose,
            TwoFactorCode.used_at.is_(None),
        )
    )).scalars().all()
    for t in live:
        t.used_at = now
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(TwoFactorCode(
        user_id=user.id,
        purpose=purpose,
        code_hash=hashlib.sha256(code.encode()).hexdigest(),
        expires_at=now + timedelta(minutes=TWO_FA_CODE_MINUTES),
    ))
    return code


def _queue_2fa_email(tasks: BackgroundTasks, email: str, code: str, purpose: str) -> None:
    subject, html, text = build_2fa_email(code, purpose)
    tasks.add_task(send_email, subject, html, text, email, "Authentication Code")
    if not smtp_configured():
        # Dev only: SMTP is unset locally, surface the code in logs for testing.
        logger.info("2FA code (dev, SMTP off) for %s [%s]: %s", email, purpose, code)


async def _consume_2fa_code(db: AsyncSession, user_id, purpose: str, code: str) -> None:
    now = datetime.now(timezone.utc)
    tok = (await db.execute(
        select(TwoFactorCode).where(
            TwoFactorCode.user_id == user_id,
            TwoFactorCode.purpose == purpose,
            TwoFactorCode.used_at.is_(None),
        ).order_by(TwoFactorCode.created_at.desc()).limit(1)
    )).scalar_one_or_none()
    if not tok:
        raise HTTPException(status_code=400, detail="No active code found. Please request a new one.")
    if tok.expires_at < now:
        raise HTTPException(status_code=400, detail="The code has expired. Please request a new one.")
    tok.attempts += 1
    if tok.attempts > TWO_FA_MAX_ATTEMPTS:
        tok.used_at = now
        await db.commit()
        raise HTTPException(status_code=429, detail="Too many wrong attempts. Please request a new code.")
    if hashlib.sha256(code.encode()).hexdigest() != tok.code_hash:
        await db.commit()
        raise HTTPException(status_code=400, detail="Invalid authentication code. Please try again.")
    tok.used_at = now


async def _issue_verification_token(db: AsyncSession, user: User) -> str:
    """Invalidate any live tokens, then mint a fresh one. Returns the raw token."""
    now = datetime.now(timezone.utc)
    live = (await db.execute(
        select(EmailVerificationToken).where(
            EmailVerificationToken.user_id == user.id,
            EmailVerificationToken.used_at.is_(None),
        )
    )).scalars().all()
    for t in live:
        t.used_at = now
    raw = secrets.token_urlsafe(32)
    db.add(EmailVerificationToken(
        user_id=user.id,
        token_hash=hashlib.sha256(raw.encode()).hexdigest(),
        expires_at=now + timedelta(hours=VERIFY_TOKEN_HOURS),
    ))
    return raw


def _queue_verification_email(tasks: BackgroundTasks, email: str, raw_token: str) -> None:
    link = f"{FRONTEND_BASE_URL.rstrip('/')}/verify-email?token={raw_token}"
    subject, html, text = build_verification_email(email, link)
    tasks.add_task(send_email, subject, html, text, email)


def _gen_nickname() -> str:
    """Auto-generated nickname like #27361231."""
    return f"#{random.randint(10_000_000, 99_999_999)}"


def _generate_strong_password(length: int = 16) -> str:
    """Strong alphanumeric password with guaranteed upper, lower and digit chars."""
    import string
    alphabet = string.ascii_letters + string.digits
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(length))
        if any(c.islower() for c in pw) and any(c.isupper() for c in pw) and any(c.isdigit() for c in pw):
            return pw


# ---------- Schemas ----------
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)
    full_name: Optional[str] = None
    country: Optional[str] = Field(default=None, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleAuthRequest(BaseModel):
    code: str
    redirect_uri: str
    plan: Optional[str] = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
    id: str
    email: str
    role: str
    is_verified: bool
    two_fa_enabled: bool = True
    full_name: Optional[str] = None
    nickname: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    dob: Optional[str] = None
    address: Optional[str] = None
    country: Optional[str] = None
    avatar_url: Optional[str] = None
    active_account: str = "demo"
    unlocked_accounts: dict = {}


class AuthResponse(BaseModel):
    user: UserOut
    token: str  # access token — for header-based auth & WS


class ProfileUpdateRequest(BaseModel):
    nickname: Optional[str] = Field(default=None, max_length=50)
    first_name: Optional[str] = Field(default=None, max_length=80)
    last_name: Optional[str] = Field(default=None, max_length=80)
    dob: Optional[str] = Field(default=None, max_length=20)
    country: Optional[str] = Field(default=None, max_length=100)
    address: Optional[str] = Field(default=None, max_length=500)


def user_to_out(user: User, profile: Optional[Profile] = None) -> UserOut:
    p = profile or user.profile
    return UserOut(
        id=str(user.id),
        email=user.email,
        role=user.role,
        is_verified=user.is_verified,
        two_fa_enabled=True if user.two_fa_enabled is None else bool(user.two_fa_enabled),
        full_name=p.full_name if p else None,
        nickname=p.nickname if p else None,
        first_name=p.first_name if p else None,
        last_name=p.last_name if p else None,
        dob=p.dob if p else None,
        address=p.address if p else None,
        country=p.country if p else None,
        avatar_url=p.avatar_url if p else None,
        active_account=(p.active_account if p else "demo") or "demo",
        unlocked_accounts=(p.unlocked_accounts if p else {}) or {},
    )


async def _ensure_demo_wallet(db: AsyncSession, user_id: uuid.UUID) -> None:
    q = await db.execute(
        select(Wallet).where(
            Wallet.user_id == user_id,
            Wallet.wallet_type == "demo",
            Wallet.currency == "USD",
        )
    )
    if q.scalar_one_or_none() is None:
        db.add(Wallet(user_id=user_id, currency="USD", wallet_type="demo", balance=DEMO_STARTING_BALANCE))


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ---------- Register ----------
@router.post("/register", response_model=AuthResponse)
async def register(
    payload: RegisterRequest,
    response: Response,
    tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    email = payload.email.lower()
    if len(payload.password) < 6:
        raise HTTPException(
            status_code=400,
            detail="The Password field must be at least 6 characters in length",
        )
    existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=409,
            detail="The email address cannot be reused. Please specify a different one.",
        )

    user = User(email=email, password_hash=hash_password(payload.password), role="trader", auth_provider="password")
    db.add(user)
    await db.flush()

    db.add(Profile(
        user_id=user.id,
        full_name=payload.full_name,
        country=payload.country,
        nickname=_gen_nickname(),
        active_account="demo",
        unlocked_accounts={},
    ))
    await _ensure_demo_wallet(db, user.id)
    raw_token = await _issue_verification_token(db, user)
    await db.commit()
    await db.refresh(user, ["profile"])

    w_subject, w_html, w_text = build_welcome_email(user.email, payload.full_name or "")
    tasks.add_task(send_email, w_subject, w_html, w_text, user.email)
    _queue_verification_email(tasks, user.email, raw_token)

    access = create_access_token(str(user.id), user.email)
    refresh = create_refresh_token(str(user.id))
    set_auth_cookies(response, access, refresh)
    return AuthResponse(user=user_to_out(user), token=access)


# ---------- Login ----------
@router.post("/login")
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    email = payload.email.lower()
    ip = _client_ip(request)
    await check_lockout(ip, email)

    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        await record_failed_attempt(ip, email)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    await clear_attempts(ip, email)

    if user.two_fa_enabled is None or user.two_fa_enabled:
        code = await _issue_2fa_code(db, user, "login")
        await db.commit()
        _queue_2fa_email(tasks, user.email, code, "login")
        return {
            "requires_2fa": True,
            "pending_token": _create_pending_2fa_token(str(user.id)),
            "email": _mask_email(user.email),
        }

    user.last_login_at = datetime.now(timezone.utc)
    await _ensure_demo_wallet(db, user.id)
    await db.commit()
    await db.refresh(user, ["profile"])

    access = create_access_token(str(user.id), user.email)
    refresh = create_refresh_token(str(user.id))
    set_auth_cookies(response, access, refresh)
    return AuthResponse(user=user_to_out(user), token=access)


# ---------- Two step verification ----------
class TwoFAVerifyRequest(BaseModel):
    pending_token: str
    code: str = Field(min_length=6, max_length=6)


class TwoFAResendRequest(BaseModel):
    pending_token: str


class TwoFAToggleConfirmRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)


async def _user_from_pending_token(db: AsyncSession, pending_token: str) -> User:
    payload = decode_token(pending_token, "2fa")
    try:
        uid = uuid.UUID(payload["sub"])
    except (ValueError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.get(User, uid)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.post("/2fa/verify", response_model=AuthResponse)
async def two_fa_verify(
    payload: TwoFAVerifyRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    user = await _user_from_pending_token(db, payload.pending_token)
    await _consume_2fa_code(db, user.id, "login", payload.code.strip())
    user.last_login_at = datetime.now(timezone.utc)
    await _ensure_demo_wallet(db, user.id)
    await db.commit()
    await db.refresh(user, ["profile"])

    access = create_access_token(str(user.id), user.email)
    refresh = create_refresh_token(str(user.id))
    set_auth_cookies(response, access, refresh)
    return AuthResponse(user=user_to_out(user), token=access)


@router.post("/2fa/resend")
async def two_fa_resend(
    payload: TwoFAResendRequest,
    tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    user = await _user_from_pending_token(db, payload.pending_token)
    latest = (await db.execute(
        select(TwoFactorCode).where(
            TwoFactorCode.user_id == user.id,
            TwoFactorCode.purpose == "login",
            TwoFactorCode.used_at.is_(None),
        ).order_by(TwoFactorCode.created_at.desc()).limit(1)
    )).scalar_one_or_none()
    if latest and latest.created_at and \
            (datetime.now(timezone.utc) - latest.created_at).total_seconds() < TWO_FA_RESEND_SECONDS:
        raise HTTPException(status_code=429, detail="Please wait a few seconds before requesting a new code.")
    code = await _issue_2fa_code(db, user, "login")
    await db.commit()
    _queue_2fa_email(tasks, user.email, code, "login")
    return {"ok": True, "message": "A new code has been sent to your email."}


@router.post("/2fa/request-toggle")
async def two_fa_request_toggle(
    tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    action = "disable" if user.two_fa_enabled else "enable"
    code = await _issue_2fa_code(db, user, "toggle")
    await db.commit()
    _queue_2fa_email(tasks, user.email, code, "toggle")
    return {"ok": True, "action": action, "email": _mask_email(user.email)}


@router.post("/2fa/confirm-toggle", response_model=UserOut)
async def two_fa_confirm_toggle(
    payload: TwoFAToggleConfirmRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _consume_2fa_code(db, user.id, "toggle", payload.code.strip())
    user.two_fa_enabled = not bool(user.two_fa_enabled)
    await db.commit()
    await db.refresh(user, ["profile"])
    return user_to_out(user)


# ---------- Logout ----------
@router.post("/logout")
async def logout(response: Response):
    clear_auth_cookies(response)
    return {"ok": True}


# ---------- Me ----------
@router.get("/me", response_model=UserOut)
async def me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.refresh(user, ["profile"])
    # Backfill nickname for legacy accounts
    if user.profile and not user.profile.nickname:
        user.profile.nickname = _gen_nickname()
        await db.commit()
    return user_to_out(user)


# ---------- Profile update ----------
@router.patch("/profile", response_model=UserOut)
async def update_profile(
    payload: ProfileUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.refresh(user, ["profile"])
    p = user.profile
    if not p:
        p = Profile(user_id=user.id, active_account="demo", unlocked_accounts={})
        db.add(p)
        await db.flush()

    if payload.nickname is not None:
        nick = payload.nickname.strip()
        if nick and nick != p.nickname:
            # Uniqueness check
            existing = (await db.execute(
                select(Profile).where(Profile.nickname == nick, Profile.user_id != user.id)
            )).scalar_one_or_none()
            if existing:
                raise HTTPException(status_code=409, detail="Nickname already taken")
            p.nickname = nick
    if payload.first_name is not None:
        p.first_name = payload.first_name.strip() or None
    if payload.last_name is not None:
        p.last_name = payload.last_name.strip() or None
    if payload.dob is not None:
        p.dob = payload.dob.strip() or None
    if payload.country is not None:
        p.country = payload.country.strip() or None
    if payload.address is not None:
        p.address = payload.address.strip() or None

    p.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user, ["profile"])
    return user_to_out(user)


# ---------- Refresh ----------
@router.post("/refresh")
async def refresh_access(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    tok = request.cookies.get("refresh_token")
    if not tok:
        raise HTTPException(status_code=401, detail="No refresh token")
    payload = decode_token(tok, "refresh")
    try:
        uid = uuid.UUID(payload["sub"])
    except (ValueError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.get(User, uid)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")
    access = create_access_token(str(user.id), user.email)
    response.set_cookie(
        "access_token", access, httponly=True, secure=True, samesite="none",
        max_age=15 * 60, path="/",
    )
    return {"ok": True, "token": access}


# ---------- Forgot / Reset Password ----------
@router.post("/forgot-password")
async def forgot_password(
    payload: ForgotPasswordRequest,
    tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    email = payload.email.strip().lower()
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    # Mail goes out only when an account with this exact email exists.
    # Google-only accounts (no password yet) can also reset — this sets their first password.
    if user:
        raw = secrets.token_urlsafe(32)
        db.add(PasswordResetToken(
            user_id=user.id,
            token_hash=hashlib.sha256(raw.encode()).hexdigest(),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_MINUTES),
        ))
        await db.commit()
        link = f"{FRONTEND_BASE_URL.rstrip('/')}/reset-password?token={raw}"
        subject, html, text = build_reset_email(link)
        tasks.add_task(send_email, subject, html, text, user.email)
        logger.info("Password reset email queued for %s", email)
    else:
        logger.info("Password reset requested for unknown email %s, no mail sent", email)
    # Same response either way so the UI cannot be used to enumerate accounts.
    return {"ok": True, "message": "If the email exists, a reset link has been sent."}


RESET_STATUS_MESSAGES = {
    "used": "You have already used this link to change your password. Please sign in with your new password, or request a new reset link.",
    "expired": "Your reset link has expired. Reset links are valid for 30 minutes only, so please request a new one.",
    "invalid": "This reset link is not valid. Please request a new one.",
}


async def _lookup_reset_token(db: AsyncSession, raw_token: str):
    """Returns (status, token_row). status is one of valid / used / expired / invalid."""
    if not raw_token:
        return "invalid", None
    h = hashlib.sha256(raw_token.encode()).hexdigest()
    tok = (await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == h)
    )).scalar_one_or_none()
    if not tok:
        return "invalid", None
    if tok.used_at is not None:
        return "used", tok
    if tok.expires_at < datetime.now(timezone.utc):
        return "expired", tok
    return "valid", tok


@router.get("/reset-password/status")
async def reset_password_status(token: str = "", db: AsyncSession = Depends(get_db)):
    status, _ = await _lookup_reset_token(db, token)
    return {"status": status, "message": RESET_STATUS_MESSAGES.get(status, "")}


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    status, tok = await _lookup_reset_token(db, payload.token)
    if status != "valid":
        raise HTTPException(status_code=400, detail=RESET_STATUS_MESSAGES[status])
    user = await db.get(User, tok.user_id)
    if not user:
        raise HTTPException(status_code=400, detail=RESET_STATUS_MESSAGES["invalid"])
    user.password_hash = hash_password(payload.new_password)
    tok.used_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


# ---------- Google OAuth ----------
@router.post("/google", response_model=AuthResponse)
async def google_auth(
    payload: GoogleAuthRequest,
    response: Response,
    tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    async with httpx.AsyncClient(timeout=10.0) as http:
        token_res = await http.post(GOOGLE_TOKEN_URL, data={
            "code": payload.code,
            "client_id": os.environ["GOOGLE_CLIENT_ID"],
            "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
            "redirect_uri": payload.redirect_uri,
            "grant_type": "authorization_code",
        })
        if token_res.status_code != 200:
            logger.error(f"Google token exchange failed: {token_res.text}")
            raise HTTPException(status_code=400, detail="Google authentication failed")
        tokens = token_res.json()
        info_res = await http.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        if info_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch Google profile")
        info = info_res.json()

    email = info.get("email")
    google_sub = info.get("sub")
    if not email or not google_sub:
        raise HTTPException(status_code=400, detail="Google account has no email")
    email = email.lower()

    # Find by google_sub first, then by email
    user = (await db.execute(select(User).where(User.google_sub == google_sub))).scalar_one_or_none()
    if not user:
        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()

    is_new_user = user is None
    generated_password = None
    if user:
        # Existing account linking Google — keep original auth_provider and do NOT auto-verify.
        # A password-registered user must verify via the emailed link themselves.
        user.google_sub = google_sub
        user.last_login_at = datetime.now(timezone.utc)
    else:
        generated_password = _generate_strong_password()
        user = User(
            email=email, google_sub=google_sub,
            password_hash=hash_password(generated_password),
            auth_provider="google",
            is_verified=bool(info.get("email_verified", True)),
            last_login_at=datetime.now(timezone.utc),
        )
        db.add(user)
        await db.flush()

    # Ensure profile
    prof = (await db.execute(select(Profile).where(Profile.user_id == user.id))).scalar_one_or_none()
    if not prof:
        db.add(Profile(
            user_id=user.id,
            full_name=info.get("name"),
            avatar_url=info.get("picture"),
            nickname=_gen_nickname(),
            active_account="demo",
            unlocked_accounts={},
        ))
    else:
        if info.get("name"):
            prof.full_name = info["name"]
        if info.get("picture"):
            prof.avatar_url = info["picture"]
        if not prof.nickname:
            prof.nickname = _gen_nickname()

    await _ensure_demo_wallet(db, user.id)
    await db.commit()
    await db.refresh(user, ["profile"])

    # Google accounts arrive pre-verified — no verification link.
    # New Google users get: 1) login details email with generated password, 2) standard welcome email.
    if is_new_user:
        g_subject, g_html, g_text = build_google_welcome_email(user.email, info.get("name") or "", generated_password)
        tasks.add_task(send_email, g_subject, g_html, g_text, user.email)
        w_subject, w_html, w_text = build_welcome_email(user.email, info.get("name") or "", verified=True)
        tasks.add_task(send_email, w_subject, w_html, w_text, user.email)

    access = create_access_token(str(user.id), user.email)
    refresh = create_refresh_token(str(user.id))
    set_auth_cookies(response, access, refresh)
    return AuthResponse(user=user_to_out(user), token=access)


# ---------- Email verification ----------
class VerifyEmailRequest(BaseModel):
    token: str


async def _consume_verification_token(db: AsyncSession, raw_token: str) -> User:
    h = hashlib.sha256(raw_token.encode()).hexdigest()
    tok = (await db.execute(
        select(EmailVerificationToken).where(EmailVerificationToken.token_hash == h)
    )).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if not tok or tok.used_at is not None or tok.expires_at < now:
        raise HTTPException(status_code=400, detail="This verification link is invalid or has expired.")
    user = await db.get(User, tok.user_id)
    if not user:
        raise HTTPException(status_code=400, detail="This verification link is invalid or has expired.")
    user.is_verified = True
    tok.used_at = now
    await db.commit()
    return user


@router.post("/verify-email")
async def verify_email(payload: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    user = await _consume_verification_token(db, payload.token)
    return {"ok": True, "email": user.email, "message": "Email verified successfully."}


@router.get("/verify-email")
async def verify_email_link(token: str, db: AsyncSession = Depends(get_db)):
    """Direct link from the email — verifies, then bounces to the frontend."""
    base = FRONTEND_BASE_URL.rstrip("/")
    try:
        await _consume_verification_token(db, token)
        return RedirectResponse(url=f"{base}/verify-email?status=success", status_code=303)
    except HTTPException:
        return RedirectResponse(url=f"{base}/verify-email?status=error", status_code=303)


@router.post("/resend-verification")
async def resend_verification(
    tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.is_verified:
        raise HTTPException(status_code=400, detail="Your email is already verified.")
    raw_token = await _issue_verification_token(db, user)
    await db.commit()
    _queue_verification_email(tasks, user.email, raw_token)
    return {"ok": True, "message": f"Verification email sent to {user.email}."}
