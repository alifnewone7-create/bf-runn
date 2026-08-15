"""CORS allowlist + admin login flow tests against local backend."""
import os
import pytest
import requests

BASE_URL = "http://localhost:8001"
ALLOWED_ORIGIN = "https://fund-runner.preview.emergentagent.com"
BLOCKED_ORIGIN = "https://evil-attacker.com"
ADMIN_EMAIL = "admin@binaryfundglobal.com"
ADMIN_PASSWORD = "Iamhear@#12"


def _lower_headers(resp):
    return {k.lower(): v for k, v in resp.headers.items()}


# --- basic health / config ---

def test_health():
    r = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert r.status_code == 200
    assert r.json().get("status") == "healthy"


def test_public_config_has_google_client_id():
    r = requests.get(f"{BASE_URL}/api/config/public", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert "google_client_id" in data
    # env value should be forwarded
    assert data["google_client_id"] == os.environ.get(
        "GOOGLE_CLIENT_ID",
        "1020390182228-hcr4c2eq250dj8e59cbetdb0u716mtq7.apps.googleusercontent.com",
    )


# --- CORS preflight ---

def test_preflight_allowed_origin():
    r = requests.options(
        f"{BASE_URL}/api/auth/login",
        headers={
            "Origin": ALLOWED_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
        timeout=10,
    )
    assert r.status_code == 200
    h = _lower_headers(r)
    assert h.get("access-control-allow-origin") == ALLOWED_ORIGIN
    assert h.get("access-control-allow-credentials", "").lower() == "true"


def test_preflight_blocked_origin():
    r = requests.options(
        f"{BASE_URL}/api/auth/login",
        headers={
            "Origin": BLOCKED_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
        timeout=10,
    )
    h = _lower_headers(r)
    aco = h.get("access-control-allow-origin")
    # Either no header or a non-matching value — must NOT echo the blocked origin
    assert aco != BLOCKED_ORIGIN
    assert aco is None or aco == ""


# --- POST login with Origin header ---

def test_login_allowed_origin_sets_cors_and_returns_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        headers={"Origin": ALLOWED_ORIGIN, "Content-Type": "application/json"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    h = _lower_headers(r)
    assert h.get("access-control-allow-origin") == ALLOWED_ORIGIN
    assert h.get("access-control-allow-credentials", "").lower() == "true"

    body = r.json()
    # NOTE: implementation returns the access JWT under key "token" (not "access_token") in body.
    # Cookies use "access_token"/"refresh_token" names.
    token_val = body.get("access_token") or body.get("token")
    assert token_val and isinstance(token_val, str)

    cookies = r.cookies.get_dict()
    assert "access_token" in cookies, f"cookies={cookies}"
    assert "refresh_token" in cookies, f"cookies={cookies}"


def test_login_blocked_origin_no_cors_header():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        headers={"Origin": BLOCKED_ORIGIN, "Content-Type": "application/json"},
        timeout=15,
    )
    # Login itself may still succeed server-side, but CORS header must NOT echo blocked origin
    h = _lower_headers(r)
    aco = h.get("access-control-allow-origin")
    assert aco != BLOCKED_ORIGIN
    assert aco is None or aco == ""


def test_login_standard_flow_no_origin():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        headers={"Content-Type": "application/json"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("access_token") or body.get("token")
    cookies = r.cookies.get_dict()
    assert "access_token" in cookies
    assert "refresh_token" in cookies
