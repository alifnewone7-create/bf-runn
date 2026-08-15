"""
Static/simulation tests for /app/backend/deploy/vps_deploy_bundle.sh

This bundle script embeds 7 backend source files as base64 blobs and is meant
to run inside the remote VPS. Since we can't SSH there, we simulate the run
locally by:
  * setting APP_DIR to a scratch temp dir
  * shimming systemctl/chown/curl to no-ops
  * asserting the extracted files match /app/backend originals byte-for-byte
  * asserting each extracted file is valid Python (ast.parse)
  * asserting backup dir is produced when prior copies exist
  * asserting the mkdir/cp backup path is tolerant when no prior copies exist
"""

import ast
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

SCRIPT = Path("/app/backend/deploy/vps_deploy_bundle.sh")
SOURCE_ROOT = Path("/app/backend")

# Relative paths (relative to APP_DIR) that the script must materialise
TARGETS = [
    "market.py",
    "models.py",
    "seed.py",
    "routes/market_routes.py",
    "routes/auth_routes.py",
    "routes/trade_routes.py",
    "routes/sio_hub.py",
]


def _run_bundle(app_dir: Path) -> subprocess.CompletedProcess:
    """
    Run vps_deploy_bundle.sh with APP_DIR overridden and dangerous side-effects
    (systemctl, chown, curl) shimmed to no-ops via a wrapper stub dir prepended
    to PATH.
    """
    stub_dir = app_dir / "_stubs"
    stub_dir.mkdir(exist_ok=True)
    for name in ("systemctl", "chown", "curl"):
        p = stub_dir / name
        p.write_text("#!/usr/bin/env bash\nexit 0\n")
        p.chmod(0o755)

    env = os.environ.copy()
    env["APP_DIR"] = str(app_dir)
    env["PATH"] = f"{stub_dir}:{env['PATH']}"

    return subprocess.run(
        ["bash", str(SCRIPT)],
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )


# --- Sanity checks ----------------------------------------------------------

def test_script_exists_and_syntax_ok():
    """`bash -n` on the bundle script must pass."""
    assert SCRIPT.is_file(), f"missing {SCRIPT}"
    r = subprocess.run(["bash", "-n", str(SCRIPT)], capture_output=True, text=True)
    assert r.returncode == 0, f"bash -n failed: {r.stderr}"


# --- Main extraction + shim run --------------------------------------------

@pytest.fixture(scope="module")
def extracted():
    """
    Run the bundle once against a scratch APP_DIR that already has stubs of
    the 7 target files so we also exercise the backup branch.
    """
    tmp = Path(tempfile.mkdtemp(prefix="bundle_test_"))
    (tmp / "routes").mkdir()
    # Pre-seed with dummy content to force the backup branch to fire.
    for rel in TARGETS:
        f = tmp / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(f"# stale placeholder for {rel}\n")

    result = _run_bundle(tmp)
    yield tmp, result
    shutil.rmtree(tmp, ignore_errors=True)


def test_bundle_runs_without_no_such_file(extracted):
    tmp, r = extracted
    combined = (r.stdout or "") + "\n" + (r.stderr or "")
    assert r.returncode == 0, (
        f"bundle exited {r.returncode}\nSTDOUT:\n{r.stdout}\nSTDERR:\n{r.stderr}"
    )
    # The reported user bug: no 'No such file or directory' anywhere.
    assert "No such file or directory" not in combined, (
        f"'No such file or directory' surfaced during bundle run:\n{combined}"
    )


def test_all_seven_files_exist_and_nonempty(extracted):
    tmp, _ = extracted
    for rel in TARGETS:
        p = tmp / rel
        assert p.is_file(), f"missing after extraction: {rel}"
        assert p.stat().st_size > 0, f"empty after extraction: {rel}"


def test_all_seven_files_parse_as_python(extracted):
    tmp, _ = extracted
    for rel in TARGETS:
        src = (tmp / rel).read_text()
        try:
            ast.parse(src)
        except SyntaxError as e:
            pytest.fail(f"AST parse failed for {rel}: {e}")


def test_all_seven_files_byte_identical_to_source(extracted):
    """Base64 round-trip must produce byte-identical files vs /app/backend."""
    tmp, _ = extracted
    diffs = []
    for rel in TARGETS:
        extracted_bytes = (tmp / rel).read_bytes()
        source_bytes = (SOURCE_ROOT / rel).read_bytes()
        if extracted_bytes != source_bytes:
            diffs.append(
                f"{rel}: extracted={len(extracted_bytes)}B "
                f"source={len(source_bytes)}B"
            )
    assert not diffs, "byte-mismatch after base64 round-trip:\n" + "\n".join(diffs)


def test_backup_dir_created_with_prior_files(extracted):
    tmp, r = extracted
    backups = list(tmp.glob(".backup_*"))
    assert backups, (
        "Expected a .backup_<stamp> directory when prior files existed.\n"
        f"stdout: {r.stdout}"
    )
    bdir = backups[0]
    # Every pre-existing stub should have been copied.
    for rel in TARGETS:
        b = bdir / rel
        assert b.is_file(), f"backup missing for {rel} in {bdir}"
        assert "stale placeholder" in b.read_text(), (
            f"backup content unexpected for {rel}: "
            f"{b.read_text()[:80]!r}"
        )


# --- Fresh-install branch (no prior files) ---------------------------------

def test_bundle_tolerates_missing_prior_files():
    """
    The `[ -f "$f" ] && cp ... || true` guard must let the script complete
    even when none of the 7 targets pre-exist.
    """
    tmp = Path(tempfile.mkdtemp(prefix="bundle_fresh_"))
    try:
        # Do NOT pre-create routes/ — the script itself does `mkdir -p routes`.
        r = _run_bundle(tmp)
        combined = (r.stdout or "") + "\n" + (r.stderr or "")
        assert r.returncode == 0, (
            f"fresh install failed: rc={r.returncode}\n"
            f"STDOUT:\n{r.stdout}\nSTDERR:\n{r.stderr}"
        )
        assert "No such file or directory" not in combined, (
            f"unexpected 'No such file' on fresh install:\n{combined}"
        )
        for rel in TARGETS:
            assert (tmp / rel).is_file(), f"missing on fresh install: {rel}"
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
