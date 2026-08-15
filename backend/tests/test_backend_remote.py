"""
Pytest suite for Binary Fund Global remote VPS backend.
Tests: health, socket.io handshake, auth, market, wallet, trade.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://api.binaryfundglobal.com").rstrip("/")


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def registered_user(api):
    """Register a fresh test user and return {token, id, email}."""
    email = f"TEST_agent_{int(time.time())}@example.com"
    r = api.post(f"{BASE_URL}/api/auth/register", json={
        "email": email, "password": "TestAgent@1234", "name": "Test Agent"
    })
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    d = r.json()
    return {"token": d["token"], "id": d["user"]["id"], "email": email}


@pytest.fixture(scope="session")
def auth_headers(registered_user):
    return {"Authorization": f"Bearer {registered_user['token']}", "Content-Type": "application/json"}


# ---------- Health / Handshake ----------
class TestHealth:
    def test_health_endpoint(self, api):
        r = api.get(f"{BASE_URL}/api/health")
        assert r.status_code == 200
        assert r.json().get("status") == "healthy"

    def test_socketio_polling_handshake(self, api):
        r = api.get(f"{BASE_URL}/api/socket.io/?EIO=4&transport=polling")
        assert r.status_code == 200, f"handshake HTTP {r.status_code}"
        body = r.text
        assert body.startswith("0{"), f"engine.io open packet expected, got: {body[:80]}"
        assert '"sid"' in body


# ---------- Auth ----------
class TestAuth:
    def test_register_returns_token(self, registered_user):
        assert registered_user["token"]
        assert registered_user["id"]

    def test_duplicate_register_rejected(self, api, registered_user):
        r = api.post(f"{BASE_URL}/api/auth/register", json={
            "email": registered_user["email"], "password": "AnyPass@123", "name": "Dup"
        })
        assert r.status_code in (400, 409)

    def test_me_endpoint(self, api, auth_headers, registered_user):
        r = api.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == registered_user["id"]
        # backend normalizes email to lowercase
        assert d["email"].lower() == registered_user["email"].lower()
        assert d["role"] == "trader"

    def test_me_without_token_rejected(self):
        # Use fresh session (no cookies) to ensure unauth request
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_login_invalid_credentials(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login", json={
            "email": "nobody_xyz@example.com", "password": "wrong"
        })
        assert r.status_code == 401


# ---------- Market ----------
class TestMarket:
    def test_instruments_list(self, api):
        r = api.get(f"{BASE_URL}/api/market/instruments")
        assert r.status_code == 200
        instruments = r.json()
        assert isinstance(instruments, list)
        assert len(instruments) >= 20, f"expected >=20 instruments, got {len(instruments)}"
        # Field checks
        first = instruments[0]
        for k in ("symbol", "name", "payout", "price"):
            assert k in first, f"missing field {k}"

    def test_candles_multi_tf(self, api):
        for tf in [5, 15, 60]:
            r = api.get(f"{BASE_URL}/api/market/candles", params={"symbol": "EURUSD_OTC", "tf": tf})
            assert r.status_code == 200, f"tf={tf} → {r.status_code}"
            body = r.json()
            # backend returns {symbol, tf, candles: [...]}
            candles = body.get("candles", body) if isinstance(body, dict) else body
            assert isinstance(candles, list)
            assert len(candles) > 0
            first = candles[0]
            for k in ("time", "open", "high", "low", "close"):
                assert k in first


# ---------- Wallet + Trade ----------
class TestTrade:
    def test_wallet_initial_balance(self, api, auth_headers):
        r = api.get(f"{BASE_URL}/api/wallet", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["balance"] == 10000.0
        assert d["currency"] == "USD"
        assert d["type"] == "demo"

    def test_place_and_settle_trade(self, api, auth_headers):
        # Get pre balance
        pre = api.get(f"{BASE_URL}/api/wallet", headers=auth_headers).json()["balance"]

        r = api.post(f"{BASE_URL}/api/trade/place", headers=auth_headers, json={
            "symbol": "EURUSD_OTC", "direction": "higher", "amount": 5, "duration": 10
        })
        assert r.status_code == 200, r.text
        d = r.json()
        trade = d["trade"]
        assert trade["status"] == "open"
        assert trade["amount"] == 5.0
        assert d["balance"] == pytest.approx(pre - 5, abs=0.01)
        trade_id = trade["id"]

        # verify listed as open
        open_r = api.get(f"{BASE_URL}/api/trade/open", headers=auth_headers)
        assert open_r.status_code == 200
        assert any(t["id"] == trade_id for t in open_r.json())

        # wait for expiry + settle
        time.sleep(13)

        hist_r = api.get(f"{BASE_URL}/api/trade/history", headers=auth_headers)
        assert hist_r.status_code == 200
        settled = next((t for t in hist_r.json() if t["id"] == trade_id), None)
        assert settled is not None, "settled trade not found in history"
        assert settled["status"] in ("won", "lost", "tie")
        assert settled["exit_price"] is not None
        assert settled["closed_at"] is not None

        # verify wallet updated
        post = api.get(f"{BASE_URL}/api/wallet", headers=auth_headers).json()["balance"]
        if settled["status"] == "won":
            assert post > pre - 5
        elif settled["status"] == "lost":
            assert post == pytest.approx(pre - 5, abs=0.01)

    def test_place_trade_insufficient_balance(self, api, auth_headers):
        r = api.post(f"{BASE_URL}/api/trade/place", headers=auth_headers, json={
            "symbol": "EURUSD_OTC", "direction": "higher", "amount": 999999, "duration": 30
        })
        assert r.status_code in (400, 422)

    def test_place_trade_invalid_symbol(self, api, auth_headers):
        r = api.post(f"{BASE_URL}/api/trade/place", headers=auth_headers, json={
            "symbol": "NOSUCH_SYM", "direction": "higher", "amount": 5, "duration": 30
        })
        assert r.status_code in (400, 404, 422)
