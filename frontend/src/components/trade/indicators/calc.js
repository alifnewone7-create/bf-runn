// Indicator maths. compute(kind, params, candles, tf) -> { plotKey: [{time, value, color?}] }
// Candles are ascending OHLC objects: { time, open, high, low, close }.

const num = (v, d) => (Number.isFinite(+v) ? +v : d);
const src = (c, mode) => {
  switch (mode) {
    case 'open': return c.open;
    case 'high': return c.high;
    case 'low': return c.low;
    case 'hl2': return (c.high + c.low) / 2;
    case 'hlc3': return (c.high + c.low + c.close) / 3;
    default: return c.close;
  }
};

const sma = (arr, p) => {
  const out = new Array(arr.length).fill(null);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < arr.length; i += 1) {
    const v = arr[i];
    if (v === null) { sum = 0; count = 0; continue; }
    sum += v; count += 1;
    if (count > p) { sum -= arr[i - p]; count = p; }
    if (count === p) out[i] = sum / p;
  }
  return out;
};

const ema = (arr, p) => {
  const out = new Array(arr.length).fill(null);
  const k = 2 / (p + 1);
  let prev = null;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < arr.length; i += 1) {
    const v = arr[i];
    if (v === null) continue;
    if (prev === null) {
      sum += v; n += 1;
      if (n === p) { prev = sum / p; out[i] = prev; }
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
};

const smma = (arr, p) => {
  const out = new Array(arr.length).fill(null);
  let prev = null;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < arr.length; i += 1) {
    const v = arr[i];
    if (v === null) continue;
    if (prev === null) {
      sum += v; n += 1;
      if (n === p) { prev = sum / p; out[i] = prev; }
      continue;
    }
    prev = (prev * (p - 1) + v) / p;
    out[i] = prev;
  }
  return out;
};

const wma = (arr, p) => {
  const out = new Array(arr.length).fill(null);
  const denom = (p * (p + 1)) / 2;
  for (let i = p - 1; i < arr.length; i += 1) {
    let acc = 0;
    let ok = true;
    for (let j = 0; j < p; j += 1) {
      const v = arr[i - p + 1 + j];
      if (v === null) { ok = false; break; }
      acc += v * (j + 1);
    }
    if (ok) out[i] = acc / denom;
  }
  return out;
};

const movingAvg = (arr, p, method) => {
  if (method === 'ema') return ema(arr, p);
  if (method === 'wma') return wma(arr, p);
  if (method === 'smma') return smma(arr, p);
  return sma(arr, p);
};

const stdev = (arr, p, basis) => {
  const out = new Array(arr.length).fill(null);
  for (let i = p - 1; i < arr.length; i += 1) {
    const mean = basis[i];
    if (mean === null) continue;
    let acc = 0;
    for (let j = i - p + 1; j <= i; j += 1) acc += (arr[j] - mean) ** 2;
    out[i] = Math.sqrt(acc / p);
  }
  return out;
};

const highest = (c, p) => c.map((_, i) => (i < p - 1 ? null : Math.max(...c.slice(i - p + 1, i + 1).map((x) => x.high))));
const lowest = (c, p) => c.map((_, i) => (i < p - 1 ? null : Math.min(...c.slice(i - p + 1, i + 1).map((x) => x.low))));

const trueRange = (c) => c.map((x, i) => (i === 0
  ? x.high - x.low
  : Math.max(x.high - x.low, Math.abs(x.high - c[i - 1].close), Math.abs(x.low - c[i - 1].close))));

const atrArr = (c, p) => smma(trueRange(c), p);

// Approximate volume — the OTC feed carries OHLC only, so bar activity is
// derived from its range. MOCKED: not real traded volume.
const volProxy = (c) => c.map((x) => Math.max(1, Math.round(((x.high - x.low) + Math.abs(x.close - x.open)) * 1e6)));

// Turn an aligned array into chart data, shifting `shift` bars into the future.
const toData = (values, candles, tf, shift = 0) => {
  const out = [];
  const n = candles.length;
  const step = tf || (n > 1 ? candles[1].time - candles[0].time : 60);
  const lastTime = n ? candles[n - 1].time : 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    const idx = i + shift;
    if (idx < 0) continue;
    const time = idx < n ? candles[idx].time : lastTime + (idx - (n - 1)) * step;
    out.push({ time, value: v });
  }
  return out;
};

const histData = (values, candles, colorUp, colorDown) => {
  const out = [];
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v === null || !Number.isFinite(v)) continue;
    const prev = values[i - 1];
    const rising = prev === null || prev === undefined ? v >= 0 : v >= prev;
    out.push({ time: candles[i].time, value: v, color: rising ? colorUp : colorDown });
  }
  return out;
};

// ── individual indicators ───────────────────────────────────────────────────

const calcSupertrend = (c, atrPeriod, mult) => {
  const atr = atrArr(c, atrPeriod);
  const up = new Array(c.length).fill(null);
  const down = new Array(c.length).fill(null);
  let trend = 1;
  let finalUpper = null;
  let finalLower = null;
  for (let i = 0; i < c.length; i += 1) {
    if (atr[i] === null) continue;
    const mid = (c[i].high + c[i].low) / 2;
    const basicUpper = mid + mult * atr[i];
    const basicLower = mid - mult * atr[i];
    const prevClose = i > 0 ? c[i - 1].close : c[i].close;
    finalUpper = finalUpper === null || basicUpper < finalUpper || prevClose > finalUpper ? basicUpper : finalUpper;
    finalLower = finalLower === null || basicLower > finalLower || prevClose < finalLower ? basicLower : finalLower;
    if (c[i].close > finalUpper) trend = 1;
    else if (c[i].close < finalLower) trend = -1;
    if (trend === 1) up[i] = finalLower; else down[i] = finalUpper;
  }
  return { up, down };
};

const calcSar = (c, step, maxStep) => {
  const out = new Array(c.length).fill(null);
  if (c.length < 3) return out;
  let bull = c[1].close >= c[0].close;
  let sar = bull ? c[0].low : c[0].high;
  let ep = bull ? c[0].high : c[0].low;
  let af = step;
  for (let i = 1; i < c.length; i += 1) {
    sar += af * (ep - sar);
    if (bull) {
      if (c[i].low < sar) { bull = false; sar = ep; ep = c[i].low; af = step; }
      else if (c[i].high > ep) { ep = c[i].high; af = Math.min(af + step, maxStep); }
    } else {
      if (c[i].high > sar) { bull = true; sar = ep; ep = c[i].high; af = step; }
      else if (c[i].low < ep) { ep = c[i].low; af = Math.min(af + step, maxStep); }
    }
    out[i] = sar;
  }
  return out;
};

const calcZigZag = (c, depth, devPct) => {
  const out = new Array(c.length).fill(null);
  if (c.length < depth * 2) return out;
  const pivots = [];
  for (let i = depth; i < c.length - depth; i += 1) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - depth; j <= i + depth; j += 1) {
      if (j === i) continue;
      if (c[j].high >= c[i].high) isHigh = false;
      if (c[j].low <= c[i].low) isLow = false;
    }
    if (isHigh) pivots.push({ i, price: c[i].high, dir: 1 });
    else if (isLow) pivots.push({ i, price: c[i].low, dir: -1 });
  }
  const kept = [];
  for (const p of pivots) {
    const last = kept[kept.length - 1];
    if (!last) { kept.push(p); continue; }
    if (last.dir === p.dir) {
      if ((p.dir === 1 && p.price > last.price) || (p.dir === -1 && p.price < last.price)) kept[kept.length - 1] = p;
      continue;
    }
    const move = Math.abs(p.price - last.price) / last.price * 100;
    if (move >= devPct) kept.push(p);
  }
  for (const p of kept) out[p.i] = p.price;
  // anchor the open leg to the latest bar so the line reaches "now"
  const last = kept[kept.length - 1];
  if (last) {
    const i = c.length - 1;
    out[i] = last.dir === 1 ? Math.min(...c.slice(last.i).map((x) => x.low)) : Math.max(...c.slice(last.i).map((x) => x.high));
  }
  return { out, kept };
};

const calcAdx = (c, p) => {
  const plusDM = [];
  const minusDM = [];
  for (let i = 0; i < c.length; i += 1) {
    if (i === 0) { plusDM.push(0); minusDM.push(0); continue; }
    const up = c[i].high - c[i - 1].high;
    const dn = c[i - 1].low - c[i].low;
    plusDM.push(up > dn && up > 0 ? up : 0);
    minusDM.push(dn > up && dn > 0 ? dn : 0);
  }
  const trS = smma(trueRange(c), p);
  const pS = smma(plusDM, p);
  const mS = smma(minusDM, p);
  const plusDI = c.map((_, i) => (trS[i] && pS[i] !== null ? (100 * pS[i]) / trS[i] : null));
  const minusDI = c.map((_, i) => (trS[i] && mS[i] !== null ? (100 * mS[i]) / trS[i] : null));
  const dx = c.map((_, i) => {
    if (plusDI[i] === null || minusDI[i] === null) return null;
    const sum = plusDI[i] + minusDI[i];
    return sum === 0 ? 0 : (100 * Math.abs(plusDI[i] - minusDI[i])) / sum;
  });
  return { adx: smma(dx, p), plusDI, minusDI };
};

const calcStoch = (c, kP, dP, slow) => {
  const hh = highest(c, kP);
  const ll = lowest(c, kP);
  const raw = c.map((x, i) => {
    if (hh[i] === null || ll[i] === null) return null;
    const range = hh[i] - ll[i];
    return range === 0 ? 50 : (100 * (x.close - ll[i])) / range;
  });
  const k = slow > 1 ? sma(raw, slow) : raw;
  return { k, d: sma(k, dP) };
};

const calcRsi = (closes, p) => {
  const gains = [];
  const losses = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i === 0) { gains.push(0); losses.push(0); continue; }
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  const ag = smma(gains, p);
  const al = smma(losses, p);
  return closes.map((_, i) => {
    if (ag[i] === null || al[i] === null) return null;
    if (al[i] === 0) return 100;
    const rs = ag[i] / al[i];
    return 100 - 100 / (1 + rs);
  });
};

const stochOf = (arr, p) => arr.map((v, i) => {
  if (i < p - 1 || v === null) return null;
  const win = arr.slice(i - p + 1, i + 1).filter((x) => x !== null);
  if (win.length < p) return null;
  const lo = Math.min(...win);
  const hi = Math.max(...win);
  return hi === lo ? 50 : (100 * (v - lo)) / (hi - lo);
});

export function compute(kind, rawParams, candles, tf) {
  const c = candles || [];
  if (c.length < 3) return {};
  const p = rawParams || {};
  const closes = c.map((x) => x.close);
  const median = c.map((x) => (x.high + x.low) / 2);

  switch (kind) {
    case 'moving_average': {
      const period = num(p.period, 20);
      const values = movingAvg(c.map((x) => src(x, p.source || 'close')), period, p.method || 'sma');
      return { ma: toData(values, c, tf) };
    }
    case 'bollinger_bands': {
      const period = num(p.period, 20);
      const dev = num(p.dev, 2);
      const basis = sma(closes, period);
      const sd = stdev(closes, period, basis);
      return {
        upper: toData(basis.map((v, i) => (v === null || sd[i] === null ? null : v + dev * sd[i])), c, tf),
        middle: toData(basis, c, tf),
        lower: toData(basis.map((v, i) => (v === null || sd[i] === null ? null : v - dev * sd[i])), c, tf),
      };
    }
    case 'envelopes': {
      const basis = sma(closes, num(p.period, 20));
      const pct = num(p.pct, 0.5) / 100;
      return {
        upper: toData(basis.map((v) => (v === null ? null : v * (1 + pct))), c, tf),
        middle: toData(basis, c, tf),
        lower: toData(basis.map((v) => (v === null ? null : v * (1 - pct))), c, tf),
      };
    }
    case 'alligator': {
      const jaw = smma(median, num(p.jaw, 13));
      const teeth = smma(median, num(p.teeth, 8));
      const lips = smma(median, num(p.lips, 5));
      return {
        jaw: toData(jaw, c, tf, 8),
        teeth: toData(teeth, c, tf, 5),
        lips: toData(lips, c, tf, 3),
      };
    }
    case 'fractal': {
      const span = num(p.span, 2);
      const up = new Array(c.length).fill(null);
      const down = new Array(c.length).fill(null);
      for (let i = span; i < c.length - span; i += 1) {
        let isHigh = true;
        let isLow = true;
        for (let j = i - span; j <= i + span; j += 1) {
          if (j === i) continue;
          if (c[j].high >= c[i].high) isHigh = false;
          if (c[j].low <= c[i].low) isLow = false;
        }
        if (isHigh) up[i] = c[i].high;
        if (isLow) down[i] = c[i].low;
      }
      return { up: toData(up, c, tf), down: toData(down, c, tf) };
    }
    case 'ichimoku_cloud': {
      const t = num(p.tenkan, 9);
      const k = num(p.kijun, 26);
      const s = num(p.senkou, 52);
      const mid = (per) => {
        const hh = highest(c, per);
        const ll = lowest(c, per);
        return hh.map((v, i) => (v === null || ll[i] === null ? null : (v + ll[i]) / 2));
      };
      const tenkan = mid(t);
      const kijun = mid(k);
      const spanA = tenkan.map((v, i) => (v === null || kijun[i] === null ? null : (v + kijun[i]) / 2));
      const spanB = mid(s);
      return {
        tenkan: toData(tenkan, c, tf),
        kijun: toData(kijun, c, tf),
        spanA: toData(spanA, c, tf, k),
        spanB: toData(spanB, c, tf, k),
        chikou: toData(closes, c, tf, -k),
      };
    }
    case 'keltner_channel': {
      const basis = ema(closes, num(p.period, 20));
      const atr = atrArr(c, num(p.atrPeriod, 10));
      const mult = num(p.mult, 2);
      return {
        upper: toData(basis.map((v, i) => (v === null || atr[i] === null ? null : v + mult * atr[i])), c, tf),
        middle: toData(basis, c, tf),
        lower: toData(basis.map((v, i) => (v === null || atr[i] === null ? null : v - mult * atr[i])), c, tf),
      };
    }
    case 'donchian_channel': {
      const period = num(p.period, 20);
      const hh = highest(c, period);
      const ll = lowest(c, period);
      return {
        upper: toData(hh, c, tf),
        middle: toData(hh.map((v, i) => (v === null || ll[i] === null ? null : (v + ll[i]) / 2)), c, tf),
        lower: toData(ll, c, tf),
      };
    }
    case 'supertrend': {
      const { up, down } = calcSupertrend(c, num(p.atrPeriod, 10), num(p.mult, 3));
      return { up: toData(up, c, tf), down: toData(down, c, tf) };
    }
    case 'parabolic_sar':
      return { sar: toData(calcSar(c, num(p.step, 0.02), num(p.max, 0.2)), c, tf) };
    case 'zig_zag': {
      const { out } = calcZigZag(c, num(p.depth, 12), num(p.dev, 0.1));
      return { zz: toData(out, c, tf) };
    }

    case 'adx': {
      const { adx, plusDI, minusDI } = calcAdx(c, num(p.period, 14));
      return { adx: toData(adx, c, tf), plusDI: toData(plusDI, c, tf), minusDI: toData(minusDI, c, tf) };
    }
    case 'aroon': {
      const period = num(p.period, 14);
      const up = new Array(c.length).fill(null);
      const down = new Array(c.length).fill(null);
      for (let i = period; i < c.length; i += 1) {
        let hi = -Infinity;
        let lo = Infinity;
        let hIdx = i;
        let lIdx = i;
        for (let j = i - period; j <= i; j += 1) {
          if (c[j].high >= hi) { hi = c[j].high; hIdx = j; }
          if (c[j].low <= lo) { lo = c[j].low; lIdx = j; }
        }
        up[i] = (100 * (period - (i - hIdx))) / period;
        down[i] = (100 * (period - (i - lIdx))) / period;
      }
      return { up: toData(up, c, tf), down: toData(down, c, tf) };
    }
    case 'awesome_oscillator': {
      const fast = sma(median, num(p.fast, 5));
      const slow = sma(median, num(p.slow, 34));
      const ao = fast.map((v, i) => (v === null || slow[i] === null ? null : v - slow[i]));
      return { ao: histData(ao, c, p.color || '#22c55e', p.color2 || '#f43f5e') };
    }
    case 'bears_power': {
      const e = ema(closes, num(p.period, 13));
      return { bears: toData(c.map((x, i) => (e[i] === null ? null : x.low - e[i])), c, tf) };
    }
    case 'bulls_power': {
      const e = ema(closes, num(p.period, 13));
      return { bulls: toData(c.map((x, i) => (e[i] === null ? null : x.high - e[i])), c, tf) };
    }
    case 'cci': {
      const period = num(p.period, 20);
      const tp = c.map((x) => (x.high + x.low + x.close) / 3);
      const base = sma(tp, period);
      const out = tp.map((v, i) => {
        if (base[i] === null) return null;
        let dev = 0;
        for (let j = i - period + 1; j <= i; j += 1) dev += Math.abs(tp[j] - base[i]);
        dev /= period;
        return dev === 0 ? 0 : (v - base[i]) / (0.015 * dev);
      });
      return { cci: toData(out, c, tf) };
    }
    case 'demarker': {
      const period = num(p.period, 14);
      const deMax = c.map((x, i) => (i === 0 ? 0 : Math.max(x.high - c[i - 1].high, 0)));
      const deMin = c.map((x, i) => (i === 0 ? 0 : Math.max(c[i - 1].low - x.low, 0)));
      const aMax = sma(deMax, period);
      const aMin = sma(deMin, period);
      return {
        dem: toData(aMax.map((v, i) => {
          if (v === null || aMin[i] === null) return null;
          const den = v + aMin[i];
          return den === 0 ? 0.5 : v / den;
        }), c, tf),
      };
    }
    case 'atr':
      return { atr: toData(atrArr(c, num(p.period, 14)), c, tf) };
    case 'macd': {
      const fast = ema(closes, num(p.fast, 12));
      const slow = ema(closes, num(p.slow, 26));
      const macd = fast.map((v, i) => (v === null || slow[i] === null ? null : v - slow[i]));
      const signal = ema(macd, num(p.signal, 9));
      const hist = macd.map((v, i) => (v === null || signal[i] === null ? null : v - signal[i]));
      return {
        macd: toData(macd, c, tf),
        signal: toData(signal, c, tf),
        hist: histData(hist, c, '#14b877', '#f43f5e'),
      };
    }
    case 'momentum': {
      const period = num(p.period, 10);
      return { mom: toData(closes.map((v, i) => (i < period ? null : (v / closes[i - period]) * 100)), c, tf) };
    }
    case 'rsi':
      return { rsi: toData(calcRsi(closes, num(p.period, 14)), c, tf) };
    case 'rate_of_change': {
      const period = num(p.period, 9);
      return {
        roc: toData(closes.map((v, i) => (i < period || !closes[i - period] ? null : ((v - closes[i - period]) / closes[i - period]) * 100)), c, tf),
      };
    }
    case 'stochastic': {
      const { k, d } = calcStoch(c, num(p.k, 14), num(p.d, 3), num(p.slow, 3));
      return { k: toData(k, c, tf), d: toData(d, c, tf) };
    }
    case 'schaff_trend_cycle': {
      const fast = ema(closes, num(p.fast, 23));
      const slow = ema(closes, num(p.slow, 50));
      const cycle = num(p.cycle, 10);
      const macd = fast.map((v, i) => (v === null || slow[i] === null ? null : v - slow[i]));
      const k1 = stochOf(macd, cycle);
      const d1 = ema(k1, 3);
      const k2 = stochOf(d1, cycle);
      const stc = ema(k2, 3);
      return { stc: toData(stc, c, tf) };
    }
    case 'vortex': {
      const period = num(p.period, 14);
      const tr = trueRange(c);
      const vmPlus = c.map((x, i) => (i === 0 ? 0 : Math.abs(x.high - c[i - 1].low)));
      const vmMinus = c.map((x, i) => (i === 0 ? 0 : Math.abs(x.low - c[i - 1].high)));
      const rollSum = (arr) => arr.map((_, i) => {
        if (i < period - 1) return null;
        let acc = 0;
        for (let j = i - period + 1; j <= i; j += 1) acc += arr[j];
        return acc;
      });
      const trS = rollSum(tr);
      const pS = rollSum(vmPlus);
      const mS = rollSum(vmMinus);
      return {
        viPlus: toData(pS.map((v, i) => (v === null || !trS[i] ? null : v / trS[i])), c, tf),
        viMinus: toData(mS.map((v, i) => (v === null || !trS[i] ? null : v / trS[i])), c, tf),
      };
    }
    case 'volume_oscillator': {
      const vol = volProxy(c);
      const fast = sma(vol, num(p.fast, 5));
      const slow = sma(vol, num(p.slow, 10));
      const vo = fast.map((v, i) => (v === null || !slow[i] ? null : ((v - slow[i]) / slow[i]) * 100));
      return { vo: histData(vo, c, p.color || '#60a5fa', '#f43f5e') };
    }
    case 'williams_r': {
      const period = num(p.period, 14);
      const hh = highest(c, period);
      const ll = lowest(c, period);
      return {
        wr: toData(c.map((x, i) => {
          if (hh[i] === null || ll[i] === null) return null;
          const range = hh[i] - ll[i];
          return range === 0 ? -50 : (-100 * (hh[i] - x.close)) / range;
        }), c, tf),
      };
    }
    case 'weis_waves_volume': {
      const depth = num(p.depth, 6);
      const vol = volProxy(c);
      const { kept } = calcZigZag(c, depth, 0.01);
      const dirs = new Array(c.length).fill(0);
      if (kept.length) {
        for (let k = 0; k < kept.length; k += 1) {
          const start = k === 0 ? 0 : kept[k - 1].i;
          for (let i = start; i <= kept[k].i && i < c.length; i += 1) dirs[i] = kept[k].dir;
        }
        for (let i = kept[kept.length - 1].i; i < c.length; i += 1) dirs[i] = -kept[kept.length - 1].dir;
      }
      const out = [];
      let acc = 0;
      for (let i = 0; i < c.length; i += 1) {
        if (i > 0 && dirs[i] !== dirs[i - 1]) acc = 0;
        acc += vol[i];
        out.push({ time: c[i].time, value: acc, color: dirs[i] >= 0 ? (p.color || '#22c55e') : (p.color2 || '#f43f5e') });
      }
      return { wave: out };
    }
    default:
      return {};
  }
}
