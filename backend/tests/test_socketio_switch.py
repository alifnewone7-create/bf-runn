"""Test symbol switching via subscribe event."""
import asyncio, os, socketio, msgpack

REMOTE_URL = "https://api.binaryfundglobal.com"
TOKEN = os.environ.get("BFG_TEST_TOKEN")

async def run():
    sio = socketio.AsyncClient()
    ticks = []

    @sio.on("quotes/stream")
    async def on_stream(data):
        m = msgpack.unpackb(data, raw=False) if isinstance(data, (bytes, bytearray)) else data
        ticks.append(m)

    await sio.connect(REMOTE_URL, socketio_path="/api/socket.io/", transports=["websocket"], auth={"token": TOKEN})
    print(f"connected sid={sio.sid}")

    await sio.emit("subscribe", "EURUSD_OTC")
    await asyncio.sleep(4)
    phase1 = [t for t in ticks if isinstance(t, dict)]
    p1_syms = set(t.get("symbol") for t in phase1)
    print(f"Phase1 (EURUSD_OTC subscribed): got {len(phase1)} ticks, symbols={p1_syms}")

    ticks.clear()
    await sio.emit("subscribe", "GBPUSD_OTC")
    print("Switched to GBPUSD_OTC")
    await asyncio.sleep(4)
    phase2 = [t for t in ticks if isinstance(t, dict)]
    p2_syms = set(t.get("symbol") for t in phase2)
    print(f"Phase2 (GBPUSD_OTC subscribed): got {len(phase2)} ticks, symbols={p2_syms}")

    await sio.disconnect()

    assert "EURUSD_OTC" in p1_syms, "Phase1 should have EURUSD_OTC ticks"
    assert "GBPUSD_OTC" in p2_syms, "Phase2 should have GBPUSD_OTC ticks"
    print("[PASS] Symbol switching works")

asyncio.run(run())
