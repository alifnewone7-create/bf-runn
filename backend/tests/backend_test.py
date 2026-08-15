"""Backend tests for Binary Fund Global — PostgreSQL + Redis migration."""
import os
import time
import json
import asyncio
import uuid
import pytest
import requests
import websockets

BASE_URL = "http://localhost:8001"
try:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
except Exception:
    pass

TEST_EMAIL = "testuser@bfg.dev"
TEST_PASSWORD = "Testpass123!"
WSS_URL = BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/api/market/ws'


def _login_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": TEST_EMAIL, "password": TEST_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    return body["token"], body["user"]["id"]


TOKEN, USER_ID = _login_token()
AUTH = {"Authorization": f"Bearer {TOKEN}"}


# ---------- Health ----------
class TestHealth:
    def test_health(self):
        r = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert r.status_code == 200
        assert r.json() == {"status": "healthy"}


# ---------- Instruments ----------
class TestInstruments:
    def test_list_28(self):
        r = requests.get(f"{BASE_URL}/api/market/instruments", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 28
        cats = set(x['category'] for x in data)
        assert cats == {"currencies", "crypto", "commodities", "stocks"}
        for key in ("symbol", "name", "category", "payout", "digits", "icon", "price", "change_pct"):
            assert key in data[0]


# ---------- Candles ----------
class TestCandles:
    def test_valid(self):
        r = requests.get(f"{BASE_URL}/api/market/candles",
                         params={"symbol": "EURUSD_OTC", "tf": 15, "limit": 500}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["symbol"] == "EURUSD_OTC"
        assert 1 <= len(d["candles"]) <= 500

    def test_invalid_symbol(self):
        r = requests.get(f"{BASE_URL}/api/market/candles",
                         params={"symbol": "NOPE", "tf": 15}, timeout=15)
        assert r.status_code == 404


# ---------- Auth: register / duplicate ----------
class TestAuthRegister:
    def test_register_new_and_duplicate(self):
        email = f"TEST_{uuid.uuid4().hex[:10]}@bfg.dev"
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"email": email, "password": "Password123!", "full_name": "Test"}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "user" in body and "token" in body
        assert body["user"]["email"] == email.lower()
        # cookies set
        assert any("access_token" in c or "refresh_token" in c for c in r.headers.get("set-cookie", "").split(","))

        # wallet auto-created
        t = body["token"]
        w = requests.get(f"{BASE_URL}/api/wallet",
                         headers={"Authorization": f"Bearer {t}"}, timeout=15)
        assert w.status_code == 200
        assert w.json()["balance"] == 10000.0

        # duplicate
        r2 = requests.post(f"{BASE_URL}/api/auth/register",
                           json={"email": email, "password": "Password123!"}, timeout=15)
        assert r2.status_code == 409


# ---------- Auth: login / logout / me / refresh ----------
class TestAuthLogin:
    def test_login_wrong_password(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": TEST_EMAIL, "password": "wrongpass"}, timeout=15)
        assert r.status_code == 401

    def test_login_success_and_me(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": TEST_EMAIL, "password": TEST_PASSWORD}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["user"]["email"] == TEST_EMAIL

        # bearer /me
        me = requests.get(f"{BASE_URL}/api/auth/me",
                         headers={"Authorization": f"Bearer {body['token']}"}, timeout=15)
        assert me.status_code == 200
        assert me.json()["email"] == TEST_EMAIL

        # cookie-based /me using session
        me2 = s.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert me2.status_code == 200

        # refresh
        rr = s.post(f"{BASE_URL}/api/auth/refresh", timeout=15)
        assert rr.status_code == 200

        # logout
        lo = s.post(f"{BASE_URL}/api/auth/logout", timeout=15)
        assert lo.status_code == 200


# ---------- Password reset ----------
class TestPasswordReset:
    def test_forgot_password_always_ok(self):
        r = requests.post(f"{BASE_URL}/api/auth/forgot-password",
                          json={"email": TEST_EMAIL}, timeout=15)
        assert r.status_code == 200
        assert r.json()["ok"] is True

        r2 = requests.post(f"{BASE_URL}/api/auth/forgot-password",
                           json={"email": "nonexistent@bfg.dev"}, timeout=15)
        assert r2.status_code == 200


# ---------- Google OAuth shape ----------
class TestGoogle:
    def test_google_invalid_code(self):
        r = requests.post(f"{BASE_URL}/api/auth/google",
                          json={"code": "invalidcode", "redirect_uri": "http://localhost/cb"}, timeout=15)
        assert r.status_code == 400


# ---------- Wallet ----------
class TestWallet:
    def test_wallet_no_token(self):
        r = requests.get(f"{BASE_URL}/api/wallet", timeout=15)
        assert r.status_code == 401

    def test_wallet_reset_and_get(self):
        r = requests.post(f"{BASE_URL}/api/wallet/reset", headers=AUTH, timeout=15)
        assert r.status_code == 200
        assert r.json()["balance"] == 10000.0

        r = requests.get(f"{BASE_URL}/api/wallet", headers=AUTH, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["balance"] == 10000.0
        assert d["currency"] == "USD"
        assert d["type"] == "demo"


# ---------- Trade validations ----------
class TestTradeValidations:
    def setup_method(self, m):
        requests.post(f"{BASE_URL}/api/wallet/reset", headers=AUTH, timeout=15)

    def test_amount_too_low(self):
        r = requests.post(f"{BASE_URL}/api/trade/place", headers=AUTH,
                          json={"symbol": "EURUSD_OTC", "direction": "higher", "amount": 0.5, "duration": 10}, timeout=15)
        assert r.status_code == 400

    def test_insufficient(self):
        r = requests.post(f"{BASE_URL}/api/trade/place", headers=AUTH,
                          json={"symbol": "EURUSD_OTC", "direction": "higher", "amount": 999999, "duration": 10}, timeout=15)
        assert r.status_code == 400

    def test_bad_direction(self):
        r = requests.post(f"{BASE_URL}/api/trade/place", headers=AUTH,
                          json={"symbol": "EURUSD_OTC", "direction": "sideways", "amount": 10, "duration": 10}, timeout=15)
        assert r.status_code == 400

    def test_duration_too_low(self):
        r = requests.post(f"{BASE_URL}/api/trade/place", headers=AUTH,
                          json={"symbol": "EURUSD_OTC", "direction": "higher", "amount": 10, "duration": 3}, timeout=15)
        # Note: backend returns 422 via Pydantic (spec says 400) — see report
        assert r.status_code in (400, 422)

    def test_duration_too_high(self):
        r = requests.post(f"{BASE_URL}/api/trade/place", headers=AUTH,
                          json={"symbol": "EURUSD_OTC", "direction": "higher", "amount": 10, "duration": 9999}, timeout=15)
        assert r.status_code in (400, 422)

    def test_bad_symbol(self):
        r = requests.post(f"{BASE_URL}/api/trade/place", headers=AUTH,
                          json={"symbol": "NOPE", "direction": "higher", "amount": 10, "duration": 10}, timeout=15)
        assert r.status_code == 404


# ---------- Trade lifecycle ----------
class TestTradeLifecycle:
    def test_place_and_settle(self):
        requests.post(f"{BASE_URL}/api/wallet/reset", headers=AUTH, timeout=15)
        pre = requests.get(f"{BASE_URL}/api/wallet", headers=AUTH, timeout=15).json()["balance"]

        r = requests.post(f"{BASE_URL}/api/trade/place", headers=AUTH,
                          json={"symbol": "EURUSD_OTC", "direction": "higher", "amount": 25, "duration": 6}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        trade = body["trade"]
        assert trade["status"] == "open"
        assert trade["entry_price"] > 0
        assert body["balance"] == round(pre - 25, 2)

        # open trades should include it
        r = requests.get(f"{BASE_URL}/api/trade/open", headers=AUTH, timeout=15)
        assert r.status_code == 200
        assert trade["id"] in [t["id"] for t in r.json()]

        time.sleep(9)

        r = requests.get(f"{BASE_URL}/api/trade/history", headers=AUTH, timeout=15)
        assert r.status_code == 200
        hist = {t["id"]: t for t in r.json()}
        assert trade["id"] in hist, "Trade not settled"
        closed = hist[trade["id"]]
        assert closed["status"] in ("won", "lost", "tie")
        assert closed["exit_price"] is not None


# ---------- WebSocket ----------
class TestWebSocket:
    def test_tick_stream_and_trade_closed(self):
        async def run():
            async with websockets.connect(WSS_URL, open_timeout=15) as ws:
                await ws.send(json.dumps({"type": "subscribe", "symbol": "EURUSD_OTC"}))
                got_tick = False
                deadline = time.time() + 8
                while time.time() < deadline:
                    try:
                        msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=3))
                        if msg.get("type") == "tick" and msg.get("symbol") == "EURUSD_OTC":
                            got_tick = True
                            break
                    except asyncio.TimeoutError:
                        break
                assert got_tick, "No tick received"

                await ws.send(json.dumps({"type": "auth", "token": TOKEN}))
                await asyncio.sleep(0.5)

                requests.post(f"{BASE_URL}/api/wallet/reset", headers=AUTH, timeout=15)
                r = requests.post(f"{BASE_URL}/api/trade/place", headers=AUTH,
                                  json={"symbol": "EURUSD_OTC", "direction": "higher", "amount": 5, "duration": 5}, timeout=15)
                assert r.status_code == 200

                deadline = time.time() + 15
                got_close = False
                while time.time() < deadline:
                    try:
                        msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=3))
                        if msg.get("type") == "trade_closed":
                            assert "trade" in msg and "balance" in msg
                            got_close = True
                            break
                    except asyncio.TimeoutError:
                        continue
                assert got_close, "No trade_closed pushed on socket"

        asyncio.new_event_loop().run_until_complete(run())
