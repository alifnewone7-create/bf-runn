import asyncio, msgpack, socketio

async def main():
    sio = socketio.AsyncClient()
    ticks = []

    @sio.event
    async def connect():
        print("connected")
        await sio.emit("subscribe", "EURUSD_OTC")

    @sio.on("quotes/stream")
    async def on_tick(data):
        ticks.append(msgpack.unpackb(data, raw=False))

    await sio.connect("https://api.binaryfundglobal.com", socketio_path="/api/socket.io/", transports=["websocket"])
    await asyncio.sleep(8)
    print("ticks received:", len(ticks))
    for t in ticks[:3]:
        print(t)
    await sio.disconnect()

asyncio.run(main())
