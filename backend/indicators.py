"""Chart indicator persistence — per account, per symbol.

Same shape as `drawings.py`: rows live in `chart_indicators` (JSONB payload) and
all access happens over socket.io (see routes/sio_hub.py). Several instances of
the same indicator are allowed (e.g. MA 20 + MA 50), each with its own params.
"""
import logging
import uuid

from sqlalchemy import select, delete, text
from sqlalchemy.ext.asyncio import AsyncSession

from models import ChartIndicator

logger = logging.getLogger(__name__)

KINDS = {
    # trend / overlay
    "alligator", "bollinger_bands", "envelopes", "fractal", "ichimoku_cloud",
    "keltner_channel", "donchian_channel", "supertrend", "moving_average",
    "parabolic_sar", "zig_zag",
    # oscillators
    "adx", "aroon", "awesome_oscillator", "bears_power", "bulls_power", "cci",
    "demarker", "atr", "macd", "momentum", "rsi", "rate_of_change",
    "stochastic", "schaff_trend_cycle", "vortex", "volume_oscillator",
    "williams_r", "weis_waves_volume",
}
MAX_PER_SYMBOL = 40
MAX_PARAMS = 16


def serialize(row: ChartIndicator) -> dict:
    p = row.payload or {}
    return {
        "id": str(row.id),
        "symbol": row.symbol,
        "kind": row.kind,
        "params": p.get("params", {}),
        "visible": bool(p.get("visible", True)),
    }


def _clean_params(raw) -> dict | None:
    """Params are a flat dict of numbers / short strings (periods, colors, modes)."""
    if raw is None:
        return {}
    if not isinstance(raw, dict) or len(raw) > MAX_PARAMS:
        return None
    out: dict = {}
    for key, val in raw.items():
        if not isinstance(key, str) or not key or len(key) > 32:
            return None
        if isinstance(val, bool):
            out[key] = val
        elif isinstance(val, (int, float)):
            num = float(val)
            if num != num or num in (float("inf"), float("-inf")) or abs(num) > 1e6:
                return None
            out[key] = int(num) if float(num).is_integer() and abs(num) < 1e6 else num
        elif isinstance(val, str):
            if len(val) > 24:
                return None
            out[key] = val
        else:
            return None
    return out


def _clean(item: dict) -> dict | None:
    """Validate a client indicator → normalized (id, symbol, kind, payload)."""
    if not isinstance(item, dict):
        return None
    kind = item.get("kind")
    symbol = item.get("symbol")
    if kind not in KINDS or not isinstance(symbol, str) or not symbol or len(symbol) > 40:
        return None
    params = _clean_params(item.get("params"))
    if params is None:
        return None
    try:
        iid = uuid.UUID(str(item.get("id")))
    except (ValueError, TypeError):
        iid = uuid.uuid4()
    return {
        "id": iid,
        "symbol": symbol,
        "kind": kind,
        "payload": {"params": params, "visible": bool(item.get("visible", True))},
    }


async def list_indicators(db: AsyncSession, user_id: str, symbol: str) -> list[dict]:
    rows = (await db.execute(
        select(ChartIndicator)
        .where(ChartIndicator.user_id == user_id, ChartIndicator.symbol == symbol)
        .order_by(ChartIndicator.created_at)
    )).scalars().all()
    return [serialize(r) for r in rows]


async def upsert_indicator(db: AsyncSession, user_id: str, item: dict) -> dict | None:
    data = _clean(item)
    if not data:
        return None
    row = (await db.execute(
        select(ChartIndicator).where(
            ChartIndicator.id == data["id"], ChartIndicator.user_id == user_id,
        )
    )).scalar_one_or_none()
    if row:
        row.symbol = data["symbol"]
        row.kind = data["kind"]
        row.payload = data["payload"]
        await db.execute(
            text("UPDATE chart_indicators SET updated_at = now() WHERE id = :i"), {"i": str(row.id)}
        )
    else:
        if len(await list_indicators(db, user_id, data["symbol"])) >= MAX_PER_SYMBOL:
            return None
        row = ChartIndicator(
            id=data["id"], user_id=user_id, symbol=data["symbol"],
            kind=data["kind"], payload=data["payload"],
        )
        db.add(row)
    await db.commit()
    return serialize(row)


async def delete_indicator(db: AsyncSession, user_id: str, indicator_id: str) -> bool:
    try:
        iid = uuid.UUID(str(indicator_id))
    except (ValueError, TypeError):
        return False
    await db.execute(delete(ChartIndicator).where(
        ChartIndicator.id == iid, ChartIndicator.user_id == user_id,
    ))
    await db.commit()
    return True


async def clear_indicators(db: AsyncSession, user_id: str, symbol: str) -> bool:
    if not isinstance(symbol, str) or not symbol:
        return False
    await db.execute(delete(ChartIndicator).where(
        ChartIndicator.user_id == user_id, ChartIndicator.symbol == symbol,
    ))
    await db.commit()
    return True
