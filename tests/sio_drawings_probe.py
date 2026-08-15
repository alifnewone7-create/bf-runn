import json
import os
import time

import requests
import socketio
from dotenv import dotenv_values

env = dotenv_values("/app/frontend/.env")
API = (env.get("REACT_APP_API_BASE") or "").rstrip("/")
EMAIL = "nepoca@hamham.uk"
PASSWORD = "12345678"

r = requests.post(f"{API}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
print("login status", r.status_code)
data = r.json()
token = data.get("access_token") or data.get("token") or (data.get("data") or {}).get("access_token")
print("token keys:", list(data.keys()))
assert token, data

sio = socketio.Client(logger=False, engineio_logger=False)


@sio.on("drawings/changed")
def on_changed(msg):
    print("PUSH drawings/changed:", json.dumps(msg)[:300])


sio.connect(API, socketio_path="/api/socket.io/", transports=["websocket"], auth={"token": token})
print("connected sid", sio.sid)

SYM = "EURUSD_OTC"


def call(event, payload):
    try:
        resp = sio.call(event, payload, timeout=10)
        print(f"{event} ->", json.dumps(resp)[:500] if resp is not None else "None")
        return resp
    except Exception as exc:  # noqa: BLE001
        print(f"{event} -> EXCEPTION {exc!r}")
        return None


call("drawings/get", {"symbol": SYM})

d = {
    "id": f"probe-{int(time.time())}",
    "symbol": SYM,
    "tool": "trend_line",
    "points": [{"t": 1750000000, "p": 1.09}, {"t": 1750003600, "p": 1.095}],
    "color": "#14b877",
    "width": 2,
    "style": "solid",
    "visible": True,
}
call("drawings/save", {"drawing": d})
time.sleep(1)
resp = call("drawings/get", {"symbol": SYM})
print("count after save:", len((resp or {}).get("drawings", [])) if isinstance(resp, dict) else "n/a")

call("drawings/delete", {"id": d["id"], "symbol": SYM})
time.sleep(0.6)
resp = call("drawings/get", {"symbol": SYM})
print("count after delete:", len((resp or {}).get("drawings", [])) if isinstance(resp, dict) else "n/a")

sio.disconnect()
