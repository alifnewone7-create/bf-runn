"""Tests for the auth_provider bug fix.

Scope:
  1. Password-registered UNVERIFIED user linking Google via google_auth() must NOT
     auto-verify and must keep auth_provider='password'.
  2. First-time Google user still auto-verifies, gets auth_provider='google',
     receives login-details + welcome emails (no verification email).
  3. Post-link verification email still works for the same user.
  4. Admin endpoints report ORIGINAL auth_provider.
  5. Migration backfill sets 'google' vs 'password' correctly for legacy rows.
  6. Regression: register + login flows still work.
"""
import os
import sys
import asyncio
import hashlib
import secrets
import subprocess

import pytest
import requests

# Load env before importing backend modules
try:
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
except Exception:
    pass

sys.path.insert(0, "/app/backend")

BASE_URL = "http://localhost:8001"
PSQL = ["sudo", "-u", "postgres", "psql", "-d", "bfg", "-t", "-A", "-c"]


def psql(sql: str) -> str:
    out = subprocess.run(PSQL + [sql], capture_output=True, text=True, timeout=15)
    assert out.returncode == 0, f"psql failed: {out.stderr}\nSQL: {sql}"
    return out.stdout.strip()


# ---------------- Fake httpx client for Google OAuth mocking ----------------
class FakeResp:
    def __init__(self, status_code, data):
        self.status_code = status_code
        self._data = data
        self.text = str(data)
    def json(self): return self._data


def make_fake_client(email: str, sub: str, name: str = "Google User",
                     email_verified: bool = True, picture: str = "https://x/p.png"):
    class FakeHttpClient:
        def __init__(self, *a, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, data=None):
            return FakeResp(200, {"access_token": "fake_at"})
        async def get(self, url, headers=None):
            return FakeResp(200, {
                "email": email, "sub": sub, "name": name,
                "email_verified": email_verified, "picture": picture,
            })
    return FakeHttpClient


class FakeTasks:
    def __init__(self): self.queued = []
    def add_task(self, func, *args, **kwargs):
        self.queued.append((getattr(func, "__name__", str(func)), args))


def _fresh_engine_sync():
    """No-op stub — actual dispose done inside each async block."""
    pass


def _cleanup(email: str):
    psql(f"DELETE FROM wallets WHERE user_id=(SELECT id FROM users WHERE email='{email}');")
    psql(f"DELETE FROM profiles WHERE user_id=(SELECT id FROM users WHERE email='{email}');")
    psql(f"DELETE FROM password_reset_tokens WHERE user_id=(SELECT id FROM users WHERE email='{email}');")
    psql(f"DELETE FROM email_verification_tokens WHERE user_id=(SELECT id FROM users WHERE email='{email}');")
    psql(f"DELETE FROM users WHERE email='{email}';")


# ---------------- Health ----------------
def test_health():
    r = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert r.status_code == 200


# ---------------- Regression: existing selftest2 user login ----------------
def test_login_selftest2_regression():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "selftest2@test.com", "password": "Passw0rd123"}, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["user"]["email"] == "selftest2@test.com"


# ---------------- Register sets auth_provider='password', is_verified=false ----------------
def test_register_sets_password_provider_unverified():
    email = f"reg_{secrets.token_hex(4)}@test.com"
    try:
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"email": email, "password": "Passw0rd123", "full_name": "Reg X"},
                          timeout=15)
        assert r.status_code == 200, r.text
        row = psql(f"SELECT auth_provider, is_verified, password_hash IS NOT NULL FROM users WHERE email='{email}';")
        provider, verified, has_pw = row.split("|")
        assert provider == "password"
        assert verified == "f"
        assert has_pw == "t"
    finally:
        _cleanup(email)


# ---------------- MAIN BUG FIX: Password-first user + Google link ----------------
def test_password_user_google_link_does_not_auto_verify():
    os.environ.setdefault("GOOGLE_CLIENT_ID", "local-test-client-id")
    os.environ.setdefault("GOOGLE_CLIENT_SECRET", "local-test-secret")

    from unittest.mock import patch
    from routes import auth_routes
    from database import SessionLocal, engine
    from sqlalchemy import select
    from models import User
    from fastapi import Response

    email = f"pwgoog_{secrets.token_hex(4)}@test.com"
    gsub = f"gsub-{secrets.token_hex(6)}"

    # Step 1: register via password (unverified)
    rr = requests.post(f"{BASE_URL}/api/auth/register",
                       json={"email": email, "password": "Passw0rd123", "full_name": "PW User"},
                       timeout=15)
    assert rr.status_code == 200, rr.text
    try:
        # confirm state
        row = psql(f"SELECT auth_provider, is_verified FROM users WHERE email='{email}';")
        assert row == "password|f", f"pre-google state wrong: {row}"

        # Step 2: exercise google_auth for the SAME email (mocked google)
        tasks = FakeTasks()

        async def run_google():
            with patch.object(auth_routes.httpx, "AsyncClient", make_fake_client(email, gsub)):
                await engine.dispose()
                async with SessionLocal() as db:
                    payload = auth_routes.GoogleAuthRequest(code="fc", redirect_uri="http://x/cb")
                    resp = await auth_routes.google_auth(payload, Response(), tasks, db)
                    return resp

        result = asyncio.run(run_google())
        assert result.token and result.user.email == email

        # Post-google state assertions
        row = psql(f"SELECT auth_provider, is_verified, google_sub FROM users WHERE email='{email}';")
        provider, verified, stored_sub = row.split("|")
        assert provider == "password", f"auth_provider must remain 'password', got {provider}"
        assert verified == "f", f"is_verified must remain FALSE after Google link, got {verified}"
        assert stored_sub == gsub

        # NO send_email should have been queued (is_new_user was False)
        send_tasks = [q for q in tasks.queued if q[0] == "send_email"]
        assert len(send_tasks) == 0, f"Expected 0 emails on existing-user Google link, got {send_tasks}"

        # Token from google_auth response should be a working JWT
        me = requests.get(f"{BASE_URL}/api/auth/me",
                          headers={"Authorization": f"Bearer {result.token}"}, timeout=10)
        assert me.status_code == 200, me.text
        assert me.json()["email"] == email
        assert me.json()["is_verified"] is False
    finally:
        _cleanup(email)


# ---------------- Verification token flow after Google link still works ----------------
def test_verification_after_google_link_verifies_user():
    os.environ.setdefault("GOOGLE_CLIENT_ID", "local-test-client-id")
    os.environ.setdefault("GOOGLE_CLIENT_SECRET", "local-test-secret")

    from unittest.mock import patch
    from routes import auth_routes
    from database import SessionLocal, engine
    from fastapi import Response

    email = f"verafter_{secrets.token_hex(4)}@test.com"
    gsub = f"gsub-{secrets.token_hex(6)}"

    # Register
    rr = requests.post(f"{BASE_URL}/api/auth/register",
                       json={"email": email, "password": "Passw0rd123", "full_name": "V User"},
                       timeout=15)
    assert rr.status_code == 200
    try:
        # Google link
        tasks = FakeTasks()

        async def run_google():
            with patch.object(auth_routes.httpx, "AsyncClient", make_fake_client(email, gsub)):
                await engine.dispose()
                async with SessionLocal() as db:
                    await auth_routes.google_auth(
                        auth_routes.GoogleAuthRequest(code="fc", redirect_uri="http://x/cb"),
                        Response(), tasks, db,
                    )

        asyncio.run(run_google())
        assert psql(f"SELECT is_verified FROM users WHERE email='{email}';") == "f"

        # Insert a known raw verify token
        uid = psql(f"SELECT id FROM users WHERE email='{email}';")
        raw = "vtok_" + secrets.token_hex(8)
        h = hashlib.sha256(raw.encode()).hexdigest()
        # Invalidate any live tokens (register created one)
        psql(f"UPDATE email_verification_tokens SET used_at = NOW() WHERE user_id='{uid}' AND used_at IS NULL;")
        psql(
            f"INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at, created_at) "
            f"VALUES (gen_random_uuid(), '{uid}', '{h}', NOW() + INTERVAL '2 hours', NOW());"
        )

        vr = requests.post(f"{BASE_URL}/api/auth/verify-email", json={"token": raw}, timeout=10)
        assert vr.status_code == 200, vr.text
        assert vr.json().get("ok") is True

        row = psql(f"SELECT auth_provider, is_verified FROM users WHERE email='{email}';")
        assert row == "password|t", f"After email verify: expected password|t, got {row}"
    finally:
        _cleanup(email)


# ---------------- First-time Google user auto-verifies + emails ----------------
def test_first_time_google_user_autoverifies_and_emails():
    os.environ.setdefault("GOOGLE_CLIENT_ID", "local-test-client-id")
    os.environ.setdefault("GOOGLE_CLIENT_SECRET", "local-test-secret")

    from unittest.mock import patch
    from routes import auth_routes
    from database import SessionLocal, engine
    from fastapi import Response

    email = f"newg_{secrets.token_hex(4)}@test.com"
    gsub = f"gsub-{secrets.token_hex(6)}"

    tasks = FakeTasks()

    async def run_google():
        with patch.object(auth_routes.httpx, "AsyncClient", make_fake_client(email, gsub)):
            await engine.dispose()
            async with SessionLocal() as db:
                await auth_routes.google_auth(
                    auth_routes.GoogleAuthRequest(code="fc", redirect_uri="http://x/cb"),
                    Response(), tasks, db,
                )

    try:
        asyncio.run(run_google())
        row = psql(f"SELECT auth_provider, is_verified, password_hash IS NOT NULL, google_sub FROM users WHERE email='{email}';")
        provider, verified, has_pw, stored_sub = row.split("|")
        assert provider == "google"
        assert verified == "t"
        assert has_pw == "t"  # generated password
        assert stored_sub == gsub

        send_tasks = [q for q in tasks.queued if q[0] == "send_email"]
        assert len(send_tasks) == 2, f"Expected 2 emails, got {send_tasks}"
        subjects = [args[0] for _, args in send_tasks]
        assert not any("Verify" in s for s in subjects), f"unexpected verify email: {subjects}"
    finally:
        _cleanup(email)


# ---------------- Migration backfill (idempotent) ----------------
def test_migration_backfill_google_and_password():
    from database import SessionLocal, engine
    from seed import apply_profile_migrations

    goog_email = f"legacyg_{secrets.token_hex(4)}@test.com"
    pw_email = f"legacyp_{secrets.token_hex(4)}@test.com"

    # Legacy google-only (password_hash NULL, google_sub set, auth_provider NULL)
    psql(
        f"INSERT INTO users (id, email, google_sub, is_verified, is_active, role, auth_provider) "
        f"VALUES (gen_random_uuid(), '{goog_email}', 'gsub-legacy-{secrets.token_hex(3)}', TRUE, TRUE, 'trader', NULL);"
    )
    # Legacy password (password_hash set, auth_provider NULL)
    psql(
        f"INSERT INTO users (id, email, password_hash, is_verified, is_active, role, auth_provider) "
        f"VALUES (gen_random_uuid(), '{pw_email}', 'x', TRUE, TRUE, 'trader', NULL);"
    )
    # Sanity: currently NULL
    assert psql(f"SELECT auth_provider IS NULL FROM users WHERE email='{goog_email}';") == "t"
    assert psql(f"SELECT auth_provider IS NULL FROM users WHERE email='{pw_email}';") == "t"

    async def run_migration():
        await engine.dispose()
        async with SessionLocal() as db:
            await apply_profile_migrations(db)
            await db.commit()

    try:
        asyncio.run(run_migration())
        assert psql(f"SELECT auth_provider FROM users WHERE email='{goog_email}';") == "google"
        assert psql(f"SELECT auth_provider FROM users WHERE email='{pw_email}';") == "password"
    finally:
        psql(f"DELETE FROM users WHERE email IN ('{goog_email}', '{pw_email}');")


# ---------------- Admin endpoints report ORIGINAL auth_provider ----------------
@pytest.fixture(scope="module")
def admin_creds():
    """Seed an admin user directly via psql (idempotent)."""
    from auth import hash_password
    email = "admintest@test.com"
    password = "AdminPw123!"
    ph = hash_password(password).replace("'", "''")
    existing = psql(f"SELECT id FROM users WHERE email='{email}';")
    if not existing:
        psql(
            f"INSERT INTO users (id, email, password_hash, role, is_verified, is_active, auth_provider) "
            f"VALUES (gen_random_uuid(), '{email}', '{ph}', 'admin', TRUE, TRUE, 'password');"
        )
    else:
        psql(f"UPDATE users SET password_hash='{ph}', role='admin', is_active=TRUE, auth_provider='password' WHERE email='{email}';")
    yield {"email": email, "password": password}


@pytest.fixture(scope="module")
def admin_token(admin_creds):
    r = requests.post(f"{BASE_URL}/api/admin/login",
                      json={"email": admin_creds["email"], "password": admin_creds["password"]},
                      timeout=10)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def test_admin_stats_and_user_list_show_original_provider(admin_token):
    os.environ.setdefault("GOOGLE_CLIENT_ID", "local-test-client-id")
    os.environ.setdefault("GOOGLE_CLIENT_SECRET", "local-test-secret")

    from unittest.mock import patch
    from routes import auth_routes
    from database import SessionLocal, engine
    from fastapi import Response

    # 1) password user then Google-linked
    pw_email = f"admpw_{secrets.token_hex(4)}@test.com"
    pw_gsub = f"gsub-{secrets.token_hex(6)}"
    rr = requests.post(f"{BASE_URL}/api/auth/register",
                       json={"email": pw_email, "password": "Passw0rd123"}, timeout=15)
    assert rr.status_code == 200

    async def link_google(email, sub):
        with patch.object(auth_routes.httpx, "AsyncClient", make_fake_client(email, sub)):
            await engine.dispose()
            async with SessionLocal() as db:
                await auth_routes.google_auth(
                    auth_routes.GoogleAuthRequest(code="fc", redirect_uri="http://x/cb"),
                    Response(), FakeTasks(), db,
                )

    asyncio.run(link_google(pw_email, pw_gsub))

    # 2) google-first user
    gf_email = f"admgf_{secrets.token_hex(4)}@test.com"
    gf_gsub = f"gsub-{secrets.token_hex(6)}"
    asyncio.run(link_google(gf_email, gf_gsub))

    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        # stats
        st = requests.get(f"{BASE_URL}/api/admin/stats", headers=headers, timeout=10)
        assert st.status_code == 200, st.text
        stats = st.json()
        # Only auth_provider='google' should be counted
        db_google = int(psql("SELECT COUNT(*) FROM users WHERE auth_provider='google';"))
        assert stats["google_users"] == db_google, (stats, db_google)

        # list — search by email
        for email, expected in [(pw_email, "password"), (gf_email, "google")]:
            lr = requests.get(f"{BASE_URL}/api/admin/users",
                              headers=headers, params={"search": email}, timeout=10)
            assert lr.status_code == 200, lr.text
            items = lr.json()["items"]
            assert items, f"no items for {email}"
            match = [i for i in items if i["email"] == email]
            assert match, f"user not in results: {email}"
            assert match[0]["auth_provider"] == expected, f"{email} -> {match[0]['auth_provider']} != {expected}"

            # detail endpoint
            uid = match[0]["id"]
            dr = requests.get(f"{BASE_URL}/api/admin/users/{uid}", headers=headers, timeout=10)
            assert dr.status_code == 200
            assert dr.json()["user"]["auth_provider"] == expected
    finally:
        _cleanup(pw_email)
        _cleanup(gf_email)
