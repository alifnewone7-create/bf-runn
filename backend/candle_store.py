"""Persistent OTC candle store — Postgres is the single source of truth for chart history.

Base periods stored:  5s (2 days), 1m (30 days), 4h (60 days), 1d (180 days).
Every other timeframe is aggregated from these, so ALL users on ALL devices
see exactly the same candles.
"""
import asyncio
import logging
import time

from sqlalchemy import text

from database import SessionLocal
from market import engine, INSTRUMENTS, BASE_PERIODS

logger = logging.getLogger(__name__)

BACKFILL_WINDOW = {5: 2 * 86400, 60: 30 * 86400, 14400: 60 * 86400, 86400: 180 * 86400}
RETENTION = {5: 2 * 86400, 60: 30 * 86400}  # 4h / 1d kept as-is (tiny)
FLUSH_INTERVAL = 2
INSERT_CHUNK = 5000

ready = False

_UPSERT = text("""
    INSERT INTO candles (symbol, period, ts, open, high, low, close)
    VALUES (:sym, :period, :ts, :o, :h, :l, :c)
    ON CONFLICT (symbol, period, ts) DO UPDATE SET
        open = EXCLUDED.open, high = EXCLUDED.high,
        low = EXCLUDED.low, close = EXCLUDED.close
""")


async def ensure_schema() -> None:
    async with SessionLocal() as db:
        await db.execute(text("""
            CREATE TABLE IF NOT EXISTS candles (
                symbol VARCHAR(20) NOT NULL,
                period INTEGER NOT NULL,
                ts BIGINT NOT NULL,
                open DOUBLE PRECISION NOT NULL,
                high DOUBLE PRECISION NOT NULL,
                low DOUBLE PRECISION NOT NULL,
                close DOUBLE PRECISION NOT NULL,
                PRIMARY KEY (symbol, period, ts)
            )
        """))
        await db.commit()


def _gen_bars(ins, start_price, start_ts, end_ts, period):
    """Forward random-walk OHLC bars for [start_ts, end_ts) bucket range."""
    digits = ins["digits"]
    raw = float(start_price)
    mom = 0.0
    if period >= 14400:
        steps = min(int(period / 60), 240)
        scale = max(1.0, (period / 60) ** 0.5) * 3
    elif period == 60:
        # 8 compressed steps ≈ 60 live ticks: 0.5*sqrt(60) == scale*sqrt(8)
        steps = 8
        scale = 0.5 * (60 / 8) ** 0.5
    else:
        steps = period
        scale = 0.5
    bars = []
    ts = start_ts
    while ts < end_ts:
        o = raw
        h = raw
        l = raw
        for _ in range(steps):
            raw, mom = engine._step(ins, raw, mom, scale=scale)
            h = max(h, raw)
            l = min(l, raw)
        bars.append({
            "sym": ins["symbol"], "period": period, "ts": ts,
            "o": round(o, digits), "h": round(h, digits),
            "l": round(l, digits), "c": round(raw, digits),
        })
        ts += period
    return bars, raw


async def _insert_rows(db, rows):
    for i in range(0, len(rows), INSERT_CHUNK):
        await db.execute(_UPSERT, rows[i:i + INSERT_CHUNK])
    await db.commit()


async def _backfill_symbol(db, ins) -> None:
    """Fresh backfill or gap-fill for one symbol across all base periods."""
    sym = ins["symbol"]
    now = int(time.time())
    for period in BASE_PERIODS:
        last_bucket = now - now % period  # current (forming) bucket — do NOT store
        window_start = last_bucket - (BACKFILL_WINDOW[period] // period) * period
        row = (await db.execute(
            text("SELECT ts, close FROM candles WHERE symbol=:s AND period=:p ORDER BY ts DESC LIMIT 1"),
            {"s": sym, "p": period},
        )).first()
        if row is None:
            start_ts, start_price = window_start, ins["base"]
        else:
            start_ts, start_price = int(row.ts) + period, float(row.close)
            if start_ts < window_start:  # gap larger than the retention window
                start_ts = window_start
        if start_ts >= last_bucket:
            continue
        bars, _ = _gen_bars(ins, start_price, start_ts, last_bucket, period)
        if bars:
            await _insert_rows(db, bars)
            logger.info("candles backfill %s period=%s rows=%s", sym, period, len(bars))


async def backfill_all() -> None:
    t0 = time.time()
    async with SessionLocal() as db:
        for ins in INSTRUMENTS:
            await _backfill_symbol(db, ins)
        # Re-anchor the live engine to the stored history (price continuity for everyone).
        for ins in INSTRUMENTS:
            sym = ins["symbol"]
            last = (await db.execute(
                text("SELECT close FROM candles WHERE symbol=:s AND period=60 ORDER BY ts DESC LIMIT 1"),
                {"s": sym},
            )).scalar_one_or_none()
            if last is None:
                continue
            ticks = (await db.execute(
                text("SELECT ts, close FROM candles WHERE symbol=:s AND period=5 AND ts >= :cut ORDER BY ts ASC"),
                {"s": sym, "cut": int(time.time()) - 14400},
            )).all()
            engine.adopt(sym, float(last), [(r.ts, r.close) for r in ticks])
    logger.info("candle store ready in %.1fs", time.time() - t0)


async def flush_loop() -> None:
    """Persist completed base-period candles from the live engine."""
    while True:
        await asyncio.sleep(FLUSH_INTERVAL)
        if not engine.completed:
            continue
        batch, engine.completed = engine.completed, []
        rows = [
            {"sym": s, "period": p, "ts": c["time"], "o": c["open"], "h": c["high"], "l": c["low"], "c": c["close"]}
            for s, p, c in batch
        ]
        try:
            async with SessionLocal() as db:
                await _insert_rows(db, rows)
        except Exception as exc:
            logger.error("candle flush failed (%s rows): %s", len(rows), exc)
            engine.completed = batch + engine.completed  # retry next cycle


async def retention_loop() -> None:
    while True:
        try:
            now = int(time.time())
            async with SessionLocal() as db:
                for period, keep in RETENTION.items():
                    await db.execute(
                        text("DELETE FROM candles WHERE period=:p AND ts < :cut"),
                        {"p": period, "cut": now - keep},
                    )
                await db.commit()
        except Exception as exc:
            logger.error("candle retention failed: %s", exc)
        await asyncio.sleep(3600)


async def run() -> None:
    global ready
    try:
        await ensure_schema()
        await backfill_all()
        ready = True
        await asyncio.gather(flush_loop(), retention_loop())
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("candle store failed — falling back to in-memory candles")
