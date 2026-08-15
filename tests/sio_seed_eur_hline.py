"""Seed a horizontal_line drawing on EURUSD_OTC at a visible price (mobile direct-edit test)."""
import sys
import time
import uuid

import requests
import socketio
from dotenv import dotenv_values

env = dotenv_values("/app/frontend/.env")
API = (env.get("REACT_APP_API_BASE") or "").rstrip("/")
SYM = sys.argv[1] if len(sys.argv) > 1 else "EURUSD_OTC"
PRICE = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0900

r = requests.post(f"{API}/api/auth/login", json={"email": "nepoca@hamham.uk", "password": "12345678"}, timeout=30)
token = r.json().get("access_token") or r.json().get("token")
sio = socketio.Client()
sio.connect(API, socketio_path="/api/socket.io/", transports=["websocket"], auth={"token": token})

did = str(uuid.uuid4())
now = int(time.time()) // 60 * 60
sio.emit("drawings/save", {"drawing": {
    "id": did, "symbol": SYM, "tool": "horizontal_line",
    "points": [{"t": now - 600, "p": PRICE}],
    "color": "#22d3ee", "width": 3, "style": "solid", "visible": True,
}})
sio.sleep(1.5)
resp = sio.call("drawings/get", {"symbol": SYM}, timeout=10)
print("seeded id:", did, "price:", PRICE, "server count:", len((resp or {}).get("drawings", [])))
sio.disconnect()
