#!/usr/bin/env python3
"""Focused VPS deployment verification for admin markets rollout.

This script intentionally hits the production/VPS API directly. It does not
start or use the local backend.
"""

import json
import sys
import urllib.error
import urllib.request
from typing import Any


BASE = "https://api.binaryfundglobal.com"


def request(method: str, path: str, body: dict[str, Any] | None = None, headers: dict[str, str] | None = None) -> dict[str, Any]:
    url = f"{BASE}{path}"
    data = None
    req_headers = {"Accept": "application/json", "User-Agent": "bug-verification-iter23"}
    if headers:
        req_headers.update(headers)
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        req_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return {
                "method": method,
                "path": path,
                "status": resp.status,
                "headers": dict(resp.headers),
                "body_text": raw,
                "json": _parse_json(raw),
            }
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        return {
            "method": method,
            "path": path,
            "status": e.code,
            "headers": dict(e.headers),
            "body_text": raw,
            "json": _parse_json(raw),
        }


def _parse_json(raw: str) -> Any:
    try:
        return json.loads(raw) if raw else None
    except json.JSONDecodeError:
        return None


def contains_key(obj: Any, key: str) -> bool:
    if isinstance(obj, dict):
        return key in obj or any(contains_key(v, key) for v in obj.values())
    if isinstance(obj, list):
        return any(contains_key(item, key) for item in obj)
    return False


def main() -> int:
    probes = []
    for method, path, body, headers in [
        ("GET", "/api/health", None, None),
        ("GET", "/api/admin/markets", None, None),
        ("GET", "/api/admin/stats", None, None),
        ("GET", "/api/admin/users", None, None),
        ("GET", "/api/admin/me", None, None),
        ("GET", "/api/admin/login", None, None),
        ("POST", "/api/admin/login", {"email": "notadmin@example.com", "password": "wrong-password"}, None),
        ("GET", "/api/market/instruments", None, None),
        (
            "OPTIONS",
            "/api/admin/markets",
            None,
            {
                "Origin": "https://binaryfundglobal.com",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        ),
    ]:
        result = request(method, path, body=body, headers=headers)
        probes.append(result)
        print(f"{method:7} {path:28} -> {result['status']}")
        if result["body_text"]:
            print(f"  body: {result['body_text'][:240]}")
        if method == "OPTIONS":
            print(f"  access-control-allow-origin: {result['headers'].get('access-control-allow-origin')}")

    admin_markets = next(p for p in probes if p["method"] == "GET" and p["path"] == "/api/admin/markets")
    instruments = next(p for p in probes if p["method"] == "GET" and p["path"] == "/api/market/instruments")
    existing_admin = [
        p for p in probes
        if (p["path"] in {"/api/admin/stats", "/api/admin/users", "/api/admin/me", "/api/admin/login"})
    ]

    summary = {
        "admin_markets_route_exists_expected_401": admin_markets["status"] == 401,
        "admin_markets_returned_404": admin_markets["status"] == 404,
        "instruments_status": instruments["status"],
        "instruments_contains_plain_payout_key": contains_key(instruments.get("json"), "payout"),
        "existing_admin_routes_non_404": {f"{p['method']} {p['path']}": p["status"] != 404 for p in existing_admin},
    }
    print("\nSUMMARY")
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())