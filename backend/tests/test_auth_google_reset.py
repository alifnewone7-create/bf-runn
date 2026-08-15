"""Tests for Google-user password reset fix + Google welcome email templates + registration flow.
Backend-only; runs against local replica on http://localhost:8001.
"""
import os
import re
import time
# Load backend .env so DATABASE_URL etc are available when importing backend modules
try:
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
except Exception:
    with open("/app/backend/.env") as _f:
        for _line in _f:
            _line = _line.strip()
            if not _line or _line.startswith("#") or "=" not in _line:
                continue
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))
import hashlib
import secrets
import subprocess
import pytest
import requests

BASE_URL = "http://localhost:8001"
LOG_FILE = "/var/log/supervisor/backend.err.log"

PSQL = ["sudo", "-u", "postgres", "psql", "-d", "bfg", "-t", "-A", "-c"]


def psql(sql: str) -> str:
    out = subprocess.run(PSQL + [sql], capture_output=True, text=True, timeout=15)
    assert out.returncode == 0, f"psql failed: {out.stderr}"
    return out.stdout.strip()


def tail_log(nlines=200) -> str:
    out = subprocess.run(["tail", "-n", str(nlines), LOG_FILE],
                         capture_output=True, text=True)
    return out.stdout


# ---------- Health ----------
def test_health():
    r = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert r.status_code == 200


# ---------- Regression: normal login still works ----------
def test_login_selftest_user():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "selftest1@test.com", "password": "Passw0rd123"},
                      timeout=10)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "token" in body and body["user"]["email"] == "selftest1@test.com"


# ---------- Registration flow queues welcome + verification emails ----------
def test_register_flow_queues_two_emails():
    email = f"regtest_{secrets.token_hex(4)}@test.com"
    # size log before
    before = len(tail_log(1000))
    r = requests.post(f"{BASE_URL}/api/auth/register",
                      json={"email": email, "password": "Passw0rd123", "full_name": "Reg Test"},
                      timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["email"] == email
    assert "token" in body
    # Give BackgroundTasks a moment to run
    time.sleep(1.5)
    log = tail_log(2000)
    # SMTP not configured -> should log skipping email for both welcome + verification (2 lines with this email)
    matches = re.findall(rf"SMTP not configured.*{re.escape(email)}", log)
    assert len(matches) >= 2, f"Expected >=2 'SMTP not configured' log lines for {email}, got {len(matches)}. Log tail:\n{log[-1500:]}"
    # cleanup
    psql(f"DELETE FROM users WHERE email='{email}';")


# ---------- BUG FIX: Google-only user forgot-password creates token + queues email ----------
def test_forgot_password_for_google_only_user_creates_token_and_queues_email():
    email = f"gonly_{secrets.token_hex(4)}@test.com"
    gsub = f"gsub-{secrets.token_hex(6)}"
    # Insert fresh google-only user
    psql(
        f"INSERT INTO users (id, email, google_sub, is_verified, is_active, role) "
        f"VALUES (gen_random_uuid(), '{email}', '{gsub}', TRUE, TRUE, 'trader');"
    )
    uid = psql(f"SELECT id FROM users WHERE email='{email}';")
    assert uid, "user not inserted"

    # Snapshot token count
    before_count = int(psql(f"SELECT COUNT(*) FROM password_reset_tokens WHERE user_id='{uid}';") or "0")

    r = requests.post(f"{BASE_URL}/api/auth/forgot-password",
                      json={"email": email}, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True

    time.sleep(1.0)
    after_count = int(psql(f"SELECT COUNT(*) FROM password_reset_tokens WHERE user_id='{uid}';") or "0")
    assert after_count == before_count + 1, "Password reset token row was not created for google-only user"

    log = tail_log(2000)
    assert f"Password reset email queued for {email}" in log, \
        f"Expected 'Password reset email queued for {email}' in backend log"

    # cleanup
    psql(f"DELETE FROM password_reset_tokens WHERE user_id='{uid}';")
    psql(f"DELETE FROM users WHERE id='{uid}';")


# ---------- Full reset flow with a known raw token ----------
def test_full_reset_flow_for_google_only_user():
    email = f"grst_{secrets.token_hex(4)}@test.com"
    gsub = f"gsub-{secrets.token_hex(6)}"
    psql(
        f"INSERT INTO users (id, email, google_sub, is_verified, is_active, role) "
        f"VALUES (gen_random_uuid(), '{email}', '{gsub}', TRUE, TRUE, 'trader');"
    )
    uid = psql(f"SELECT id FROM users WHERE email='{email}';")
    assert uid

    # Insert a known raw token
    raw = "testtoken_" + secrets.token_hex(8)
    h = hashlib.sha256(raw.encode()).hexdigest()
    psql(
        f"INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) "
        f"VALUES (gen_random_uuid(), '{uid}', '{h}', NOW() + INTERVAL '30 minutes', NOW());"
    )

    # Status endpoint should say valid
    s = requests.get(f"{BASE_URL}/api/auth/reset-password/status", params={"token": raw}, timeout=10)
    assert s.status_code == 200
    assert s.json().get("status") == "valid", s.json()

    # Reset password
    new_pw = "BrandNewPw123"
    rr = requests.post(f"{BASE_URL}/api/auth/reset-password",
                       json={"token": raw, "new_password": new_pw}, timeout=10)
    assert rr.status_code == 200, rr.text
    assert rr.json().get("ok") is True

    # Login with new password should succeed
    lr = requests.post(f"{BASE_URL}/api/auth/login",
                       json={"email": email, "password": new_pw}, timeout=10)
    assert lr.status_code == 200, lr.text
    assert lr.json()["user"]["email"] == email

    # Reusing same token should now say "used"
    s2 = requests.get(f"{BASE_URL}/api/auth/reset-password/status", params={"token": raw}, timeout=10)
    assert s2.json().get("status") == "used"

    # cleanup
    psql(f"DELETE FROM password_reset_tokens WHERE user_id='{uid}';")
    psql(f"DELETE FROM users WHERE id='{uid}';")


# ---------- forgot-password for normal user (regression) ----------
def test_forgot_password_normal_user():
    uid = psql("SELECT id FROM users WHERE email='selftest1@test.com';")
    assert uid, "selftest1 user missing"
    before_count = int(psql(f"SELECT COUNT(*) FROM password_reset_tokens WHERE user_id='{uid}';") or "0")
    r = requests.post(f"{BASE_URL}/api/auth/forgot-password",
                      json={"email": "selftest1@test.com"}, timeout=10)
    assert r.status_code == 200
    time.sleep(0.8)
    after_count = int(psql(f"SELECT COUNT(*) FROM password_reset_tokens WHERE user_id='{uid}';") or "0")
    assert after_count == before_count + 1
    log = tail_log(1500)
    assert "Password reset email queued for selftest1@test.com" in log
    # cleanup extra token created
    psql(f"DELETE FROM password_reset_tokens WHERE user_id='{uid}' AND used_at IS NULL;")


# ---------- forgot-password for unknown email (regression) ----------
def test_forgot_password_unknown_email():
    unknown = f"nosuch_{secrets.token_hex(4)}@nowhere.com"
    r = requests.post(f"{BASE_URL}/api/auth/forgot-password",
                      json={"email": unknown}, timeout=10)
    assert r.status_code == 200
    # generic ok response
    assert r.json().get("ok") is True
    time.sleep(0.5)
    log = tail_log(1500)
    assert f"unknown email {unknown}" in log


# ---------- Unit-level: _generate_strong_password ----------
def test_generate_strong_password_unit():
    import sys
    sys.path.insert(0, "/app/backend")
    from routes.auth_routes import _generate_strong_password
    for _ in range(20):
        pw = _generate_strong_password()
        assert len(pw) == 16
        assert pw.isalnum()
        assert any(c.islower() for c in pw)
        assert any(c.isupper() for c in pw)
        assert any(c.isdigit() for c in pw)


# ---------- Unit-level: email templates ----------
def test_google_welcome_email_template():
    import sys
    sys.path.insert(0, "/app/backend")
    from emailer import build_google_welcome_email
    subject, html, text = build_google_welcome_email("u@test.com", "John Doe", "MyStrongPw12345A")
    assert "Login Details" in subject or "Login" in subject
    # contains password
    assert "MyStrongPw12345A" in html
    assert "MyStrongPw12345A" in text
    # mentions Google
    assert "Google" in html
    # brand template
    assert "Binary Fund" in html


def test_welcome_email_verified_flag():
    import sys
    sys.path.insert(0, "/app/backend")
    from emailer import build_welcome_email
    # verified=True: should NOT mention 'verification message we sent separately'
    _, html_v, text_v = build_welcome_email("u@test.com", "John", verified=True)
    assert "verification message we sent separately" not in html_v
    assert "verification message we sent separately" not in text_v
    assert "already verified" in html_v.lower()

    # verified=False (default): SHOULD mention verification message
    _, html_n, text_n = build_welcome_email("u@test.com", "John", verified=False)
    assert "verification message we sent separately" in html_n


# ---------- Email design (single-green rectangle: BG == CARD == #e3f4e9, no card border) ----------
def test_email_templates_use_single_green_rectangle_design():
    import sys
    sys.path.insert(0, "/app/backend")
    import emailer
    assert emailer.BG == "#e3f4e9"
    assert emailer.CARD == "#e3f4e9"

    templates = [
        emailer.build_verification_email("u@test.com", "https://x/verify"),
        emailer.build_welcome_email("u@test.com", "Jane", verified=False),
        emailer.build_welcome_email("u@test.com", "Jane", verified=True),
        emailer.build_google_welcome_email("u@test.com", "Jane", "Pw12345"),
        emailer.build_reset_email("https://x/reset"),
    ]
    for subject, html, text in templates:
        # No card border with the old grey/green stroke
        assert "border:1px solid rgba(15,157,99,0.18)" not in html, \
            f"Template '{subject}' still has old card border"
        # Body must NOT have a white outer background
        assert "background-color:#ffffff" not in html.lower().replace(" ", ""), \
            f"Template '{subject}' has white outer background"
        # BG color used consistently
        assert "#e3f4e9" in html


# ---------- Unit-level: Google new-user auth logic (mock google endpoints) ----------
def test_google_auth_new_user_flow_sends_two_emails_no_verification():
    """Simulate google_auth() by mocking httpx responses; check new user has password_hash,
    google welcome + welcome(verified=True) are queued, NO verification email is queued."""
    import sys, asyncio
    sys.path.insert(0, "/app/backend")
    from unittest.mock import patch

    os.environ.setdefault("GOOGLE_CLIENT_ID", "local-test-client-id")
    os.environ.setdefault("GOOGLE_CLIENT_SECRET", "local-test-secret")

    from routes import auth_routes
    from database import SessionLocal as async_session_maker
    from sqlalchemy import select
    from models import User

    test_email = f"gauth_{secrets.token_hex(4)}@test.com"
    test_gsub = f"gsub-{secrets.token_hex(6)}"

    queued = []

    class FakeTasks:
        def add_task(self, func, *args, **kwargs):
            queued.append((func.__name__, args))

    class FakeResp:
        def __init__(self, status_code, data):
            self.status_code = status_code
            self._data = data
            self.text = str(data)
        def json(self):
            return self._data

    class FakeHttpClient:
        def __init__(self, *a, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, data=None):
            return FakeResp(200, {"access_token": "fake_at"})
        async def get(self, url, headers=None):
            return FakeResp(200, {
                "email": test_email,
                "sub": test_gsub,
                "name": "Google User",
                "email_verified": True,
                "picture": "https://example.com/p.png",
            })

    from fastapi import Response

    async def run_it():
        with patch.object(auth_routes.httpx, "AsyncClient", FakeHttpClient):
            async with async_session_maker() as db:
                payload = auth_routes.GoogleAuthRequest(
                    code="fake_code", redirect_uri="http://localhost/cb",
                )
                resp = Response()
                await auth_routes.google_auth(payload, resp, FakeTasks(), db)

        async with async_session_maker() as db:
            u = (await db.execute(select(User).where(User.email == test_email))).scalar_one_or_none()
            return u

    u = asyncio.run(run_it())
    try:
        assert u is not None, "user not created"
        assert u.password_hash, "password_hash must be set for new Google user"
        assert u.google_sub == test_gsub
        assert u.is_verified is True

        send_tasks = [q for q in queued if q[0] == "send_email"]
        assert len(send_tasks) == 2, f"Expected 2 send_email tasks, got {len(send_tasks)}: {send_tasks}"
        subjects = [args[0] for _, args in send_tasks]
        assert any("Login Details" in s or "Login" in s for s in subjects), f"missing google welcome, subjects={subjects}"
        assert any("Welcome" in s for s in subjects), f"missing welcome, subjects={subjects}"
        assert not any("Verify" in s for s in subjects), f"Should NOT get verify email, subjects={subjects}"
    finally:
        psql(f"DELETE FROM wallets WHERE user_id=(SELECT id FROM users WHERE email='{test_email}');")
        psql(f"DELETE FROM profiles WHERE user_id=(SELECT id FROM users WHERE email='{test_email}');")
        psql(f"DELETE FROM users WHERE email='{test_email}';")
