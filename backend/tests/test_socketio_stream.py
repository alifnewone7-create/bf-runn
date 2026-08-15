"""
Socket.IO live tick stream test against the REMOTE VPS backend.
Verifies:
  - connect via websocket transport at path /api/socket.io/
  - subscribe emit for a symbol
  - receive `quotes/stream` binary msgpack ticks
  - decode msgpack payload to {symbol, price, t}
"""
import asyncio
import os
import socketio
import msgpack

REMOTE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://api.binaryfundglobal.com")
TOKEN = os.environ.get("BFG_TEST_TOKEN")
SYMBOL = "EURUSD_OTC"


async def run():
    sio = socketio.AsyncClient(logger=False, engineio_logger=False)
    ticks_received = []

    @sio.event
    async def connect():
        print(f"[OK] Socket.IO connected, sid={sio.sid}")
        await sio.emit("subscribe", SYMBOL)
        print(f"[OK] Emitted subscribe({SYMBOL})")

    @sio.event
    async def connect_error(data):
        print(f"[FAIL] connect_error: {data}")

    @sio.event
    async def disconnect():
        print("[INFO] Disconnected")

    @sio.on("quotes/stream")
    async def on_stream(data):
        # binary msgpack payload
        try:
            if isinstance(data, (bytes, bytearray)):
                m = msgpack.unpackb(data, raw=False)
            else:
                m = data
            ticks_received.append(m)
            if len(ticks_received) <= 5:
                print(f"[TICK] {m}")
        except Exception as e:
            print(f"[WARN] msgpack decode error: {e}, type={type(data)}")

    @sio.on("depth/change")
    async def on_depth(data):
        try:
            if isinstance(data, (bytes, bytearray)):
                m = msgpack.unpackb(data, raw=False)
                print(f"[DEPTH] snapshot with {len(m.get('book', {}))} symbols")
        except Exception as e:
            print(f"[WARN] depth decode error: {e}")

    try:
        auth = {"token": TOKEN} if TOKEN else {}
        await sio.connect(
            REMOTE_URL,
            socketio_path="/api/socket.io/",
            transports=["websocket"],
            auth=auth,
            wait_timeout=10,
        )
        # Listen for ~10 seconds
        await asyncio.sleep(10)
        await sio.disconnect()
    except Exception as e:
        print(f"[FAIL] Exception: {e}")

    print(f"\n=== SUMMARY ===")
    print(f"Total quotes/stream ticks received: {len(ticks_received)}")
    if ticks_received:
        symbols = set(t.get("symbol") for t in ticks_received if isinstance(t, dict))
        print(f"Symbols in ticks: {symbols}")
        prices = [t.get("price") for t in ticks_received if isinstance(t, dict) and t.get("symbol") == SYMBOL]
        print(f"{SYMBOL} price samples: {prices[:8]}")
        assert any(isinstance(t, dict) and t.get("symbol") == SYMBOL for t in ticks_received), "No ticks for subscribed symbol"
        print("[PASS] Received ticks for subscribed symbol")
    else:
        print("[FAIL] No ticks received in 10s window")


if __name__ == "__main__":
    asyncio.run(run())
