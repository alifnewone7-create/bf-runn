// Time/price ↔ pixel converters built on the chart's logical scale.
// Storing points as {t: unix seconds, p: price} keeps drawings stable across
// pan/zoom/timeframe changes; logical interpolation lets a point sit anywhere,
// including off the candle grid (future space to the right).
export function makeConverters({ chart, series, data, tf, xShift = 0 }) {
  const ts = chart.timeScale();
  const n = data.length;
  const first = n ? data[0].time : 0;
  const last = n ? data[n - 1].time : 0;
  const step = tf || 60;

  const timeToLogical = (t) => {
    if (!n) return 0;
    if (t <= first) return (t - first) / step;
    if (t >= last) return (n - 1) + (t - last) / step;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (data[mid].time <= t) lo = mid; else hi = mid;
    }
    const span = (data[hi].time - data[lo].time) || step;
    return lo + (t - data[lo].time) / span;
  };

  const logicalToTime = (l) => {
    if (!n) return 0;
    if (l <= 0) return first + l * step;
    if (l >= n - 1) return last + (l - (n - 1)) * step;
    const i = Math.floor(l);
    const frac = l - i;
    return data[i].time + frac * (((data[i + 1].time - data[i].time) || step));
  };

  const range = ts.getVisibleLogicalRange();
  const paneW = ts.width() || 0;
  const span = range ? (range.to - range.from) : 0;
  const paneH = (chart.paneSize && chart.paneSize()?.height) || 0;

  // The chart's own converters clamp (or drop) anything outside the visible
  // range, which pinned off-screen drawing points to the pane edge. Both scales
  // are linear, so sample two safely in-range points and build the exact same
  // mapping ourselves — off-screen coordinates then extrapolate correctly.
  let lRef = null;
  let cRef = 0;
  let barPx = 0;
  // Primary anchor: bar spacing is exact px-per-bar, and the last bar's time
  // always maps to a real coordinate. This is deterministic — the sampling
  // fallback below silently failed on the live chart (logicalToCoordinate can
  // return null for the sampled logicals), which dropped every conversion onto
  // coordinateToLogical's integer bar index and made drags jump a whole candle.
  const barSpacing = (typeof ts.options === 'function' && ts.options()?.barSpacing) || 0;
  if (n && barSpacing > 0) {
    const cLast = ts.timeToCoordinate(data[n - 1].time);
    if (cLast !== null && cLast !== undefined) {
      lRef = n - 1;
      cRef = cLast;
      barPx = barSpacing;
    }
  }
  if (lRef === null && range && span > 0) {
    const l0 = range.from + span * 0.25;
    const l1 = range.from + span * 0.75;
    const c0 = ts.logicalToCoordinate(l0);
    const c1 = ts.logicalToCoordinate(l1);
    if (c0 !== null && c0 !== undefined && c1 !== null && c1 !== undefined && c1 !== c0) {
      lRef = l0;
      cRef = c0;
      barPx = (c1 - c0) / (l1 - l0);
    }
  }
  let yRef = null;
  let pRef = 0;
  let pxPerPrice = 0;
  if (paneH > 0) {
    const y0 = paneH * 0.25;
    const y1 = paneH * 0.75;
    const p0 = series.coordinateToPrice(y0);
    const p1 = series.coordinateToPrice(y1);
    if (p0 !== null && p0 !== undefined && p1 !== null && p1 !== undefined && p1 !== p0) {
      yRef = y0;
      pRef = p0;
      pxPerPrice = (y1 - y0) / (p1 - p0);
    }
  }

  return {
    paneW,
    // xShift cancels the pan-lock gap: while a drag pushes past the lock the
    // timeScale reports an over-panned range for a frame even though the series
    // is painted at the clamped position.
    x: (t) => {
      const l = timeToLogical(t);
      if (lRef !== null) return cRef + (l - lRef) * barPx + xShift;
      const c = ts.logicalToCoordinate(l);
      return (c === null || c === undefined) ? null : c + xShift;
    },
    // Fractional seconds on purpose: rounding to whole seconds made a drag jump
    // in 1s steps, which at higher zoom is several pixels — that was the steppy
    // horizontal movement. Sub-second precision keeps a drag pixel-smooth.
    t: (x) => {
      if (lRef !== null && barPx) return logicalToTime(lRef + ((x - xShift) - cRef) / barPx);
      const l = ts.coordinateToLogical(x - xShift);
      if (l === null || l === undefined) return null;
      return logicalToTime(l);
    },
    y: (p) => {
      if (yRef !== null) return yRef + (p - pRef) * pxPerPrice;
      const c = series.priceToCoordinate(p);
      return (c === null || c === undefined) ? null : c;
    },
    p: (y) => {
      if (yRef !== null && pxPerPrice) return pRef + (y - yRef) / pxPerPrice;
      const v = series.coordinateToPrice(y);
      return (v === null || v === undefined) ? null : v;
    },
  };
}

export const distToSegment = (px, py, a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - a.x, py - a.y);
  let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
};

// Extend the a→b direction far beyond the canvas so the renderer clips it.
export const far = (a, b, bothWays = false) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const K = 12000;
  const fwd = { x: b.x + (dx / len) * K, y: b.y + (dy / len) * K };
  const back = bothWays ? { x: a.x - (dx / len) * K, y: a.y - (dy / len) * K } : a;
  return [back, fwd];
};

export const hexAlpha = (hex, a) => {
  const h = (hex || '#14b877').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
};
