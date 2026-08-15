"""VPS production 2FA endpoint smoke tests against https://api.binaryfundglobal.com.

Verifies the user-reported bug ('code page not appearing after deploy') is fixed
by confirming the 2FA endpoints are live and behave correctly on the LIVE VPS.
"""
import requests

BASE = "https://api.binaryfundglobal.com"
EMAIL = "bfg.2fa.probe@test.com"
PASSWORD = "Probe2FA123"


def _login():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login status {r.status_code}: {r.text}"
    return r.json()


def test_login_returns_2fa_challenge():
    data = _login()
    assert data.get("requires_2fa") is True
    assert isinstance(data.get("pending_token"), str) and len(data["pending_token"]) > 20
    assert "token" not in data  # NO auth token yet
    # masked email like b***********e@test.com
    assert data.get("email", "").startswith("b") and "*" in data["email"]
    assert data["email"].endswith("e@test.com")


def test_verify_wrong_code_returns_400():
    pending = _login()["pending_token"]
    r = requests.post(
        f"{BASE}/api/auth/2fa/verify",
        json={"pending_token": pending, "code": "000000"},
        timeout=15,
    )
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
    assert "Invalid authentication code" in r.text


def test_resend_immediately_throttled_429():
    pending = _login()["pending_token"]
    r = requests.post(
        f"{BASE}/api/auth/2fa/resend",
        json={"pending_token": pending},
        timeout=15,
    )
    assert r.status_code == 429, f"expected 429, got {r.status_code}: {r.text}"
