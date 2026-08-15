"""Dump (or clear) server-side drawings for one or more symbols.

Usage:
  python sio_drawings_dump.py EURUSD_OTC GBPUSD_OTC
  python sio_drawings_dump.py --clear EURUSD_OTC GBPUSD_OTC
"""
import json
import sys

import requests
import socketio
from dotenv import dotenv_values

env = dotenv_values("/app/frontend/.env")
API = (env.get("REACT_APP_API_BASE") or "").rstrip("/")
EMAIL = "nepoca@hamham.uk"
PASSWORD = "12345678"

args = [a for a in sys.argv[1:] if not a.startswith("--")]
DO_CLEAR = "--clear" in sys.argv
SYMBOLS = args or ["EURUSD_OTC"]

r = requests.post(f"{API}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
data = r.json()
token = data.get("access_token") or data.get("token")
assert token, data

sio = socketio.Client()
sio.connect(API, socketio_path="/api/socket.io/", transports=["websocket"], auth={"token": token})

for sym in SYMBOLS:
    if DO_CLEAR:
        sio.emit("drawings/clear", {"symbol": sym})
        sio.sleep(0.8)
    try:
        resp = sio.call("drawings/get", {"symbol": sym}, timeout=10)
    except Exception as exc:  # noqa: BLE001
        print(f"{sym}: ACK TIMEOUT {exc!r}")
        continue
    lst = (resp or {}).get("drawings", [])
    print(f"== {sym}: {len(lst)} drawing(s)")
    for d in lst:
        print("   ", json.dumps({k: d.get(k) for k in ("id", "tool", "color", "width", "style", "visible", "points")}))

sio.disconnect()
