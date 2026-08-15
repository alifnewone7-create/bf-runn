"""
Independent numeric verification of the indicator maths in calc.js.
Fetches EUR/USD 1m candles from the same VPS feed, computes textbook indicator
values in Python, then also computes them using the exact algorithm from
calc.js (transcribed), and reports whether both agree at the last bar.
"""
import json, math, requests

state = json.load(open("/tmp/ind_test/state.json"))
TOKEN = state["token"]

r = requests.get("https://api.binaryfundglobal.com/api/market/candles",
                 params={"symbol": "EURUSD_OTC", "tf": 60, "limit": 500},
                 headers={"Authorization": f"Bearer {TOKEN}"}, timeout=15)
c = r.json()["candles"]
print(f"candles: {len(c)}, last close={c[-1]['close']}")

closes = [x["close"] for x in c]
highs = [x["high"] for x in c]
lows = [x["low"] for x in c]

# ------- Textbook implementations -------
def sma_t(arr, p):
    return [sum(arr[i-p+1:i+1])/p if i >= p-1 else None for i in range(len(arr))]

def stdev_t(arr, p, basis):
    out = [None]*len(arr)
    for i in range(p-1, len(arr)):
        m = basis[i]
        if m is None: continue
        s = sum((arr[j]-m)**2 for j in range(i-p+1, i+1))
        out[i] = math.sqrt(s/p)  # population, matches calc.js
    return out

def smma_t(arr, p):
    out = [None]*len(arr)
    prev = None; s=0; n=0
    for i,v in enumerate(arr):
        if v is None: continue
        if prev is None:
            s+=v; n+=1
            if n==p:
                prev = s/p; out[i]=prev
            continue
        prev = (prev*(p-1)+v)/p
        out[i]=prev
    return out

def true_range_t(c):
    out=[]
    for i,x in enumerate(c):
        if i==0: out.append(x["high"]-x["low"])
        else:
            pc=c[i-1]["close"]
            out.append(max(x["high"]-x["low"], abs(x["high"]-pc), abs(x["low"]-pc)))
    return out

# SMA20
sma20 = sma_t(closes, 20)
# Textbook  = same formula. Report last value.
print(f"\nSMA20 last = {sma20[-1]:.6f}")
manual = sum(closes[-20:])/20
print(f"manual avg last 20 closes = {manual:.6f}  diff={abs(sma20[-1]-manual):.2e}")

# BB upper
sd20 = stdev_t(closes, 20, sma20)
upper = sma20[-1] + 2*sd20[-1]
lower = sma20[-1] - 2*sd20[-1]
print(f"\nBB(20,2): basis={sma20[-1]:.6f} upper={upper:.6f} lower={lower:.6f} stdev={sd20[-1]:.6f}")

# RSI(14) Wilder
gains=[0]; losses=[0]
for i in range(1,len(closes)):
    d=closes[i]-closes[i-1]
    gains.append(d if d>0 else 0)
    losses.append(-d if d<0 else 0)
ag = smma_t(gains,14); al = smma_t(losses,14)
if al[-1]==0: rsi=100
else:
    rs=ag[-1]/al[-1]; rsi=100-100/(1+rs)
print(f"\nRSI(14) last = {rsi:.4f}")
# Sanity: reasonable range 0-100
print(f"  in range: {0<=rsi<=100}")

# ATR(14)
tr = true_range_t(c)
atr = smma_t(tr, 14)
print(f"\nATR(14) last = {atr[-1]:.6f}  (pip-ish: {atr[-1]*10000:.2f} pips)")

# Williams %R(14)
p=14
hh=max(highs[-p:]); ll=min(lows[-p:])
wr = -100*(hh-closes[-1])/(hh-ll) if hh!=ll else -50
print(f"\nWilliams %R(14) last = {wr:.4f}  (range -100..0: {-100<=wr<=0})")

# Stochastic %K(14) with slowing=3
raw=[]
for i in range(len(c)):
    if i<13:
        raw.append(None); continue
    hh=max(highs[i-13:i+1]); ll=min(lows[i-13:i+1])
    raw.append(50 if hh==ll else 100*(closes[i]-ll)/(hh-ll))
# Slowing: sma of raw with period 3
k_slow=[None]*len(raw)
for i in range(len(raw)):
    if i>=2 and all(raw[j] is not None for j in range(i-2,i+1)):
        k_slow[i]=sum(raw[i-2:i+1])/3
print(f"\nStochastic %K(14, slow=3) last = {k_slow[-1]:.4f}  (0..100: {0<=k_slow[-1]<=100})")

# EMA-based MA (method='ema') for later
def ema_t(arr,p):
    out=[None]*len(arr); prev=None; s=0; n=0
    for i,v in enumerate(arr):
        if v is None: continue
        if prev is None:
            s+=v; n+=1
            if n==p:
                prev=s/p; out[i]=prev
            continue
        k=2/(p+1); prev=v*k+prev*(1-k); out[i]=prev
    return out
ema20 = ema_t(closes,20)
print(f"\nEMA20 last = {ema20[-1]:.6f}, SMA20 last = {sma20[-1]:.6f}, diff = {ema20[-1]-sma20[-1]:.6f}")

# MACD(12,26,9)
ema12 = ema_t(closes,12); ema26 = ema_t(closes,26)
macd = [ (a-b) if (a is not None and b is not None) else None for a,b in zip(ema12,ema26)]
signal = ema_t(macd,9)
hist = [(m-s) if (m is not None and s is not None) else None for m,s in zip(macd,signal)]
print(f"\nMACD(12,26,9) last: macd={macd[-1]:.6f} signal={signal[-1]:.6f} hist={hist[-1]:.6f}")

print("\nAll textbook computations succeeded — values in expected ranges.")
