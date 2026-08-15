"""Tests for /app/backend/deploy/deploy_email.sh — verify embedded code + .env sanitation + health retry."""
import base64
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest
import requests

REPO = Path("/app/backend")
SCRIPT = REPO / "deploy" / "deploy_email.sh"
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")


def _extract_b64_blocks(script_text: str) -> dict:
    """Extract all `base64 -d > "<name>" << 'B64EOF' ... B64EOF` heredocs."""
    pattern = re.compile(
        r'base64 -d > "(?P<name>[^"]+)" << \'B64EOF\'\n(?P<body>.*?)\nB64EOF',
        re.DOTALL,
    )
    return {m.group("name"): m.group("body") for m in pattern.finditer(script_text)}


@pytest.fixture(scope="module")
def blocks():
    text = SCRIPT.read_text()
    b = _extract_b64_blocks(text)
    assert set(b.keys()) == {"emailer.py", "models.py", "seed.py", "routes/auth_routes.py", "routes/admin_routes.py"}, list(b.keys())
    return b


@pytest.mark.parametrize("name,src", [
    ("emailer.py", "emailer.py"),
    ("models.py", "models.py"),
    ("seed.py", "seed.py"),
    ("routes/auth_routes.py", "routes/auth_routes.py"),
    ("routes/admin_routes.py", "routes/admin_routes.py"),
])
def test_embedded_matches_source(blocks, name, src):
    decoded = base64.b64decode(blocks[name].encode())
    expected = (REPO / src).read_bytes()
    assert decoded == expected, f"{name} embedded copy differs from {src}"


def test_auth_routes_has_new_code(blocks):
    decoded = base64.b64decode(blocks["routes/auth_routes.py"].encode()).decode()
    assert "_generate_strong_password" in decoded
    assert "build_google_welcome_email" in decoded
    # Old gate must be gone
    assert "if user and user.password_hash:" not in decoded


def test_emailer_has_green_bg(blocks):
    decoded = base64.b64decode(blocks["emailer.py"].encode()).decode()
    assert "build_google_welcome_email" in decoded
    assert 'BG = "#e3f4e9"' in decoded
    assert 'BG = "#ffffff"' not in decoded


def test_bash_syntax():
    r = subprocess.run(["bash", "-n", str(SCRIPT)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr


def _make_stubs(stub_dir: Path, curl_exit: int = 0):
    stub_dir.mkdir(parents=True, exist_ok=True)
    for name in ("systemctl", "chown", "pkill", "journalctl"):
        p = stub_dir / name
        p.write_text("#!/bin/bash\nexit 0\n")
        p.chmod(0o755)
    curl = stub_dir / "curl"
    curl.write_text(f"#!/bin/bash\nexit {curl_exit}\n")
    curl.chmod(0o755)


def _make_app_dir(app_dir: Path):
    if app_dir.exists():
        shutil.rmtree(app_dir)
    (app_dir / "routes").mkdir(parents=True)
    env = (
        '"#===================================="\n'
        "DATABASE_URL=postgres://x\n"
        "FRONTEND_BASE_URL=https://binaryfundglobal.com\n"
        "EMAIL_LOGO_URL=https://binaryfundglobal.com/logo.png\n"
    )
    (app_dir / ".env").write_text(env)


def _run_script(app_dir: Path, stub_dir: Path):
    env = os.environ.copy()
    env["PATH"] = f"{stub_dir}:{env['PATH']}"
    env["APP_DIR"] = str(app_dir)
    return subprocess.run(
        ["bash", str(SCRIPT)], capture_output=True, text=True, env=env, timeout=120
    )


def test_deploy_simulation_success():
    app_dir = Path("/tmp/vps-sim-ok")
    stub_dir = Path("/tmp/stub-ok")
    _make_app_dir(app_dir)
    _make_stubs(stub_dir, curl_exit=0)

    r = _run_script(app_dir, stub_dir)
    assert r.returncode == 0, f"stdout:\n{r.stdout}\nstderr:\n{r.stderr}"

    env_text = (app_dir / ".env").read_text()
    # corrupt quoted line gone
    assert '"#=====' not in env_text
    assert not any(line.startswith('"') for line in env_text.splitlines())
    # FRONTEND_BASE_URL preserved (not overwritten to the emergent preview default)
    fb = [l for l in env_text.splitlines() if l.startswith("FRONTEND_BASE_URL=")]
    assert fb == ["FRONTEND_BASE_URL=https://binaryfundglobal.com"], fb
    # SMTP keys present exactly once
    for k in ("SMTP_HOST", "SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD",
              "SMTP_FROM_NAME", "SMTP_FROM_EMAIL", "SMTP_REPLY_TO"):
        matches = [l for l in env_text.splitlines() if l.startswith(f"{k}=")]
        assert len(matches) == 1, f"{k}: {matches}"

    # Files identical to sources
    for name in ("emailer.py", "models.py", "seed.py", "routes/auth_routes.py", "routes/admin_routes.py"):
        assert (app_dir / name).read_bytes() == (REPO / name).read_bytes(), name

    assert "HEALTH OK" in r.stdout


def test_deploy_simulation_health_failure_branch():
    app_dir = Path("/tmp/vps-sim-fail")
    stub_dir = Path("/tmp/stub-fail")
    _make_app_dir(app_dir)
    _make_stubs(stub_dir, curl_exit=1)  # curl always fails

    r = _run_script(app_dir, stub_dir)
    # Script should still exit 0 overall (retry loop; final echo)
    assert r.returncode == 0, f"stdout:\n{r.stdout}\nstderr:\n{r.stderr}"
    assert "HEALTH CHECK FAILED" in r.stdout
    assert "HEALTH OK" not in r.stdout


# ---------- Regression: local backend still healthy + login works ----------
def _backend_up() -> bool:
    try:
        return requests.get(f"{BASE_URL}/api/health", timeout=5).status_code == 200
    except Exception:
        return False


@pytest.mark.skipif(not _backend_up(), reason="Local backend unavailable in this container (postgres not installed).")
def test_local_backend_health():
    r = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert r.status_code == 200


@pytest.mark.skipif(not _backend_up(), reason="Local backend unavailable in this container (postgres not installed).")
def test_local_login_selftest_user():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "selftest2@test.com", "password": "Passw0rd123"},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    # With two step verification ON (default) login returns a pending token instead of the JWT.
    if data.get("requires_2fa"):
        assert data.get("pending_token")
    else:
        assert "token" in data and data["user"]["email"] == "selftest2@test.com"
