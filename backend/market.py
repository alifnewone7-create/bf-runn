import random
import time
from collections import deque

INSTRUMENTS = [
    # Currencies (OTC)
    dict(symbol="EURUSD_OTC", name="EUR/USD", category="currencies", payout=82, base=1.0842, digits=5, vol=0.00006, icon={"type": "pair", "base": "eu", "quote": "us"}),
    dict(symbol="GBPUSD_OTC", name="GBP/USD", category="currencies", payout=88, base=1.2648, digits=5, vol=0.00006, icon={"type": "pair", "base": "gb", "quote": "us"}),
    dict(symbol="USDJPY_OTC", name="USD/JPY", category="currencies", payout=88, base=154.32, digits=3, vol=0.00006, icon={"type": "pair", "base": "us", "quote": "jp"}),
    dict(symbol="EURAUD_OTC", name="EUR/AUD", category="currencies", payout=88, base=1.6546, digits=5, vol=0.00006, icon={"type": "pair", "base": "eu", "quote": "au"}),
    dict(symbol="AUDCAD_OTC", name="AUD/CAD", category="currencies", payout=85, base=0.9123, digits=5, vol=0.00006, icon={"type": "pair", "base": "au", "quote": "ca"}),
    dict(symbol="USDCHF_OTC", name="USD/CHF", category="currencies", payout=84, base=0.8842, digits=5, vol=0.00006, icon={"type": "pair", "base": "us", "quote": "ch"}),
    dict(symbol="NZDUSD_OTC", name="NZD/USD", category="currencies", payout=80, base=0.6118, digits=5, vol=0.00006, icon={"type": "pair", "base": "nz", "quote": "us"}),
    dict(symbol="EURGBP_OTC", name="EUR/GBP", category="currencies", payout=83, base=0.8571, digits=5, vol=0.00006, icon={"type": "pair", "base": "eu", "quote": "gb"}),
    dict(symbol="USDCAD_OTC", name="USD/CAD", category="currencies", payout=86, base=1.3652, digits=5, vol=0.00006, icon={"type": "pair", "base": "us", "quote": "ca"}),
    dict(symbol="AUDUSD_OTC", name="AUD/USD", category="currencies", payout=85, base=0.6539, digits=5, vol=0.00006, icon={"type": "pair", "base": "au", "quote": "us"}),
    dict(symbol="GBPJPY_OTC", name="GBP/JPY", category="currencies", payout=87, base=195.18, digits=3, vol=0.00007, icon={"type": "pair", "base": "gb", "quote": "jp"}),
    dict(symbol="USDBDT_OTC", name="USD/BDT", category="currencies", payout=90, base=109.85, digits=3, vol=0.00005, icon={"type": "pair", "base": "us", "quote": "bd"}),
    # Crypto (OTC)
    dict(symbol="BTCUSD_OTC", name="BTC/USD", category="crypto", payout=85, base=67450.0, digits=2, vol=0.00035, icon={"type": "crypto", "id": "btc"}),
    dict(symbol="ETHUSD_OTC", name="ETH/USD", category="crypto", payout=84, base=3520.0, digits=2, vol=0.00035, icon={"type": "crypto", "id": "eth"}),
    dict(symbol="SOLUSD_OTC", name="SOL/USD", category="crypto", payout=80, base=148.5, digits=3, vol=0.0004, icon={"type": "crypto", "id": "sol"}),
    dict(symbol="BNBUSD_OTC", name="BNB/USD", category="crypto", payout=78, base=585.0, digits=2, vol=0.00035, icon={"type": "crypto", "id": "bnb"}),
    dict(symbol="XRPUSD_OTC", name="XRP/USD", category="crypto", payout=79, base=0.524, digits=4, vol=0.0004, icon={"type": "crypto", "id": "xrp"}),
    dict(symbol="DOGEUSD_OTC", name="DOGE/USD", category="crypto", payout=75, base=0.1585, digits=5, vol=0.00045, icon={"type": "crypto", "id": "doge"}),
    # Commodities (OTC)
    dict(symbol="XAUUSD_OTC", name="Gold", category="commodities", payout=86, base=2345.5, digits=2, vol=0.00012, icon={"type": "badge", "text": "Au", "color": "#D4AF37"}),
    dict(symbol="XAGUSD_OTC", name="Silver", category="commodities", payout=82, base=27.85, digits=3, vol=0.00015, icon={"type": "badge", "text": "Ag", "color": "#9CA3AF"}),
    dict(symbol="WTIUSD_OTC", name="Crude Oil WTI", category="commodities", payout=80, base=78.45, digits=2, vol=0.0002, icon={"type": "badge", "text": "OIL", "color": "#8B5E34"}),
    dict(symbol="NGASUSD_OTC", name="Natural Gas", category="commodities", payout=75, base=2.845, digits=3, vol=0.00025, icon={"type": "badge", "text": "GAS", "color": "#3B82F6"}),
    # Stocks (OTC)
    dict(symbol="AAPL_OTC", name="Apple", category="stocks", payout=80, base=212.4, digits=2, vol=0.00025, icon={"type": "badge", "text": "A", "color": "#A3AAAE"}),
    dict(symbol="TSLA_OTC", name="Tesla", category="stocks", payout=82, base=248.6, digits=2, vol=0.0003, icon={"type": "badge", "text": "T", "color": "#E82127"}),
    dict(symbol="AMZN_OTC", name="Amazon", category="stocks", payout=78, base=186.3, digits=2, vol=0.00025, icon={"type": "badge", "text": "AZ", "color": "#FF9900"}),
    dict(symbol="MSFT_OTC", name="Microsoft", category="stocks", payout=79, base=428.9, digits=2, vol=0.00022, icon={"type": "badge", "text": "MS", "color": "#00A4EF"}),
    dict(symbol="GOOGL_OTC", name="Google", category="stocks", payout=77, base=176.8, digits=2, vol=0.00024, icon={"type": "badge", "text": "G", "color": "#4285F4"}),
    dict(symbol="META_OTC", name="Meta", category="stocks", payout=76, base=502.2, digits=2, vol=0.00028, icon={"type": "badge", "text": "M", "color": "#0081FB"}),
]

# Supported timeframes (seconds). 4h / 1d served from synthetic long candle banks.
SUPPORTED_TFS = (5, 10, 15, 30, 60, 120, 180, 300, 600, 900, 1800, 3600, 14400, 86400)
LONG_TFS = (14400, 86400)
# Base periods persisted to the DB — all other TFs are aggregated from these.
BASE_PERIODS = (5, 60, 14400, 86400)


class Engine:
    def __init__(self):
        self.meta = {i["symbol"]: i for i in INSTRUMENTS}
        self.state = {}
        # symbol → tf → list[candle]  (pre-generated coarse candle banks for 4h / 1d)
        self.long_candles: dict[str, dict[int, list]] = {}
        # Live candle builders (per symbol per base period) + completed buffer for the DB writer.
        self.building: dict[str, dict[int, dict]] = {}
        self.completed: list[tuple[str, int, dict]] = []

    def seed(self, history_sec=86400):
        """Seed 24h of 1-second tick history + a 300-bar bank for 4h/1d TFs."""
        now = int(time.time())
        for ins in INSTRUMENTS:
            raw = ins["base"] * random.uniform(0.998, 1.002)
            mom = 0.0
            ticks = deque(maxlen=400000)
            for t in range(now - history_sec, now + 1):
                raw, mom = self._step(ins, raw, mom)
                ticks.append((t, round(raw, ins["digits"])))
            self.state[ins["symbol"]] = {"price": ticks[-1][1], "raw": raw, "mom": mom, "ticks": ticks}
            # Pre-generate coarse candle banks so 4h / 1d show meaningful history.
            self.long_candles[ins["symbol"]] = {
                14400: self._synth_bank(ins, ticks[-1][1], 14400, count=180),  # 30 days of 4h
                86400: self._synth_bank(ins, ticks[-1][1], 86400, count=90),   # 90 days of 1d
            }

    def _synth_bank(self, ins, current_price, tf, count):
        """Generate `count` historical OHLC bars ending at the most recent aligned bucket."""
        now = int(time.time())
        last_bucket = now - (now % tf)
        bars = []
        # walk backwards from current_price using amplified vol
        raw = current_price
        mom = 0.0
        digits = ins["digits"]
        scale = max(1.0, (tf / 60) ** 0.5) * 3  # long-tf swings are much bigger
        for i in range(count, 0, -1):
            o = raw
            h = raw
            l = raw
            # Simulate tf/60 minutes of accumulated moves (bounded work).
            steps = min(int(tf / 60), 240)
            for _ in range(steps):
                raw, mom = self._step(ins, raw, mom, scale=scale)
                h = max(h, raw)
                l = min(l, raw)
            close = round(raw, digits)
            bars.append({
                "time": last_bucket - i * tf,
                "open": round(o, digits),
                "high": round(h, digits),
                "low": round(l, digits),
                "close": close,
            })
        return bars

    def _step(self, ins, raw, mom, scale=1.0):
        shock = random.gauss(0, ins["vol"] * scale)
        mom = mom * 0.72 + shock
        rev = (ins["base"] - raw) / ins["base"] * 0.00004
        raw = raw * (1 + mom + rev)
        return max(raw, ins["base"] * 0.2), mom

    def tick_all(self):
        now = round(time.time(), 2)
        now_i = int(now)
        out = {}
        for sym, st in self.state.items():
            ins = self.meta[sym]
            raw, mom = self._step(ins, st["raw"], st["mom"], scale=0.5)
            price = round(raw, ins["digits"])
            st["raw"], st["mom"], st["price"] = raw, mom, price
            st["ticks"].append((now, price))
            out[sym] = price
            # Build persisted base-period candles; completed ones go to the DB writer buffer.
            bld = self.building.setdefault(sym, {})
            for period in BASE_PERIODS:
                b = now_i - now_i % period
                cur = bld.get(period)
                if cur is None or cur["time"] != b:
                    if cur is not None:
                        self.completed.append((sym, period, cur))
                    o = cur["close"] if cur else price
                    bld[period] = {"time": b, "open": o, "high": max(o, price), "low": min(o, price), "close": price}
                else:
                    cur["high"] = max(cur["high"], price)
                    cur["low"] = min(cur["low"], price)
                    cur["close"] = price
        return now, out

    def live_bucket(self, sym, tf):
        """Forming candle for the CURRENT tf bucket, aggregated from live ticks."""
        ticks = self.state[sym]["ticks"]
        if not ticks:
            return None
        now = int(ticks[-1][0])
        b = now - now % tf
        seg = []
        for t, p in reversed(ticks):
            if t < b:
                break
            seg.append(p)
        if not seg:
            return None
        seg.reverse()
        return {"time": b, "open": seg[0], "high": max(seg), "low": min(seg), "close": seg[-1]}

    def adopt(self, sym, price, tick_rows=None):
        """Re-anchor a symbol to the persisted candle history (price + tick context)."""
        st = self.state[sym]
        digits = self.meta[sym]["digits"]
        st["raw"] = float(price)
        st["price"] = round(float(price), digits)
        if tick_rows is not None:
            ticks = deque(maxlen=400000)
            for t, p in tick_rows:
                ticks.append((int(t), round(float(p), digits)))
            if not ticks:
                ticks.append((int(time.time()), st["price"]))
            st["ticks"] = ticks
        self.building.pop(sym, None)

    def price(self, sym):
        return self.state[sym]["price"]

    def price_at(self, sym, ts):
        """Price of the last tick at or before `ts` (unix seconds).

        Used for two things:
          • entry price — the client sends the timestamp of the tick it was
            looking at, so the trade opens on exactly the price the trader saw
            (no 1-tick drift, so the chart's entry dot never jumps).
          • exit price — settlement reads the price at the expiry instant, not
            whenever the settle loop happens to run, so a result can never flip
            because of ticks that arrived after expiry.
        """
        st = self.state.get(sym)
        if not st:
            return None
        ticks = st["ticks"]
        if not ticks:
            return st["price"]
        try:
            ts = float(ts)
        except (TypeError, ValueError):
            return st["price"]
        if ts >= ticks[-1][0]:
            return st["price"]
        for t, p in reversed(ticks):
            if t <= ts:
                return p
        return ticks[0][1]

    def digits(self, sym):
        return self.meta[sym]["digits"]

    def candles(self, sym, tf, limit=500):
        """Aggregate tick history into OHLC bars for the given timeframe."""
        if tf in LONG_TFS:
            # Merge pre-generated bank with the ongoing bucket from live ticks.
            bank = list(self.long_candles[sym][tf])
            ticks = self.state[sym]["ticks"]
            if ticks:
                now = ticks[-1][0]
                cur_bucket = int(now - (now % tf))
                cur = None
                for t, p in ticks:
                    if t < cur_bucket:
                        continue
                    if cur is None:
                        cur = {"time": cur_bucket, "open": p, "high": p, "low": p, "close": p}
                    else:
                        cur["high"] = max(cur["high"], p)
                        cur["low"] = min(cur["low"], p)
                        cur["close"] = p
                if cur:
                    if bank and bank[-1]["time"] == cur["time"]:
                        bank[-1] = cur
                    else:
                        bank.append(cur)
            return bank[-limit:]

        ticks = self.state[sym]["ticks"]
        candles = []
        cur = None
        for t, p in ticks:
            b = int(t - (t % tf))
            if cur and cur["time"] == b:
                cur["high"] = max(cur["high"], p)
                cur["low"] = min(cur["low"], p)
                cur["close"] = p
            else:
                if cur:
                    candles.append(cur)
                o = cur["close"] if cur else p
                cur = {"time": b, "open": o, "high": max(o, p), "low": min(o, p), "close": p}
        if cur:
            candles.append(cur)
        return candles[-limit:]

    def instrument_list(self):
        out = []
        for ins in INSTRUMENTS:
            st = self.state[ins["symbol"]]
            ticks = st["ticks"]
            old = ticks[0][1] if len(ticks) < 14400 else ticks[-14400][1]
            chg = (st["price"] - old) / old * 100 if old else 0.0
            # NOTE: `payout` is intentionally omitted here — it is delivered to
            # clients via the binary Socket.IO event `markets/payouts` (msgpack)
            # so the plain-text HTTP payload does not expose the current rate.
            out.append({
                "symbol": ins["symbol"], "name": ins["name"], "category": ins["category"],
                "digits": ins["digits"], "icon": ins["icon"],
                "price": st["price"], "change_pct": round(chg, 2),
            })
        return out

    def payouts(self) -> dict[str, float]:
        """Snapshot of current per-symbol payout percentages (admin-controlled)."""
        return {ins["symbol"]: float(self.meta[ins["symbol"]]["payout"]) for ins in INSTRUMENTS}

    def set_payout(self, symbol: str, pct: float) -> float:
        """Update in-memory payout for `symbol` (0–100). Returns clamped value."""
        if symbol not in self.meta:
            raise KeyError(symbol)
        v = max(0.0, min(100.0, float(pct)))
        self.meta[symbol]["payout"] = v
        return v


engine = Engine()
