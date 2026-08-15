"""Startup seeders: sync OTC instruments into DB + seed admin user."""
import os
import logging
from decimal import Decimal
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from database import SessionLocal
from models import User, Profile, Wallet
from auth import hash_password, verify_password
from market import INSTRUMENTS

logger = logging.getLogger(__name__)


CATEGORY_MAP = {
    "currencies": "forex",
    "crypto": "crypto",
    "commodities": "metal",
    "stocks": "stock",
}


async def seed_instruments(db: AsyncSession) -> None:
    """Upsert OTC engine instruments into the instruments table.

    IMPORTANT: `payout_pct` is intentionally NOT included in the ON CONFLICT
    update so that admin-changed payouts persist across restarts. Any newly
    added instrument still gets its default payout on first insert.
    """
    for ins in INSTRUMENTS:
        cat = CATEGORY_MAP.get(ins["category"], "forex")
        base = ins.get("icon", {}).get("base", "").upper() or None
        quote = ins.get("icon", {}).get("quote", "").upper() or None
        pip = Decimal(str(10 ** -ins["digits"]))
        await db.execute(
            text("""
                INSERT INTO instruments (symbol, name, category, base_currency, quote_currency, payout_pct, min_stake, max_stake, is_active, pip_size)
                VALUES (:sym, :name, :cat, :base, :quote, :payout, 1, 10000, TRUE, :pip)
                ON CONFLICT (symbol) DO UPDATE SET
                    name = EXCLUDED.name,
                    category = EXCLUDED.category,
                    is_active = TRUE
            """),
            {
                "sym": ins["symbol"], "name": ins["name"], "cat": cat,
                "base": base, "quote": quote,
                "payout": Decimal(str(ins["payout"])), "pip": pip,
            },
        )
    logger.info(f"Seeded {len(INSTRUMENTS)} OTC instruments")


async def load_payouts_into_engine(db: AsyncSession) -> None:
    """Hydrate the in-memory engine with admin-saved payouts from the DB."""
    from market import engine  # local import to dodge circulars at module load
    rows = (await db.execute(text("SELECT symbol, payout_pct FROM instruments"))).all()
    for sym, pct in rows:
        try:
            engine.set_payout(sym, float(pct))
        except KeyError:
            pass
    logger.info(f"Loaded {len(rows)} instrument payouts from DB into engine")


async def apply_profile_migrations(db: AsyncSession) -> None:
    """Idempotent DDL to add new profile columns without a full migration tool."""
    statements = [
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nickname VARCHAR(50)",
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name VARCHAR(80)",
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name VARCHAR(80)",
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dob VARCHAR(20)",
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address TEXT",
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_account VARCHAR(20) NOT NULL DEFAULT 'demo'",
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS unlocked_accounts JSONB NOT NULL DEFAULT '{}'::jsonb",
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_profiles_nickname ON profiles (nickname) WHERE nickname IS NOT NULL",
        """CREATE TABLE IF NOT EXISTS email_verification_tokens (
               id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
               user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
               token_hash VARCHAR(255) NOT NULL UNIQUE,
               expires_at TIMESTAMPTZ NOT NULL,
               used_at TIMESTAMPTZ,
               created_at TIMESTAMPTZ NOT NULL DEFAULT now()
           )""",
        "CREATE INDEX IF NOT EXISTS ix_evt_user_id ON email_verification_tokens (user_id)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS two_fa_enabled BOOLEAN NOT NULL DEFAULT TRUE",
        """CREATE TABLE IF NOT EXISTS two_factor_codes (
               id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
               user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
               purpose VARCHAR(20) NOT NULL,
               code_hash VARCHAR(255) NOT NULL,
               attempts INTEGER NOT NULL DEFAULT 0,
               expires_at TIMESTAMPTZ NOT NULL,
               used_at TIMESTAMPTZ,
               created_at TIMESTAMPTZ NOT NULL DEFAULT now()
           )""",
        "CREATE INDEX IF NOT EXISTS ix_tfc_user_purpose ON two_factor_codes (user_id, purpose, created_at)",
        """CREATE TABLE IF NOT EXISTS chart_drawings (
               id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
               user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
               symbol VARCHAR(40) NOT NULL,
               tool VARCHAR(40) NOT NULL,
               payload JSONB NOT NULL DEFAULT '{}'::jsonb,
               created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
               updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
           )""",
        "CREATE INDEX IF NOT EXISTS idx_chart_drawings_user_symbol ON chart_drawings (user_id, symbol)",
        """CREATE TABLE IF NOT EXISTS chart_indicators (
               id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
               user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
               symbol VARCHAR(40) NOT NULL,
               kind VARCHAR(40) NOT NULL,
               payload JSONB NOT NULL DEFAULT '{}'::jsonb,
               created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
               updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
           )""",
        "CREATE INDEX IF NOT EXISTS idx_chart_indicators_user_symbol ON chart_indicators (user_id, symbol)",
        # Binance Pay challenge purchases
        """CREATE TABLE IF NOT EXISTS challenge_purchases (
               id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
               user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
               challenge_id UUID REFERENCES challenges(id) ON DELETE SET NULL,
               plan VARCHAR(30) NOT NULL,
               amount_usd NUMERIC(20,4) NOT NULL,
               currency VARCHAR(12) NOT NULL DEFAULT 'USDT',
               order_id VARCHAR(64) NOT NULL UNIQUE,
               order_type VARCHAR(20) NOT NULL DEFAULT 'C2C',
               payer_binance_id VARCHAR(64),
               payer_name VARCHAR(120),
               receiver_binance_id VARCHAR(64),
               receiver_name VARCHAR(120),
               account_size NUMERIC(20,4) NOT NULL,
               status VARCHAR(20) NOT NULL DEFAULT 'completed',
               paid_at TIMESTAMPTZ,
               raw JSONB DEFAULT '{}'::jsonb,
               created_at TIMESTAMPTZ DEFAULT now()
           )""",
        "CREATE INDEX IF NOT EXISTS idx_challenge_purchases_user ON challenge_purchases (user_id, created_at DESC)",
        """UPDATE users SET auth_provider = CASE
               WHEN google_sub IS NOT NULL AND password_hash IS NULL THEN 'google'
               ELSE 'password'
           END WHERE auth_provider IS NULL""",
    ]
    for stmt in statements:
        await db.execute(text(stmt))
    logger.info("Profile schema migrations applied")


async def seed_admin(db: AsyncSession) -> None:
    email = os.environ.get("ADMIN_EMAIL", "").lower()
    password = os.environ.get("ADMIN_PASSWORD")
    if not email or not password:
        return
    q = await db.execute(select(User).where(User.email == email))
    admin = q.scalar_one_or_none()
    if not admin:
        admin = User(
            email=email, password_hash=hash_password(password),
            role="admin", is_verified=True, auth_provider="password",
        )
        db.add(admin)
        await db.flush()
        db.add(Profile(user_id=admin.id, full_name="Admin"))
        db.add(Wallet(user_id=admin.id, currency="USD", wallet_type="demo", balance=Decimal("500")))
        logger.info(f"Seeded admin user: {email}")
    elif not admin.password_hash or not verify_password(password, admin.password_hash):
        admin.password_hash = hash_password(password)
        logger.info(f"Updated admin password for: {email}")


async def run_seeds():
    async with SessionLocal() as db:
        await apply_profile_migrations(db)
        await seed_instruments(db)
        await seed_admin(db)
        await db.commit()
        # Hydrate engine payouts from DB (admin changes survive restart).
        await load_payouts_into_engine(db)
