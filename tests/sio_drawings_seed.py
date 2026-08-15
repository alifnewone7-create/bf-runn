"""Seed one server-side drawing for a symbol (used to verify client refetch)."""
import sys
import time
import uuid

import requests
import socketio
from dotenv import dotenv_values

env = dotenv_values("/app/frontend/.env")
API = (env.get("REACT_APP_API_BASE") or "").rstrip("/")
SYM = sys.argv[1] if len(sys.argv) > 1 else "USDJPY_OTC"

r = requests.post(f"{API}/api/auth/login", json={"email": "nepoca@hamham.uk", "password": "12345678"}, timeout=30)
token = r.json().get("access_token") or r.json().get("token")
sio = socketio.Client()
sio.connect(API, socketio_path="/api/socket.io/", transports=["websocket"], auth={"token": token})

did = str(uuid.uuid4())
now = int(time.time()) // 60 * 60
sio.emit("drawings/save", {"drawing": {
    "id": did, "symbol": SYM, "tool": "horizontal_line",
    "points": [{"t": now - 600, "p": 150.5}],
    "color": "#22d3ee", "width": 3, "style": "dashed", "visible": True,
}})
sio.sleep(1.5)
resp = sio.call("drawings/get", {"symbol": SYM}, timeout=10)
print("seeded id:", did, "server count:", len((resp or {}).get("drawings", [])))
sio.disconnect()
