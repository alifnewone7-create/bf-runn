import json
import time

import requests
import socketio
from dotenv import dotenv_values

env = dotenv_values("/app/frontend/.env")
API = (env.get("REACT_APP_API_BASE") or "").rstrip("/")
token = requests.post(f"{API}/api/auth/login", json={"email": "nepoca@hamham.uk", "password": "12345678"}, timeout=30).json()["token"]
sio = socketio.Client()
sio.connect(API, socketio_path="/api/socket.io/", transports=["websocket"], auth={"token": token})

SYM = "EURUSD_OTC"
d = {
    "id": "aaaaaaaa-1111-2222-3333-444444444444",
    "symbol": SYM,
    "tool": "horizontal_line",
    "points": [{"t": 1786347360, "p": 1.0970632761}],
    "color": "#14b877", "width": 2, "style": "solid", "visible": True,
}

# 1) emit WITH an extra trailing None arg -> mirrors the browser frame 42["drawings/save",{...},null]
sio.emit("drawings/save", ({"drawing": d}, None))
time.sleep(1.5)
resp = sio.call("drawings/get", {"symbol": SYM}, timeout=10)
ids = [x["id"] for x in resp["drawings"]]
print("after save WITH trailing null, id present:", d["id"] in ids, "| ids:", ids)

# 2) emit normally (single arg)
sio.emit("drawings/save", {"drawing": d})
time.sleep(1.5)
resp = sio.call("drawings/get", {"symbol": SYM}, timeout=10)
ids = [x["id"] for x in resp["drawings"]]
print("after save WITHOUT trailing null, id present:", d["id"] in ids, "| ids:", ids)

# 3) delete with matching uuid (single arg)
sio.emit("drawings/delete", {"id": d["id"], "symbol": SYM})
time.sleep(1.2)
resp = sio.call("drawings/get", {"symbol": SYM}, timeout=10)
print("after delete, id present:", d["id"] in [x["id"] for x in resp["drawings"]])

# cleanup both symbols
for sym in ("EURUSD_OTC", "GBPUSD_OTC"):
    sio.emit("drawings/clear", {"symbol": sym})
time.sleep(1.5)
for sym in ("EURUSD_OTC", "GBPUSD_OTC"):
    print("final", sym, json.dumps(sio.call("drawings/get", {"symbol": sym}, timeout=10)))
sio.disconnect()
