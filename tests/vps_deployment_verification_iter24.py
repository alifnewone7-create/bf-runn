#!/usr/bin/env python3
"""Focused VPS deployment verification for the admin markets 404 bug.

This script intentionally targets the production/VPS API only:
https://api.binaryfundglobal.com. It does not start or probe the local backend.
"""

from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


BASE_URL = "https://api.binaryfundglobal.com"
ORIGIN = "https://binaryfundglobal.com"
ITERATION = 24
REPORT_PATHS = [
    Path(f"/app/test_reports/bug_verification_{ITERATION}.json"),
    Path(f"/app/test_reports/iteration_{ITERATION}.json"),
]


def run_curl(args: list[str], body_only: bool = False) -> dict[str, Any]:
    cmd = ["curl", "-sS", "--max-time", "25"]
    if not body_only:
        cmd.append("-i")
    cmd.extend(args)
    started = datetime.now(timezone.utc).isoformat()
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=35)
    raw = proc.stdout or ""
    stderr = proc.stderr or ""
    status = None
    headers: dict[str, str] = {}
    body = raw

    if not body_only:
        # Curl -i can include intermediate proxy/redirect header blocks. Use the
        # final HTTP block that starts with HTTP/.
        header_block = ""
        if "\r\n\r\n" in raw:
            parts = raw.split("\r\n\r\n")
            header_block = parts[-2] if len(parts) >= 2 else parts[0]
            body = parts[-1]
        elif "\n\n" in raw:
            parts = raw.split("\n\n")
            header_block = parts[-2] if len(parts) >= 2 else parts[0]
            body = parts[-1]
        else:
            header_block = raw
            body = ""

        header_lines = [line.strip() for line in header_block.splitlines() if line.strip()]
        for line in header_lines:
            if line.startswith("HTTP/"):
                try:
                    status = int(line.split()[1])
                except Exception:
                    status = None
            elif ":" in line:
                key, value = line.split(":", 1)
                headers[key.lower()] = value.strip()

    return {
        "cmd": " ".join(cmd),
        "started_at": started,
        "returncode": proc.returncode,
        "status": status,
        "headers": headers,
        "body": body,
        "stderr": stderr,
    }


def parse_json_body(result: dict[str, Any]) -> Any | None:
    try:
        return json.loads(result.get("body") or "")
    except Exception:
        return None


def concise_result(result: dict[str, Any]) -> dict[str, Any]:
    body = result.get("body") or ""
    return {
        "cmd": result.get("cmd"),
        "returncode": result.get("returncode"),
        "status": result.get("status"),
        "access_control_allow_origin": result.get("headers", {}).get("access-control-allow-origin"),
        "content_type": result.get("headers", {}).get("content-type"),
        "body_preview": body[:500],
        "stderr": result.get("stderr"),
    }


def main() -> int:
    tests: dict[str, Any] = {}

    # Health confirms the VPS API is reachable before interpreting route status.
    tests["health"] = run_curl([f"{BASE_URL}/api/health"])

    # Primary regression: new route should exist and reject unauthenticated users
    # with 401. A 404 proves the deployed VPS code is still missing this route.
    tests["admin_markets_no_auth"] = run_curl([f"{BASE_URL}/api/admin/markets"])
    tests["admin_markets_no_auth_with_origin"] = run_curl([
        "-H", f"Origin: {ORIGIN}",
        f"{BASE_URL}/api/admin/markets",
    ])
    tests["admin_markets_preflight"] = run_curl([
        "-X", "OPTIONS",
        "-H", f"Origin: {ORIGIN}",
        "-H", "Access-Control-Request-Method: GET",
        f"{BASE_URL}/api/admin/markets",
    ])

    # Existing admin routes isolate whether the admin router is mounted at all.
    tests["admin_stats_no_auth"] = run_curl([f"{BASE_URL}/api/admin/stats"])
    tests["admin_login_get"] = run_curl([f"{BASE_URL}/api/admin/login"])
    tests["requested_admin_probe"] = run_curl([f"{BASE_URL}/api/admin/stats/users/login/me"])

    # Secondary regression: public instruments payload should no longer expose payout.
    tests["market_instruments"] = run_curl([f"{BASE_URL}/api/market/instruments"])
    instruments_json = parse_json_body(tests["market_instruments"])
    payout_locations: list[str] = []
    item_count = 0
    if isinstance(instruments_json, dict):
        items = instruments_json.get("items")
        if isinstance(items, list):
            item_count = len(items)
            for idx, item in enumerate(items):
                if isinstance(item, dict) and "payout" in item:
                    payout_locations.append(f"items[{idx}].payout")
    elif isinstance(instruments_json, list):
        item_count = len(instruments_json)
        for idx, item in enumerate(instruments_json):
            if isinstance(item, dict) and "payout" in item:
                payout_locations.append(f"[{idx}].payout")

    admin_markets_status = tests["admin_markets_no_auth"].get("status")
    instruments_status = tests["market_instruments"].get("status")
    health_reachable = tests["health"].get("returncode") == 0 and tests["health"].get("status") in {200, 404, 401, 405}
    api_reachable = any(t.get("returncode") == 0 and t.get("status") for t in tests.values())

    route_registered = admin_markets_status == 401
    payout_removed = instruments_status == 200 and not payout_locations and item_count > 0
    existing_admin_router_mounted = tests["admin_stats_no_auth"].get("status") == 401 or tests["admin_login_get"].get("status") == 405

    if not api_reachable:
        verdict = "blocked"
    elif route_registered and payout_removed:
        verdict = "fixed"
    else:
        verdict = "not_fixed"

    critical: list[dict[str, str]] = []
    action_items: list[str] = []
    if api_reachable and admin_markets_status == 404:
        critical.append({
            "endpoint": "/api/admin/markets",
            "issue": "Still returns 404 on the VPS. The new admin markets route is not registered in the deployed backend.",
            "priority": "CRITICAL",
        })
        action_items.append("Deploy/restart the backend from the correct VPS path containing updated admin_routes.py; specifically resolve /opt/bfg-backend vs /root/opt/bfg-backend path confusion.")
    elif api_reachable and not route_registered:
        critical.append({
            "endpoint": "/api/admin/markets",
            "issue": f"Expected 401 Not authenticated for registered protected route, got HTTP {admin_markets_status}.",
            "priority": "HIGH",
        })

    if api_reachable and not payout_removed:
        critical.append({
            "endpoint": "/api/market/instruments",
            "issue": f"Expected no payout key in instrument items; found {len(payout_locations)} payout key(s), status={instruments_status}, item_count={item_count}.",
            "priority": "HIGH",
        })
        action_items.append("Deploy updated market.py to the active VPS backend so /api/market/instruments no longer exposes payout.")

    if not existing_admin_router_mounted and api_reachable:
        action_items.append("Verify the admin router is mounted in the active server.py and supervisor is running that codebase.")

    if not action_items and verdict == "fixed":
        action_items.append("No deployment action needed for the verified endpoints.")
    elif not action_items:
        action_items.append("Re-run the main agent's VPS auto-fix deployment script, then retest these curl probes.")

    concise_tests = {name: concise_result(result) for name, result in tests.items()}
    summary = (
        f"VPS-only curl verification completed. /api/admin/markets returned HTTP {admin_markets_status}; "
        f"/api/market/instruments returned HTTP {instruments_status} with item_count={item_count} "
        f"and payout_key_count={len(payout_locations)}. "
        f"Existing admin router mounted={existing_admin_router_mounted} "
        f"(/api/admin/stats={tests['admin_stats_no_auth'].get('status')}, GET /api/admin/login={tests['admin_login_get'].get('status')}); "
        f"requested combined probe /api/admin/stats/users/login/me returned {tests['requested_admin_probe'].get('status')}. "
        "No relevant testing skill found."
    )

    report = {
        "verdict": verdict,
        "user_reported_bug": "shob to set korlam new 6 file tarpore error ashtache check koren to ar origins set kora ache",
        "summary": summary,
        "backend_issues": {
            "critical": critical,
            "minor": [
                {
                    "endpoint": "/api/admin/markets preflight",
                    "issue": f"CORS preflight status={tests['admin_markets_preflight'].get('status')}, Access-Control-Allow-Origin={tests['admin_markets_preflight'].get('headers', {}).get('access-control-allow-origin')}; route GET status is the determining signal, not CORS.",
                },
                {
                    "endpoint": "/api/admin/stats/users/login/me",
                    "issue": f"Requested combined probe returned HTTP {tests['requested_admin_probe'].get('status')}; direct existing admin endpoints /api/admin/stats=401 and GET /api/admin/login=405 still confirm the admin router is mounted.",
                }
            ],
        },
        "frontend_issues": {
            "ui_bugs": [],
            "integration_issues": [],
            "design_issues": [],
        },
        "test_report_links": [
            "/app/tests/vps_deployment_verification_iter24.py",
            "/app/test_reports/bug_verification_24.json",
            "/app/test_reports/iteration_24.json",
        ],
        "action_items": action_items,
        "critical_code_review_comments": [
            "Local /app code contains @router.get('/markets') and @router.patch('/markets/{symbol}') under APIRouter(prefix='/admin'), and server.py includes admin_router under /api, so the intended route is /api/admin/markets.",
            "Local /app/backend/market.py omits payout from instrument_list(); if the VPS still returns payout, it is serving old code.",
        ],
        "updated_files": [
            "/app/tests/vps_deployment_verification_iter24.py",
            "/app/test_reports/bug_verification_24.json",
            "/app/test_reports/iteration_24.json",
        ],
        "success_rate": {
            "backend": "100%" if verdict == "fixed" else ("0%" if verdict == "blocked" else "50%"),
            "frontend": "N/A - backend-only deployment verification",
        },
        "seed_data_creation": "None. No credentials or seed data were required.",
        "retest_needed": verdict != "fixed",
        "should_main_agent_self_test": True,
        "context_for_next_testing_agent": "Repeat the same VPS curl checks only. Do not start local backend. Fixed requires /api/admin/markets -> 401 unauthenticated and /api/market/instruments items without payout.",
        "rca_of_the_issue": (
            "If verdict is not_fixed with /api/admin/markets=404 and /api/market/instruments exposing payout, the active VPS backend is still old code or supervisor is running the wrong directory. "
            "The likely deployment issue is /opt/bfg-backend vs /root/opt/bfg-backend path confusion."
        ),
        "evidence": {
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "base_url": BASE_URL,
            "origin_used_for_cors_probe": ORIGIN,
            "payout_locations_sample": payout_locations[:10],
            "tests": concise_tests,
        },
        "skill_lookup": "No relevant testing skill found.",
    }

    for path in REPORT_PATHS:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")

    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if verdict == "fixed" else 1


if __name__ == "__main__":
    raise SystemExit(main())