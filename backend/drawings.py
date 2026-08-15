"""Chart drawing persistence — per account, per symbol.

Storage lives in `chart_drawings` (JSONB payload). All access happens over
socket.io (see routes/sio_hub.py) so nothing shows up in the browser Network tab,
matching how candles and trade placement already work.
"""
import logging
import uuid

from sqlalchemy import select, delete, text
from sqlalchemy.ext.asyncio import AsyncSession

from models import ChartDrawing

logger = logging.getLogger(__name__)

TOOLS = {
    "trend_line", "ray", "extended_line", "horizontal_line", "vertical_line",
    "cross_line", "rectangle", "triangle", "fib_retracement",
    "parallel_channel", "disjoint_channel", "price_range", "date_range",
}
STYLES = {"solid", "dashed", "dotted"}
MAX_PER_SYMBOL = 300


def serialize(row: ChartDrawing) -> dict:
    p = row.payload or {}
    return {
        "id": str(row.id),
        "symbol": row.symbol,
        "tool": row.tool,
        "points": p.get("points", []),
        "color": p.get("color", "#14b877"),
        "width": int(p.get("width", 2)),
        "style": p.get("style", "solid"),
        "visible": bool(p.get("visible", True)),
    }


def _clean(item: dict) -> dict | None:
    """Validate a client drawing → normalized (id, symbol, tool, payload)."""
    if not isinstance(item, dict):
        return None
    tool = item.get("tool")
    symbol = item.get("symbol")
    if tool not in TOOLS or not isinstance(symbol, str) or not symbol or len(symbol) > 40:
        return None
    raw_points = item.get("points")
    if not isinstance(raw_points, list) or not (1 <= len(raw_points) <= 4):
        return None
    points = []
    for pt in raw_points:
        if not isinstance(pt, dict):
            return None
        try:
            points.append({"t": int(pt["t"]), "p": float(pt["p"])})
        except (KeyError, TypeError, ValueError):
            return None
    try:
        did = uuid.UUID(str(item.get("id")))
    except (ValueError, TypeError):
        did = uuid.uuid4()
    color = str(item.get("color") or "#14b877")[:16]
    style = item.get("style") if item.get("style") in STYLES else "solid"
    try:
        width = min(8, max(1, int(item.get("width", 2))))
    except (TypeError, ValueError):
        width = 2
    return {
        "id": did,
        "symbol": symbol,
        "tool": tool,
        "payload": {
            "points": points, "color": color, "width": width,
            "style": style, "visible": bool(item.get("visible", True)),
        },
    }


async def list_drawings(db: AsyncSession, user_id: str, symbol: str) -> list[dict]:
    rows = (await db.execute(
        select(ChartDrawing)
        .where(ChartDrawing.user_id == user_id, ChartDrawing.symbol == symbol)
        .order_by(ChartDrawing.created_at)
    )).scalars().all()
    return [serialize(r) for r in rows]


async def upsert_drawing(db: AsyncSession, user_id: str, item: dict) -> dict | None:
    data = _clean(item)
    if not data:
        return None
    row = (await db.execute(
        select(ChartDrawing).where(ChartDrawing.id == data["id"], ChartDrawing.user_id == user_id)
    )).scalar_one_or_none()
    if row:
        row.symbol = data["symbol"]
        row.tool = data["tool"]
        row.payload = data["payload"]
        await db.execute(
            text("UPDATE chart_drawings SET updated_at = now() WHERE id = :i"), {"i": str(row.id)}
        )
    else:
        count = len(await list_drawings(db, user_id, data["symbol"]))
        if count >= MAX_PER_SYMBOL:
            return None
        row = ChartDrawing(
            id=data["id"], user_id=user_id, symbol=data["symbol"],
            tool=data["tool"], payload=data["payload"],
        )
        db.add(row)
    await db.commit()
    return serialize(row)


async def delete_drawing(db: AsyncSession, user_id: str, drawing_id: str) -> bool:
    try:
        did = uuid.UUID(str(drawing_id))
    except (ValueError, TypeError):
        return False
    await db.execute(delete(ChartDrawing).where(ChartDrawing.id == did, ChartDrawing.user_id == user_id))
    await db.commit()
    return True


async def clear_drawings(db: AsyncSession, user_id: str, symbol: str) -> bool:
    if not isinstance(symbol, str) or not symbol:
        return False
    await db.execute(delete(ChartDrawing).where(
        ChartDrawing.user_id == user_id, ChartDrawing.symbol == symbol,
    ))
    await db.commit()
    return True
