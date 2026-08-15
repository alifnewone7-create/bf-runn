"""End-to-end 2FA backend tests (login flow, verify, resend throttle, toggle)."""
import os, re, time, subprocess, uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fullstack-deploy-72.preview.emergentagent.com").rstrip("/")
BACKEND_LOG = "/var/log/supervisor/backend.err.log"


def _latest_code_from_logs(email: str, purpose: str) -> str:
    """Read latest '2FA code (dev, SMTP off) for <email> [purpose]: NNNNNN' line."""
    time.sleep(0.6)  # give BackgroundTasks a moment
    try:
        out = subprocess.check_output(
            ["grep", "-a", "2FA code (dev", BACKEND_LOG], stderr=subprocess.DEVNULL
        ).decode()
    except subprocess.CalledProcessError:
        return ""
    lines = [ln for ln in out.strip().splitlines()
             if email.lower() in ln.lower() and f"[{purpose}]" in ln]
    if not lines:
        return ""
    m = re.search(r":\s*(\d{6})\s*$", lines[-1])
    return m.group(1) if m else ""


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- Registration returns JWT directly + two_fa_enabled=True ----------
class TestRegistration:
    def test_register_auto_enables_2fa_and_returns_token(self, s):
        email = f"twofa_reg_{uuid.uuid4().hex[:8]}@test.com"
        r = s.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "Passw0rd123", "full_name": "Twofa Reg"
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 20
        assert data.get("user", {}).get("two_fa_enabled") is True
        assert data["user"]["email"] == email


# ---------- Login with 2FA ON ----------
class TestLoginFlow:
    email = "twofa1@test.com"
    pw = "Passw0rd123"

    def test_login_returns_requires_2fa_and_no_token(self, s):
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": self.email, "password": self.pw})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("requires_2fa") is True
        assert "pending_token" in d and d["pending_token"]
        assert "token" not in d or not d.get("token")
        assert "*" in d.get("email", "")
        # code should appear in logs
        code = _latest_code_from_logs(self.email, "login")
        assert re.fullmatch(r"\d{6}", code), f"expected 6-digit code in logs, got {code!r}"

    def test_verify_wrong_code_400(self, s):
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": self.email, "password": self.pw})
        pending = r.json()["pending_token"]
        r2 = s.post(f"{BASE_URL}/api/auth/2fa/verify", json={"pending_token": pending, "code": "000000"})
        assert r2.status_code == 400
        assert "Invalid authentication code" in r2.text

    def test_verify_right_code_returns_token_and_cookie(self, s):
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": self.email, "password": self.pw})
        pending = r.json()["pending_token"]
        code = _latest_code_from_logs(self.email, "login")
        assert code, "no code in logs"
        sess = requests.Session()
        r2 = sess.post(f"{BASE_URL}/api/auth/2fa/verify", json={"pending_token": pending, "code": code})
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert "token" in d and d["token"]
        assert d["user"]["email"] == self.email
        # cookie set
        assert any(c.name in ("access_token", "token", "bfg_session") for c in sess.cookies), \
            f"no auth cookie found; got: {[c.name for c in sess.cookies]}"

        # Reusing same code should fail
        r3 = requests.post(f"{BASE_URL}/api/auth/2fa/verify",
                           json={"pending_token": pending, "code": code})
        assert r3.status_code == 400, r3.text

    def test_max_attempts_locks_code(self, s):
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": self.email, "password": self.pw})
        pending = r.json()["pending_token"]
        # 5 wrong attempts; 6th should be 429
        last_status = None
        for i in range(6):
            resp = s.post(f"{BASE_URL}/api/auth/2fa/verify",
                          json={"pending_token": pending, "code": "111111"})
            last_status = resp.status_code
        assert last_status == 429, f"expected 429 after >5 attempts, got {last_status}"


class TestResendThrottle:
    email = "selftest2@test.com"
    pw = "Passw0rd123"

    def test_resend_throttle(self, s):
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": self.email, "password": self.pw})
        assert r.status_code == 200
        pending = r.json()["pending_token"]
        # Immediately after login, resend should be throttled (login just issued a code)
        r_early = s.post(f"{BASE_URL}/api/auth/2fa/resend", json={"pending_token": pending})
        assert r_early.status_code == 429, r_early.text
        # Wait past throttle window, then resend should succeed
        time.sleep(31)
        r1 = s.post(f"{BASE_URL}/api/auth/2fa/resend", json={"pending_token": pending})
        assert r1.status_code == 200, r1.text
        # Immediate 2nd resend should be throttled again
        r2 = s.post(f"{BASE_URL}/api/auth/2fa/resend", json={"pending_token": pending})
        assert r2.status_code == 429, r2.text


# ---------- Toggle 2FA off / on ----------
class TestToggleFlow:
    """Uses a fresh user so we can flip 2FA without affecting shared accounts."""

    @pytest.fixture(scope="class")
    def user(self, s):
        email = f"twofa_toggle_{uuid.uuid4().hex[:8]}@test.com"
        pw = "Passw0rd123"
        r = s.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": pw, "full_name": "Toggle User"
        })
        assert r.status_code == 200, r.text
        token = r.json()["token"]
        return {"email": email, "pw": pw, "token": token}

    def _bearer(self, token):
        sess = requests.Session()
        sess.headers.update({"Content-Type": "application/json",
                             "Authorization": f"Bearer {token}"})
        return sess

    def test_full_toggle_off_and_login_bypass_2fa(self, s, user):
        api = self._bearer(user["token"])
        # Request toggle
        r = api.post(f"{BASE_URL}/api/auth/2fa/request-toggle")
        assert r.status_code == 200, r.text
        assert r.json().get("action") == "disable"
        code = _latest_code_from_logs(user["email"], "toggle")
        assert re.fullmatch(r"\d{6}", code), f"toggle code missing: {code!r}"
        r2 = api.post(f"{BASE_URL}/api/auth/2fa/confirm-toggle", json={"code": code})
        assert r2.status_code == 200, r2.text
        assert r2.json().get("two_fa_enabled") is False

        # Login now returns token directly
        r3 = s.post(f"{BASE_URL}/api/auth/login",
                    json={"email": user["email"], "password": user["pw"]})
        assert r3.status_code == 200, r3.text
        d3 = r3.json()
        assert d3.get("requires_2fa") in (None, False)
        assert d3.get("token")
        user["token"] = d3["token"]

    def test_re_enable_toggle_requires_code_then_login_needs_2fa(self, s, user):
        api = self._bearer(user["token"])
        r = api.post(f"{BASE_URL}/api/auth/2fa/request-toggle")
        assert r.status_code == 200, r.text
        assert r.json().get("action") == "enable"
        code = _latest_code_from_logs(user["email"], "toggle")
        assert re.fullmatch(r"\d{6}", code)
        r2 = api.post(f"{BASE_URL}/api/auth/2fa/confirm-toggle", json={"code": code})
        assert r2.status_code == 200
        assert r2.json().get("two_fa_enabled") is True

        r3 = s.post(f"{BASE_URL}/api/auth/login",
                    json={"email": user["email"], "password": user["pw"]})
        assert r3.status_code == 200
        assert r3.json().get("requires_2fa") is True
