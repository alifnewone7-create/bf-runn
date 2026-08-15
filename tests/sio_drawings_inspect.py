import json

import requests
import socketio
from dotenv import dotenv_values

env = dotenv_values("/app/frontend/.env")
API = (env.get("REACT_APP_API_BASE") or "").rstrip("/")
token = requests.post(f"{API}/api/auth/login", json={"email": "nepoca@hamham.uk", "password": "12345678"}, timeout=30).json()["token"]

sio = socketio.Client()
sio.connect(API, socketio_path="/api/socket.io/", transports=["websocket"], auth={"token": token})

for sym in ("EURUSD_OTC", "GBPUSD_OTC"):
    resp = sio.call("drawings/get", {"symbol": sym}, timeout=10)
    print(sym, "->", json.dumps(resp)[:1200])

# replay the exact browser payload to inspect the ack / validation error
browser_payload = {
    "drawing": {
        "id": "350195aa-7409-4601-9e67-aae08102d3e6",
        "symbol": "EURUSD_OTC",
        "tool": "trend_line",
        "points": [
            {"t": 1786345980, "p": 1.1105150643776824},
            {"t": 1786347900, "p": 1.1025662804005723},
        ],
        "color": "#14b877",
        "width": 2,
        "style": "solid",
        "visible": True,
    }
}
print("replay save ->", json.dumps(sio.call("drawings/save", browser_payload, timeout=10))[:600])
print("get after replay ->", json.dumps(sio.call("drawings/get", {"symbol": "EURUSD_OTC"}, timeout=10))[:1500])
sio.disconnect()
