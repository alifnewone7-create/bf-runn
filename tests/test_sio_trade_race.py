"""Direct python-socketio tests against VPS to reproduce the auth race.

Two scenarios:
  A) NEW backend behavior: connect WITHOUT handshake auth, immediately emit
     'trade/place' with a token in the payload. Expected on new backend:
     accepted (trade returned). On the OLD deployed backend, expected:
     'Not authenticated'.
  B) Handshake auth WITH token → 'trade/place' after 500ms. Should succeed on
     either backend (baseline sanity).
"""
import asyncio, json, sys, time
import socketio

VPS = "https://api.binaryfundglobal.com"

with open('/tmp/qauser.json') as f:
    U = json.load(f)
TOKEN = U['token']

async def place(sio_client, payload, timeout=8):
    fut = asyncio.get_event_loop().create_future()
    def cb(*args):
        if not fut.done():
            fut.set_result(args[0] if args else None)
    await sio_client.emit('trade/place', payload, callback=cb)
    try:
        return await asyncio.wait_for(fut, timeout=timeout)
    except asyncio.TimeoutError:
        return {'error': 'timeout'}

async def scenario_a():
    """No handshake auth; token only in trade payload (auth race)."""
    sio = socketio.AsyncClient()
    await sio.connect(VPS, socketio_path='/api/socket.io/', transports=['websocket'])
    # Immediately place trade (no explicit auth emit, no auth in handshake)
    payload = {
        'symbol':'EURUSD_OTC','direction':'higher','amount':1,'duration':5,
        'optionType':100,'isDemo':1,'requestId':111,'account':'demo','token':TOKEN,
    }
    ack = await place(sio, payload)
    await sio.disconnect()
    return ack

async def scenario_b():
    """Handshake auth + wait for background auth to bind."""
    sio = socketio.AsyncClient()
    await sio.connect(VPS, socketio_path='/api/socket.io/', transports=['websocket'],
                       auth={'token': TOKEN})
    await asyncio.sleep(1.0)  # let background auth run
    payload = {
        'symbol':'EURUSD_OTC','direction':'lower','amount':1,'duration':5,
        'optionType':100,'isDemo':1,'requestId':222,'account':'demo','token':TOKEN,
    }
    ack = await place(sio, payload)
    await sio.disconnect()
    return ack

async def scenario_c():
    """Handshake WITHOUT auth, then 'auth' emit, then trade."""
    sio = socketio.AsyncClient()
    await sio.connect(VPS, socketio_path='/api/socket.io/', transports=['websocket'])
    # emit auth manually
    fut = asyncio.get_event_loop().create_future()
    await sio.emit('auth', TOKEN, callback=lambda *a: fut.set_result(a[0] if a else None))
    auth_ack = await asyncio.wait_for(fut, timeout=5)
    payload = {
        'symbol':'EURUSD_OTC','direction':'higher','amount':1,'duration':5,
        'optionType':100,'isDemo':1,'requestId':333,'account':'demo',
    }
    ack = await place(sio, payload)
    await sio.disconnect()
    return {'auth_ack': auth_ack, 'trade_ack': ack}

async def main():
    print("=== Scenario A (no handshake auth, token in payload) ===")
    a = await scenario_a()
    print(json.dumps(a, default=str)[:600])
    print("=== Scenario B (handshake auth, then trade) ===")
    b = await scenario_b()
    print(json.dumps(b, default=str)[:600])
    print("=== Scenario C (no handshake, explicit auth emit, then trade) ===")
    c = await scenario_c()
    print(json.dumps(c, default=str)[:600])

asyncio.run(main())
