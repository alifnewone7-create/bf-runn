"""Reproduce VPS "server error" on trade/place with clientTickT.

Registers a fresh trader on the VPS, opens a Socket.IO connection to
/api/socket.io/, and emits `trade/place` twice — once WITH clientTickT and
once WITHOUT — to prove the deployed market.py lacks price_at and therefore
the trade_routes.py fix must be deployed.
"""
import asyncio
import json
import time
import uuid
import urllib.request

import socketio

VPS = "https://api.binaryfundglobal.com"


def register() -> tuple[str, dict]:
    email = f"qa+iter60-{uuid.uuid4().hex[:8]}@example.com"
    body = json.dumps({
        "email": email,
        "password": "Test@12345",
        "full_name": "QA Iter60",
        "country": "Bangladesh",
    }).encode()
    req = urllib.request.Request(
        f"{VPS}/api/auth/register",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read())
    return data["token"], data.get("user", {})


async def emit_place(sio: socketio.AsyncClient, payload: dict) -> dict:
    fut = asyncio.get_event_loop().create_future()

    def _cb(ack):
        if not fut.done():
            fut.set_result(ack)

    await sio.emit("trade/place", payload, callback=_cb)
    try:
        return await asyncio.wait_for(fut, timeout=15)
    except asyncio.TimeoutError:
        return {"error": "TIMEOUT waiting for ack"}


async def main():
    token, user = register()
    print(f"Registered: {user.get('email')}  token_len={len(token)}")

    sio = socketio.AsyncClient(logger=False, engineio_logger=False)

    @sio.event
    async def connect():
        print("SIO connected")

    @sio.event
    async def disconnect():
        print("SIO disconnected")

    await sio.connect(
        VPS,
        socketio_path="/api/socket.io/",
        transports=["websocket"],
        auth={"token": token},
        wait_timeout=15,
    )
    await asyncio.sleep(1.5)  # let server side wire up

    base = {
        "symbol": "EURUSD_OTC",
        "direction": "higher",
        "amount": 1,
        "duration": 60,
        "optionType": 100,
        "isDemo": 1,
        "requestId": int(time.time() * 1000),
    }

    print("\n--- Emit WITH clientTickT (expected today: 'server error') ---")
    with_t = dict(base, clientTickT=time.time(), requestId=base["requestId"])
    ack1 = await emit_place(sio, with_t)
    print("ACK (with clientTickT):", json.dumps(ack1)[:400])

    await asyncio.sleep(1.0)

    print("\n--- Emit WITHOUT clientTickT (expected: success) ---")
    without_t = dict(base, requestId=base["requestId"] + 1)
    ack2 = await emit_place(sio, without_t)
    print("ACK (without clientTickT):", json.dumps(ack2)[:400])

    await sio.disconnect()

    # Summary + verdict
    err1 = isinstance(ack1, dict) and ack1.get("error")
    ok2 = isinstance(ack2, dict) and (ack2.get("trade") or ack2.get("ok") or not ack2.get("error"))
    print("\nSUMMARY")
    print(f"  with clientTickT => error={err1!r}")
    print(f"  without clientTickT => success={ok2!r}")
    if err1 and ok2:
        print("VERDICT: Reproduced — VPS still runs OLD market.py (no price_at). Fix must be deployed.")
    elif not err1 and ok2:
        print("VERDICT: VPS already deployed the fix — both paths work.")
    else:
        print("VERDICT: Unexpected ack shapes, inspect above.")


if __name__ == "__main__":
    asyncio.run(main())
