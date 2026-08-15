"""Market data routes — persisted OTC candles (paginated) + instruments."""
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

import candle_store
from database import get_db
from market import engine, SUPPORTED_TFS

router = APIRouter(prefix="/market", tags=["market"])

MAX_LIMIT = 500


def _base_period(tf: int) -> int:
    if tf < 60:
        return 5
    if tf in (14400, 86400):
        return tf
    return 60


@router.get("/instruments")
async def market_instruments():
    return engine.instrument_list()


async def fetch_candles(
    symbol: str,
    tf: int,
    limit: int = 500,
    before: Optional[int] = None,
    db: AsyncSession = None,
) -> dict:
    """Shared candle fetch used by both the HTTP endpoint and Socket.IO handler.

    Raises HTTPException on invalid input so the HTTP layer can bubble the exact
    status code; the socket handler catches and converts to an error payload.
    """
    if symbol not in engine.state:
        raise HTTPException(status_code=404, detail="Unknown symbol")
    if tf not in SUPPORTED_TFS:
        raise HTTPException(status_code=400, detail=f"Invalid timeframe. Supported: {SUPPORTED_TFS}")
    limit = max(1, min(int(limit), MAX_LIMIT))

    if not candle_store.ready:
        # Store still backfilling (or DB down) — legacy in-memory fallback.
        return {"symbol": symbol, "tf": tf, "candles": engine.candles(symbol, tf, limit), "has_more": False}

    base = _base_period(tf)
    live = engine.live_bucket(symbol, tf)
    now_bucket = live["time"] if live else None

    if before is not None:
        hi = int(before) - (int(before) % tf)  # exclusive upper bucket bound
    else:
        hi = now_bucket  # completed buckets only; forming bucket is overlaid below

    params = {"sym": symbol, "base": base, "tf": tf, "limit": limit}
    conds = "symbol = :sym AND period = :base"
    if hi is not None:
        params["hi"] = hi
        params["lo"] = hi - tf * limit
        conds += " AND ts < :hi AND ts >= :lo"

    if tf == base:
        q = f"""SELECT ts AS bucket, open, high, low, close
                FROM candles WHERE {conds}
                ORDER BY ts DESC LIMIT :limit"""
    else:
        q = f"""SELECT bucket,
                       (array_agg(open ORDER BY ts ASC))[1]  AS open,
                       MAX(high) AS high, MIN(low) AS low,
                       (array_agg(close ORDER BY ts DESC))[1] AS close
                FROM (SELECT ts - ts % :tf AS bucket, ts, open, high, low, close
                      FROM candles WHERE {conds}) sub
                GROUP BY bucket ORDER BY bucket DESC LIMIT :limit"""

    rows = (await db.execute(text(q), params)).all()
    candles = [
        {"time": int(r.bucket), "open": float(r.open), "high": float(r.high),
         "low": float(r.low), "close": float(r.close)}
        for r in reversed(rows)
    ]
    has_more = len(rows) == limit

    if before is None and now_bucket is not None:
        # Forming bucket overlay. For 4h/1d the ticks may not span the whole bucket
        # (e.g. right after a restart), so seed it from completed 1m rows first.
        forming = None
        if tf in (14400, 86400):
            r = (await db.execute(text("""
                SELECT (array_agg(open ORDER BY ts ASC))[1] AS o, MAX(high) AS h,
                       MIN(low) AS l, (array_agg(close ORDER BY ts DESC))[1] AS c
                FROM candles WHERE symbol = :sym AND period = 60 AND ts >= :b
            """), {"sym": symbol, "b": now_bucket})).first()
            if r and r.o is not None:
                forming = {"time": now_bucket, "open": float(r.o), "high": float(r.h),
                           "low": float(r.l), "close": float(r.c)}
        if live:
            if forming:
                forming["high"] = max(forming["high"], live["high"])
                forming["low"] = min(forming["low"], live["low"])
                forming["close"] = live["close"]
            else:
                forming = live
        if forming:
            if candles and candles[-1]["time"] == forming["time"]:
                candles[-1] = forming
            else:
                candles.append(forming)

    return {"symbol": symbol, "tf": tf, "candles": candles, "has_more": has_more}


@router.get("/candles")
async def market_candles(
    symbol: str,
    tf: int = 15,
    limit: int = 500,
    before: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    return await fetch_candles(symbol, tf, limit, before, db)
