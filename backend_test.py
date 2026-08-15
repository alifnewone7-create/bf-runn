#!/usr/bin/env python3
"""Backend API test suite for Binary Fund Global."""
import asyncio
import json
import time
import sys
from datetime import datetime

import httpx
import websockets

# Backend URL from frontend/.env
BASE_URL = "https://fund-tracker-315.preview.emergentagent.com/api"
WS_URL = "wss://fund-tracker-315.preview.emergentagent.com/api/market/ws"

# Test credentials
ADMIN_EMAIL = "admin@binaryfundglobal.com"
ADMIN_PASSWORD = "Iamhear@#12"

# Test user for registration
TEST_USER_EMAIL = f"trader_{int(time.time())}@example.com"
TEST_USER_PASSWORD = "SecurePass123!"
TEST_USER_NAME = "John Trader"
TEST_USER_COUNTRY = "United States"


class TestResults:
    def __init__(self):
        self.passed = []
        self.failed = []
        self.warnings = []

    def add_pass(self, test_name: str, details: str = ""):
        self.passed.append((test_name, details))
        print(f"✅ PASS: {test_name}")
        if details:
            print(f"   {details}")

    def add_fail(self, test_name: str, error: str):
        self.failed.append((test_name, error))
        print(f"❌ FAIL: {test_name}")
        print(f"   Error: {error}")

    def add_warning(self, test_name: str, message: str):
        self.warnings.append((test_name, message))
        print(f"⚠️  WARNING: {test_name}")
        print(f"   {message}")

    def summary(self):
        print("\n" + "=" * 80)
        print("TEST SUMMARY")
        print("=" * 80)
        print(f"✅ Passed: {len(self.passed)}")
        print(f"❌ Failed: {len(self.failed)}")
        print(f"⚠️  Warnings: {len(self.warnings)}")
        print("=" * 80)
        if self.failed:
            print("\nFailed Tests:")
            for name, error in self.failed:
                print(f"  • {name}: {error}")
        return len(self.failed) == 0


results = TestResults()


async def test_health():
    """Test health endpoints."""
    print("\n" + "=" * 80)
    print("1. HEALTH CHECKS")
    print("=" * 80)

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Test root endpoint
        try:
            resp = await client.get(f"{BASE_URL}/")
            if resp.status_code == 200:
                data = resp.json()
                if data.get("status") == "ok":
                    results.add_pass("GET /api/", f"Response: {data}")
                else:
                    results.add_fail("GET /api/", f"Unexpected response: {data}")
            else:
                results.add_fail("GET /api/", f"Status {resp.status_code}: {resp.text}")
        except Exception as e:
            results.add_fail("GET /api/", str(e))

        # Test health endpoint
        try:
            resp = await client.get(f"{BASE_URL}/health")
            if resp.status_code == 200:
                data = resp.json()
                if data.get("status") == "healthy":
                    results.add_pass("GET /api/health", f"Response: {data}")
                else:
                    results.add_fail("GET /api/health", f"Unexpected response: {data}")
            else:
                results.add_fail("GET /api/health", f"Status {resp.status_code}: {resp.text}")
        except Exception as e:
            results.add_fail("GET /api/health", str(e))


async def test_auth():
    """Test authentication flow."""
    print("\n" + "=" * 80)
    print("2. AUTHENTICATION FLOW")
    print("=" * 80)

    tokens = {"test_user": None, "admin": None}

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        # Test 1: Register new user
        try:
            payload = {
                "email": TEST_USER_EMAIL,
                "password": TEST_USER_PASSWORD,
                "full_name": TEST_USER_NAME,
                "country": TEST_USER_COUNTRY,
            }
            resp = await client.post(f"{BASE_URL}/auth/register", json=payload)
            if resp.status_code == 200:
                data = resp.json()
                if "token" in data and "user" in data:
                    tokens["test_user"] = data["token"]
                    user = data["user"]
                    results.add_pass(
                        "POST /api/auth/register",
                        f"User created: {user['email']}, token received, role={user['role']}"
                    )
                else:
                    results.add_fail("POST /api/auth/register", f"Missing token or user in response: {data}")
            else:
                results.add_fail("POST /api/auth/register", f"Status {resp.status_code}: {resp.text}")
        except Exception as e:
            results.add_fail("POST /api/auth/register", str(e))

        # Test 2: Duplicate registration should fail
        try:
            payload = {
                "email": TEST_USER_EMAIL,
                "password": TEST_USER_PASSWORD,
            }
            resp = await client.post(f"{BASE_URL}/auth/register", json=payload)
            if resp.status_code == 409:
                results.add_pass("POST /api/auth/register (duplicate)", "Correctly rejected with 409")
            else:
                results.add_fail(
                    "POST /api/auth/register (duplicate)",
                    f"Expected 409, got {resp.status_code}: {resp.text}"
                )
        except Exception as e:
            results.add_fail("POST /api/auth/register (duplicate)", str(e))

        # Test 3: Login with new user
        try:
            payload = {"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD}
            resp = await client.post(f"{BASE_URL}/auth/login", json=payload)
            if resp.status_code == 200:
                data = resp.json()
                if "token" in data and "user" in data:
                    tokens["test_user"] = data["token"]
                    results.add_pass("POST /api/auth/login (test user)", f"Login successful, token received")
                else:
                    results.add_fail("POST /api/auth/login (test user)", f"Missing token or user: {data}")
            else:
                results.add_fail("POST /api/auth/login (test user)", f"Status {resp.status_code}: {resp.text}")
        except Exception as e:
            results.add_fail("POST /api/auth/login (test user)", str(e))

        # Test 4: Login with admin
        try:
            payload = {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
            resp = await client.post(f"{BASE_URL}/auth/login", json=payload)
            if resp.status_code == 200:
                data = resp.json()
                if "token" in data and "user" in data:
                    tokens["admin"] = data["token"]
                    user = data["user"]
                    results.add_pass(
                        "POST /api/auth/login (admin)",
                        f"Admin login successful, role={user['role']}"
                    )
                else:
                    results.add_fail("POST /api/auth/login (admin)", f"Missing token or user: {data}")
            else:
                results.add_fail("POST /api/auth/login (admin)", f"Status {resp.status_code}: {resp.text}")
        except Exception as e:
            results.add_fail("POST /api/auth/login (admin)", str(e))

        # Test 5: Wrong password should return 401
        try:
            payload = {"email": TEST_USER_EMAIL, "password": "WrongPassword123!"}
            resp = await client.post(f"{BASE_URL}/auth/login", json=payload)
            if resp.status_code == 401:
                results.add_pass("POST /api/auth/login (wrong password)", "Correctly rejected with 401")
            else:
                results.add_fail(
                    "POST /api/auth/login (wrong password)",
                    f"Expected 401, got {resp.status_code}: {resp.text}"
                )
        except Exception as e:
            results.add_fail("POST /api/auth/login (wrong password)", str(e))

        # Test 6: GET /me with valid token (use fresh client to avoid cookie interference)
        if tokens["test_user"]:
            try:
                async with httpx.AsyncClient(timeout=30.0) as fresh_client:
                    headers = {"Authorization": f"Bearer {tokens['test_user']}"}
                    resp = await fresh_client.get(f"{BASE_URL}/auth/me", headers=headers)
                    if resp.status_code == 200:
                        data = resp.json()
                        if data.get("email") == TEST_USER_EMAIL:
                            results.add_pass("GET /api/auth/me (valid token)", f"User data retrieved: {data['email']}")
                        else:
                            results.add_fail("GET /api/auth/me (valid token)", f"Email mismatch: {data}")
                    else:
                        results.add_fail("GET /api/auth/me (valid token)", f"Status {resp.status_code}: {resp.text}")
            except Exception as e:
                results.add_fail("GET /api/auth/me (valid token)", str(e))

        # Test 7: GET /me with invalid token (use fresh client without cookies)
        try:
            async with httpx.AsyncClient(timeout=30.0) as fresh_client:
                headers = {"Authorization": "Bearer invalid_token_12345"}
                resp = await fresh_client.get(f"{BASE_URL}/auth/me", headers=headers)
                if resp.status_code == 401:
                    results.add_pass("GET /api/auth/me (invalid token)", "Correctly rejected with 401")
                else:
                    results.add_fail(
                        "GET /api/auth/me (invalid token)",
                        f"Expected 401, got {resp.status_code}: {resp.text}"
                    )
        except Exception as e:
            results.add_fail("GET /api/auth/me (invalid token)", str(e))

    return tokens


async def test_market(token: str):
    """Test market endpoints."""
    print("\n" + "=" * 80)
    print("3. MARKET DATA")
    print("=" * 80)

    symbol = None

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Test 1: List instruments
        try:
            resp = await client.get(f"{BASE_URL}/market/instruments")
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list) and len(data) > 0:
                    # Check for expected OTC instruments
                    symbols = [item.get("symbol") for item in data]
                    if len(symbols) >= 20:  # Should have ~28 instruments
                        symbol = symbols[0]  # Save for candles test
                        results.add_pass(
                            "GET /api/market/instruments",
                            f"Retrieved {len(data)} instruments (expected ~28)"
                        )
                    else:
                        results.add_fail(
                            "GET /api/market/instruments",
                            f"Expected ~28 instruments, got {len(data)}"
                        )
                else:
                    results.add_fail("GET /api/market/instruments", f"Invalid response format: {data}")
            else:
                results.add_fail("GET /api/market/instruments", f"Status {resp.status_code}: {resp.text}")
        except Exception as e:
            results.add_fail("GET /api/market/instruments", str(e))

        # Test 2: Get candles for different timeframes
        if symbol:
            for tf in [5, 15, 30, 60, 300]:
                try:
                    resp = await client.get(f"{BASE_URL}/market/candles", params={"symbol": symbol, "tf": tf, "limit": 100})
                    if resp.status_code == 200:
                        data = resp.json()
                        if "candles" in data and isinstance(data["candles"], list):
                            results.add_pass(
                                f"GET /api/market/candles (tf={tf})",
                                f"Retrieved {len(data['candles'])} candles for {symbol}"
                            )
                        else:
                            results.add_fail(
                                f"GET /api/market/candles (tf={tf})",
                                f"Invalid response format: {data}"
                            )
                    else:
                        results.add_fail(
                            f"GET /api/market/candles (tf={tf})",
                            f"Status {resp.status_code}: {resp.text}"
                        )
                except Exception as e:
                    results.add_fail(f"GET /api/market/candles (tf={tf})", str(e))
        else:
            results.add_warning("GET /api/market/candles", "Skipped: no symbol available")

    return symbol


async def test_trades(token: str, symbol: str):
    """Test trade endpoints."""
    print("\n" + "=" * 80)
    print("4. TRADING OPERATIONS")
    print("=" * 80)

    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Test 1: Get wallet balance
        initial_balance = None
        try:
            resp = await client.get(f"{BASE_URL}/wallet", headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                if "balance" in data:
                    initial_balance = data["balance"]
                    results.add_pass("GET /api/wallet", f"Balance: ${data['balance']} {data.get('currency', 'USD')}")
                else:
                    results.add_fail("GET /api/wallet", f"Missing balance in response: {data}")
            else:
                results.add_fail("GET /api/wallet", f"Status {resp.status_code}: {resp.text}")
        except Exception as e:
            results.add_fail("GET /api/wallet", str(e))

        # Test 2: Place a demo trade (CALL with short expiry)
        trade_id = None
        if symbol and initial_balance:
            try:
                payload = {
                    "symbol": symbol,
                    "direction": "higher",  # CALL
                    "amount": 10.0,
                    "duration": 10,  # 10 seconds for quick settlement
                }
                resp = await client.post(f"{BASE_URL}/trade/place", json=payload, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    if "trade" in data and "balance" in data:
                        trade = data["trade"]
                        trade_id = trade.get("id")
                        new_balance = data["balance"]
                        expected_balance = initial_balance - 10.0
                        if abs(new_balance - expected_balance) < 0.01:
                            results.add_pass(
                                "POST /api/trade/place (CALL)",
                                f"Trade placed: {trade['symbol']} {trade['direction']}, balance deducted ${initial_balance} → ${new_balance}"
                            )
                        else:
                            results.add_fail(
                                "POST /api/trade/place (CALL)",
                                f"Balance mismatch: expected ${expected_balance}, got ${new_balance}"
                            )
                    else:
                        results.add_fail("POST /api/trade/place (CALL)", f"Missing trade or balance: {data}")
                else:
                    results.add_fail("POST /api/trade/place (CALL)", f"Status {resp.status_code}: {resp.text}")
            except Exception as e:
                results.add_fail("POST /api/trade/place (CALL)", str(e))

        # Test 3: Place a PUT trade
        if symbol:
            try:
                payload = {
                    "symbol": symbol,
                    "direction": "lower",  # PUT
                    "amount": 5.0,
                    "duration": 10,
                }
                resp = await client.post(f"{BASE_URL}/trade/place", json=payload, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    if "trade" in data:
                        results.add_pass("POST /api/trade/place (PUT)", f"Trade placed: {data['trade']['symbol']} lower")
                    else:
                        results.add_fail("POST /api/trade/place (PUT)", f"Missing trade: {data}")
                else:
                    results.add_fail("POST /api/trade/place (PUT)", f"Status {resp.status_code}: {resp.text}")
            except Exception as e:
                results.add_fail("POST /api/trade/place (PUT)", str(e))

        # Test 4: List open trades
        try:
            resp = await client.get(f"{BASE_URL}/trade/open", headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list):
                    results.add_pass("GET /api/trade/open", f"Retrieved {len(data)} open trades")
                else:
                    results.add_fail("GET /api/trade/open", f"Invalid response format: {data}")
            else:
                results.add_fail("GET /api/trade/open", f"Status {resp.status_code}: {resp.text}")
        except Exception as e:
            results.add_fail("GET /api/trade/open", str(e))

        # Test 5: Wait for settlement (15 seconds)
        if trade_id:
            print(f"\n⏳ Waiting 15 seconds for trade settlement...")
            await asyncio.sleep(15)

            # Check trade history for settled trade
            try:
                resp = await client.get(f"{BASE_URL}/trade/history", headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list):
                        settled_trade = next((t for t in data if t.get("id") == trade_id), None)
                        if settled_trade:
                            status = settled_trade.get("status")
                            profit = settled_trade.get("profit")
                            if status in ["won", "lost", "tie"]:
                                results.add_pass(
                                    "Trade settlement",
                                    f"Trade settled: status={status}, profit=${profit}"
                                )
                            else:
                                results.add_fail("Trade settlement", f"Unexpected status: {status}")
                        else:
                            results.add_warning("Trade settlement", "Trade not found in history yet")
                    else:
                        results.add_fail("Trade settlement", f"Invalid response format: {data}")
                else:
                    results.add_fail("Trade settlement", f"Status {resp.status_code}: {resp.text}")
            except Exception as e:
                results.add_fail("Trade settlement", str(e))

            # Verify balance update
            try:
                resp = await client.get(f"{BASE_URL}/wallet", headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    final_balance = data.get("balance")
                    if final_balance != initial_balance:
                        results.add_pass(
                            "Balance after settlement",
                            f"Balance updated: ${initial_balance} → ${final_balance}"
                        )
                    else:
                        results.add_warning(
                            "Balance after settlement",
                            f"Balance unchanged: ${final_balance} (may be refunded tie)"
                        )
                else:
                    results.add_fail("Balance after settlement", f"Status {resp.status_code}: {resp.text}")
            except Exception as e:
                results.add_fail("Balance after settlement", str(e))

        # Test 6: Error case - insufficient balance
        try:
            payload = {
                "symbol": symbol,
                "direction": "higher",
                "amount": 999999.0,  # More than demo balance
                "duration": 60,
            }
            resp = await client.post(f"{BASE_URL}/trade/place", json=payload, headers=headers)
            if resp.status_code == 400:
                results.add_pass("POST /api/trade/place (insufficient balance)", "Correctly rejected with 400")
            else:
                results.add_fail(
                    "POST /api/trade/place (insufficient balance)",
                    f"Expected 400, got {resp.status_code}: {resp.text}"
                )
        except Exception as e:
            results.add_fail("POST /api/trade/place (insufficient balance)", str(e))

        # Test 7: Error case - invalid symbol
        try:
            payload = {
                "symbol": "INVALID_SYMBOL_XYZ",
                "direction": "higher",
                "amount": 10.0,
                "duration": 60,
            }
            resp = await client.post(f"{BASE_URL}/trade/place", json=payload, headers=headers)
            if resp.status_code == 404:
                results.add_pass("POST /api/trade/place (invalid symbol)", "Correctly rejected with 404")
            else:
                results.add_fail(
                    "POST /api/trade/place (invalid symbol)",
                    f"Expected 404, got {resp.status_code}: {resp.text}"
                )
        except Exception as e:
            results.add_fail("POST /api/trade/place (invalid symbol)", str(e))

        # Test 8: Error case - unauthenticated request
        try:
            payload = {
                "symbol": symbol,
                "direction": "higher",
                "amount": 10.0,
                "duration": 60,
            }
            resp = await client.post(f"{BASE_URL}/trade/place", json=payload)  # No auth header
            if resp.status_code == 401:
                results.add_pass("POST /api/trade/place (unauthenticated)", "Correctly rejected with 401")
            else:
                results.add_fail(
                    "POST /api/trade/place (unauthenticated)",
                    f"Expected 401, got {resp.status_code}: {resp.text}"
                )
        except Exception as e:
            results.add_fail("POST /api/trade/place (unauthenticated)", str(e))


async def test_websocket(token: str, symbol: str = None):
    """Test WebSocket market feed."""
    print("\n" + "=" * 80)
    print("5. WEBSOCKET MARKET FEED")
    print("=" * 80)

    # Use a valid symbol from market instruments
    if not symbol:
        symbol = "EURUSD_OTC"

    try:
        # Add open_timeout parameter for websockets library
        async with websockets.connect(WS_URL, open_timeout=20) as ws:
            results.add_pass("WebSocket connection", f"Connected to {WS_URL}")

            # Subscribe to a symbol
            await ws.send(json.dumps({"type": "subscribe", "symbol": symbol}))
            print(f"   Subscribed to {symbol}")

            # Wait for tick messages
            tick_count = 0
            quotes_count = 0
            timeout = time.time() + 12  # 12 second timeout

            while time.time() < timeout and (tick_count < 3 or quotes_count < 2):
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=6.0)
                    data = json.loads(msg)
                    if data.get("type") == "tick":
                        tick_count += 1
                        print(f"   Received tick: {data.get('symbol')} @ {data.get('price')}")
                    elif data.get("type") == "quotes":
                        quotes_count += 1
                        print(f"   Received quotes snapshot with {len(data.get('data', {}))} symbols")
                except asyncio.TimeoutError:
                    break

            if tick_count > 0:
                results.add_pass("WebSocket tick messages", f"Received {tick_count} tick updates and {quotes_count} quotes snapshots")
            elif quotes_count > 0:
                results.add_pass("WebSocket market data", f"Received {quotes_count} quotes snapshots (symbol-specific ticks may vary)")
            else:
                results.add_fail("WebSocket messages", "No tick or quotes messages received within timeout")

    except asyncio.TimeoutError:
        results.add_fail("WebSocket connection", "Connection timeout during handshake")
    except Exception as e:
        results.add_fail("WebSocket connection", str(e))


async def main():
    """Run all tests."""
    print("\n" + "=" * 80)
    print("BINARY FUND GLOBAL - BACKEND API TEST SUITE")
    print("=" * 80)
    print(f"Backend URL: {BASE_URL}")
    print(f"WebSocket URL: {WS_URL}")
    print(f"Test started: {datetime.now().isoformat()}")

    # 1. Health checks
    await test_health()

    # 2. Authentication
    tokens = await test_auth()

    # 3. Market data
    symbol = await test_market(tokens.get("test_user"))

    # 4. Trading operations
    if tokens.get("test_user") and symbol:
        await test_trades(tokens["test_user"], symbol)
    else:
        results.add_warning("Trading tests", "Skipped: no auth token or symbol available")

    # 5. WebSocket
    if tokens.get("test_user"):
        await test_websocket(tokens["test_user"], symbol)
    else:
        results.add_warning("WebSocket test", "Skipped: no auth token available")

    # Summary
    success = results.summary()
    print(f"\nTest completed: {datetime.now().isoformat()}")

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    asyncio.run(main())
