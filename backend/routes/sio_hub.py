"""Socket.IO hub — Quotex-style realtime market feed.

Events emitted to clients:
  - "quotes/stream"  (binary msgpack)  → per-symbol live tick, one packet per second
  - "depth/change"   (binary msgpack)  → simulated order book depth changes
  - "trade_closed"   (JSON)            → sent to user room when their order settles

Events received from clients:
  - "auth"       payload: token (str)             → binds sid to user_id
  - "subscribe"  payload: symbol (str)            → sets active symbol for this sid
"""
import asyncio
import logging
import time
import msgpack
import socketio

from database import SessionLocal
from auth import get_user_from_token
from market import engine

logger = logging.getLogger(__name__)

# ASGI Socket.IO server.
# - cors_allowed_origins="*" allows any browser origin (FastAPI CORS is separate).
# - always_connect=True means the connect handler cannot reject; we authenticate
#   asynchronously in a background task so a bad/expired token never causes 403.
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
    ping_interval=25,
    ping_timeout=20,
    always_connect=True,
)

# sid → {"symbol": str | None, "user_id": str | None}
_conns: dict[str, dict] = {}
_last_depth = 0.0


def _pack(payload: dict) -> bytes:
    """MessagePack-encode a payload (shows as 'Binary Message' in DevTools)."""
    return msgpack.packb(payload, use_bin_type=True)


def user_sids(user_id: str) -> list[str]:
    return [sid for sid, m in _conns.items() if m.get("user_id") == user_id]


async def _authenticate_sid(sid: str, token: str) -> None:
    """Best-effort background auth. Failures never abort the connection."""
    try:
        async with SessionLocal() as db:
            user = await get_user_from_token(token, db)
        if user and sid in _conns:
            _conns[sid]["user_id"] = str(user.id)
            await sio.enter_room(sid, f"user:{user.id}")
    except Exception as e:
        logger.warning(f"sio background auth failed for sid={sid}: {e}")


# ────────────────────────────────────────────────────────────────────────────
# Connection lifecycle
# ────────────────────────────────────────────────────────────────────────────
@sio.event
async def connect(sid, environ, auth):
    """Always accept. Auth runs in the background so handshake never blocks."""
    _conns[sid] = {"symbol": None, "user_id": None}
    token = None
    if isinstance(auth, dict):
        token = auth.get("token")
    if token:
        asyncio.create_task(_authenticate_sid(sid, token))
    return True


@sio.event
async def disconnect(sid):
    _conns.pop(sid, None)


# ────────────────────────────────────────────────────────────────────────────
# Client → Server events
# ────────────────────────────────────────────────────────────────────────────
@sio.on("auth")
async def on_auth(sid, token):
    """Late-auth fallback if the client didn't pass auth in the handshake."""
    try:
        async with SessionLocal() as db:
            user = await get_user_from_token(token or "", db)
    except Exception as e:
        logger.warning(f"sio auth event failed for sid={sid}: {e}")
        return {"ok": False}
    if user and sid in _conns:
        _conns[sid]["user_id"] = str(user.id)
        await sio.enter_room(sid, f"user:{user.id}")
        return {"ok": True, "user_id": str(user.id)}
    return {"ok": False}


@sio.on("subscribe")
async def on_subscribe(sid, symbol):
    """Switch the sid's active symbol and immediately push the latest tick."""
    if sid not in _conns or symbol not in engine.state:
        return {"ok": False}
    _conns[sid]["symbol"] = symbol
    st = engine.state[symbol]
    await sio.emit(
        "quotes/stream",
        _pack({"symbol": symbol, "price": st["price"], "t": st["ticks"][-1][0]}),
        to=sid,
    )
    # Push the current payout table (binary msgpack) so the client can render
    # per-symbol payout% without ever exposing it over plain HTTP.
    await sio.emit("markets/payouts", _pack({"payouts": engine.payouts()}), to=sid)
    return {"ok": True, "symbol": symbol}


# ────────────────────────────────────────────────────────────────────────────
# Data-over-socket: candles + trade placement are served via socket.io so
# nothing shows up in the browser Network tab for these payloads (Quotex-style).
# ────────────────────────────────────────────────────────────────────────────
@sio.on("candles/get")
async def on_candles_get(sid, payload):
    """Serve OHLC candles over the socket — mirrors GET /api/market/candles.

    payload = { symbol, tf, limit?, before? }
    Ack     = { symbol, tf, candles: [...], has_more: bool } or { error: str }
    """
    from routes.market_routes import fetch_candles
    from fastapi import HTTPException as _HE
    try:
        if not isinstance(payload, dict):
            return {"error": "Invalid payload"}
        symbol = payload.get("symbol")
        tf = int(payload.get("tf", 60))
        limit = int(payload.get("limit", 500))
        before = payload.get("before")
        if before is not None:
            before = int(before)
        async with SessionLocal() as db:
            return await fetch_candles(symbol, tf, limit, before, db)
    except _HE as e:
        return {"error": str(e.detail), "status": e.status_code}
    except Exception as e:
        logger.warning(f"candles/get failed sid={sid}: {e}")
        return {"error": "server error"}


@sio.on("trade/place")
async def on_trade_place(sid, payload):
    """Place a binary-option trade over the socket — mirrors POST /api/trade/place.

    payload = { symbol, direction, amount, duration, account?, requestId? }
    Ack     = { trade: {...}, balance: float, requestId, account } or { error: str }
    """
    from routes.trade_routes import place_trade_core, PlaceTradeRequest
    from fastapi import HTTPException as _HE
    from database import SessionLocal as _SL
    from models import User
    from sqlalchemy import select as _select
    try:
        user_id = _conns.get(sid, {}).get("user_id")
        if not user_id and isinstance(payload, dict) and payload.get("token"):
            # Handshake auth runs in the background, so a very fast first trade can
            # arrive before the sid is bound to a user. Authenticate inline instead
            # of rejecting with "Not authenticated".
            await _authenticate_sid(sid, str(payload.get("token")))
            user_id = _conns.get(sid, {}).get("user_id")
        if not user_id:
            return {"error": "Not authenticated"}
        if not isinstance(payload, dict):
            return {"error": "Invalid payload"}
        req = PlaceTradeRequest(**{k: v for k, v in payload.items() if k != "token"})
        async with _SL() as db:
            row = (await db.execute(_select(User).where(User.id == user_id))).scalar_one_or_none()
            if not row:
                return {"error": "User not found"}
            return await place_trade_core(req, row, db)
    except _HE as e:
        return {"error": str(e.detail), "status": e.status_code}
    except Exception as e:
        logger.warning(f"trade/place failed sid={sid}: {e}")
        return {"error": "server error"}


# ────────────────────────────────────────────────────────────────────────────
# Chart drawings — per-account, per-symbol. Saved server-side so a user's
# trend lines / fibs / channels reload automatically on any device when they
# open that pair again. Mutations are echoed to the account's other sessions.
# ────────────────────────────────────────────────────────────────────────────
@sio.on("drawings/get")
async def on_drawings_get(sid, payload):
    """payload = { symbol } → { symbol, drawings: [...] }"""
    import drawings as dw
    user_id = _conns.get(sid, {}).get("user_id")
    if not user_id:
        return {"error": "Not authenticated"}
    symbol = (payload or {}).get("symbol")
    if not isinstance(symbol, str) or not symbol:
        return {"error": "Invalid payload"}
    try:
        async with SessionLocal() as db:
            items = await dw.list_drawings(db, user_id, symbol)
        return {"symbol": symbol, "drawings": items}
    except Exception as e:
        logger.warning(f"drawings/get failed sid={sid}: {e}")
        return {"error": "server error"}


@sio.on("drawings/save")
async def on_drawings_save(sid, payload):
    """payload = { drawing: {...} } → { ok, drawing }"""
    import drawings as dw
    user_id = _conns.get(sid, {}).get("user_id")
    if not user_id:
        return {"error": "Not authenticated"}
    item = (payload or {}).get("drawing")
    try:
        async with SessionLocal() as db:
            saved = await dw.upsert_drawing(db, user_id, item)
        if not saved:
            return {"error": "Invalid drawing"}
        await sio.emit("drawings/changed", {"action": "save", "drawing": saved},
                       room=f"user:{user_id}", skip_sid=sid)
        return {"ok": True, "drawing": saved}
    except Exception as e:
        logger.warning(f"drawings/save failed sid={sid}: {e}")
        return {"error": "server error"}


@sio.on("drawings/delete")
async def on_drawings_delete(sid, payload):
    """payload = { id, symbol } → { ok }"""
    import drawings as dw
    user_id = _conns.get(sid, {}).get("user_id")
    if not user_id:
        return {"error": "Not authenticated"}
    did = (payload or {}).get("id")
    try:
        async with SessionLocal() as db:
            await dw.delete_drawing(db, user_id, did)
        await sio.emit("drawings/changed",
                       {"action": "delete", "id": str(did), "symbol": (payload or {}).get("symbol")},
                       room=f"user:{user_id}", skip_sid=sid)
        return {"ok": True}
    except Exception as e:
        logger.warning(f"drawings/delete failed sid={sid}: {e}")
        return {"error": "server error"}


@sio.on("drawings/clear")
async def on_drawings_clear(sid, payload):
    """payload = { symbol } → { ok }"""
    import drawings as dw
    user_id = _conns.get(sid, {}).get("user_id")
    if not user_id:
        return {"error": "Not authenticated"}
    symbol = (payload or {}).get("symbol")
    try:
        async with SessionLocal() as db:
            ok = await dw.clear_drawings(db, user_id, symbol)
        if not ok:
            return {"error": "Invalid payload"}
        await sio.emit("drawings/changed", {"action": "clear", "symbol": symbol},
                       room=f"user:{user_id}", skip_sid=sid)
        return {"ok": True}
    except Exception as e:
        logger.warning(f"drawings/clear failed sid={sid}: {e}")
        return {"error": "server error"}


# ────────────────────────────────────────────────────────────────────────────
# Chart indicators — persisted per account + symbol (same contract as drawings)
# ────────────────────────────────────────────────────────────────────────────
@sio.on("indicators/get")
async def on_indicators_get(sid, payload):
    """payload = { symbol } → { symbol, indicators: [...] }"""
    import indicators as ind
    user_id = _conns.get(sid, {}).get("user_id")
    if not user_id:
        return {"error": "Not authenticated"}
    symbol = (payload or {}).get("symbol")
    if not isinstance(symbol, str) or not symbol:
        return {"error": "Invalid payload"}
    try:
        async with SessionLocal() as db:
            items = await ind.list_indicators(db, user_id, symbol)
        return {"symbol": symbol, "indicators": items}
    except Exception as e:
        logger.warning(f"indicators/get failed sid={sid}: {e}")
        return {"error": "server error"}


@sio.on("indicators/save")
async def on_indicators_save(sid, payload):
    """payload = { indicator: {...} } → { ok, indicator }"""
    import indicators as ind
    user_id = _conns.get(sid, {}).get("user_id")
    if not user_id:
        return {"error": "Not authenticated"}
    item = (payload or {}).get("indicator")
    try:
        async with SessionLocal() as db:
            saved = await ind.upsert_indicator(db, user_id, item)
        if not saved:
            return {"error": "Invalid indicator"}
        await sio.emit("indicators/changed", {"action": "save", "indicator": saved},
                       room=f"user:{user_id}", skip_sid=sid)
        return {"ok": True, "indicator": saved}
    except Exception as e:
        logger.warning(f"indicators/save failed sid={sid}: {e}")
        return {"error": "server error"}


@sio.on("indicators/delete")
async def on_indicators_delete(sid, payload):
    """payload = { id, symbol } → { ok }"""
    import indicators as ind
    user_id = _conns.get(sid, {}).get("user_id")
    if not user_id:
        return {"error": "Not authenticated"}
    iid = (payload or {}).get("id")
    try:
        async with SessionLocal() as db:
            await ind.delete_indicator(db, user_id, iid)
        await sio.emit("indicators/changed",
                       {"action": "delete", "id": str(iid), "symbol": (payload or {}).get("symbol")},
                       room=f"user:{user_id}", skip_sid=sid)
        return {"ok": True}
    except Exception as e:
        logger.warning(f"indicators/delete failed sid={sid}: {e}")
        return {"error": "server error"}


@sio.on("indicators/clear")
async def on_indicators_clear(sid, payload):
    """payload = { symbol } → { ok }"""
    import indicators as ind
    user_id = _conns.get(sid, {}).get("user_id")
    if not user_id:
        return {"error": "Not authenticated"}
    symbol = (payload or {}).get("symbol")
    try:
        async with SessionLocal() as db:
            ok = await ind.clear_indicators(db, user_id, symbol)
        if not ok:
            return {"error": "Invalid payload"}
        await sio.emit("indicators/changed", {"action": "clear", "symbol": symbol},
                       room=f"user:{user_id}", skip_sid=sid)
        return {"ok": True}
    except Exception as e:
        logger.warning(f"indicators/clear failed sid={sid}: {e}")
        return {"error": "server error"}


# ────────────────────────────────────────────────────────────────────────────
# Broadcast helpers (called from market_loop / settle_loop)
# ────────────────────────────────────────────────────────────────────────────
async def broadcast_tick(now: float, updates: dict[str, float]):
    """Send per-symbol quotes/stream binary packets, plus a periodic depth/change."""
    global _last_depth
    if not _conns:
        return

    # Fan out one tick per subscribed symbol (binary payload, "quotes/stream").
    for sid, meta in list(_conns.items()):
        sym = meta.get("symbol")
        if sym and sym in updates:
            await sio.emit(
                "quotes/stream",
                _pack({"symbol": sym, "price": updates[sym], "t": now}),
                to=sid,
            )

    # Every 5s emit a simulated depth/change snapshot to everyone (like Quotex).
    if now - _last_depth >= 5:
        _last_depth = now
        depth_payload = {
            "t": now,
            "book": {
                sym: {
                    "bid": round(px - 0.00003, 5),
                    "ask": round(px + 0.00003, 5),
                    "vol": int((int(now) + hash(sym)) % 500) + 50,
                }
                for sym, px in updates.items()
            },
        }
        await sio.emit("depth/change", _pack(depth_payload))


async def push_trade_closed(user_id: str, trade: dict, balance: float):
    """Both legacy JSON event and Quotex-style `s_orders/close` to the user's room."""
    payload = {"trade": trade, "balance": balance, "t": time.time()}
    room = f"user:{user_id}"
    await sio.emit("trade_closed", payload, room=room)
    # Quotex-style channel: same payload, kept for parity with the client protocol.
    await sio.emit("s_orders/close", payload, room=room)


async def push_trade_open(user_id: str, trade: dict, balance: float, request_id: int | None = None):
    """Quotex-style `s_orders/open` event echoed back after server-side verification."""
    await sio.emit(
        "s_orders/open",
        {"trade": trade, "balance": balance, "requestId": request_id, "t": time.time()},
        room=f"user:{user_id}",
    )


async def broadcast_payouts(payouts: dict[str, float] | None = None):
    """Fan out the current payout table (or provided override) to every sid.

    Payload is binary msgpack — the Network tab shows only "Binary Message",
    so plain-JSON exposure of `payout` is fully removed on the wire.
    """
    if not _conns:
        return
    if payouts is None:
        payouts = engine.payouts()
    await sio.emit("markets/payouts", _pack({"payouts": payouts}))
