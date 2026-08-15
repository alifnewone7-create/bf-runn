// Unit-level test for sanitizeCandles logic — MIRROR of /app/frontend/src/components/trade/TradeChart.jsx
// Updated 2026-07-28 to the LOCAL-WINDOW outlier filter (floating-candle bug fix).
const medianOf = (arr) => {
  if (!arr.length) return 0;
  const a = arr.slice().sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
};

// Robust "typical bar-to-bar move" of a series — median absolute consecutive
// change of the midprice. Immune to a handful of corrupt rows.
const robustStep = (mids) => {
  const steps = [];
  for (let i = 1; i < mids.length; i += 1) steps.push(Math.abs(mids[i] - mids[i - 1]));
  return medianOf(steps);
};

// Tuning constants for the local-window outlier filter.
const WIN = 5; // neighbours on each side used to build the local reference price
const K_STEP = 12; // how many "typical moves" a candle may sit away from its neighbours
const MIN_TOL_PCT = 0.0008; // never tighter than 0.08% of price (protects flat series)
const WICK_SLACK = 2.5; // wicks get a wider allowance than the body midprice

/**
 * sanitizeCandles — drop rows with invalid OHLC or wild positional outliers.
 *
 * Bug 2026-07-28: a short cluster of candles rendered at a completely wrong price
 * level ("floating island" far below the real price band) while the surrounding
 * candles were fine. The previous filter compared every candle against the median
 * of the WHOLE 500-candle batch. On a trending pair that global band is huge, so a
 * locally-misplaced cluster stayed inside it and survived.
 *
 * The filter is now LOCAL: each candle is compared against the median midprice of
 * its immediate neighbours (±WIN bars, self excluded), with a tolerance scaled by
 * the pair's own robust bar-to-bar move. A genuine trend/spike moves the neighbours
 * too, so it passes; a misplaced cluster does not, so it is dropped.
 *   1. Drop candles with non-positive OHLC or low > high.
 *   2. Drop candles whose midprice escapes the local band, or whose high/low
 *      escapes a widened version of it.
 */
const sanitizeCandles = (rows) => {
  if (!rows || rows.length === 0) return rows;
  const valid = rows.filter(
    (c) => c && c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0
      && c.low <= c.high && c.low <= c.open && c.open <= c.high
      && c.low <= c.close && c.close <= c.high,
  );
  if (valid.length < 8) return valid; // too few to compute robust stats — trust the batch

  const mids = valid.map((c) => (c.open + c.close) / 2);
  const globalMed = medianOf(mids);
  let step = robustStep(mids);
  if (!(step > 0)) step = globalMed * 0.00005; // flat series guard

  const kept = [];
  for (let i = 0; i < valid.length; i += 1) {
    const from = Math.max(0, i - WIN);
    const to = Math.min(mids.length, i + WIN + 1);
    const nb = [];
    for (let j = from; j < to; j += 1) if (j !== i) nb.push(mids[j]);
    const ref = medianOf(nb);
    const tol = Math.max(K_STEP * step, ref * MIN_TOL_PCT);
    const c = valid[i];
    const wickTol = tol * WICK_SLACK;
    if (Math.abs(mids[i] - ref) <= tol
        && Math.abs(c.high - ref) <= wickTol
        && Math.abs(c.low - ref) <= wickTol) {
      kept.push(c);
    }
  }
  return kept;
};


let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log('PASS:', name); } else { fail++; console.log('FAIL:', name); } };

// Test 1: 20 candles around 1.10000 with 1 outlier at 0.30000 should drop the outlier
const t1 = [];
for (let i = 0; i < 20; i++) {
  const p = 1.10000 + (Math.random() - 0.5) * 0.002;
  t1.push({ time: i, open: p, high: p + 0.0005, low: p - 0.0005, close: p + (Math.random() - 0.5) * 0.001 });
}
t1.push({ time: 20, open: 0.30000, high: 0.30010, low: 0.29990, close: 0.30005 });
const r1 = sanitizeCandles(t1);
check('T1: 20 normal + 1 outlier => outlier dropped', r1.length === 20 && !r1.some(c => c.open < 0.5));

// Test 2: normal 2% volatility should pass through untouched
const t2 = [];
const base = 1.10000;
for (let i = 0; i < 30; i++) {
  const p = base + Math.sin(i / 3) * 0.02 * base;
  t2.push({ time: i, open: p, high: p * 1.005, low: p * 0.995, close: p * 1.001 });
}
const r2 = sanitizeCandles(t2);
check('T2: 2% volatility passes untouched', r2.length === t2.length);

// Test 3: candle with low > high should be filtered.
// Note: uses slight per-candle jitter so MAD > 0 and the 0.1%-of-median floor
// doesn't accidentally clip legitimate wicks (real market data always has jitter).
const t3 = [];
for (let i = 0; i < 10; i++) {
  const p = 1.1 + (i - 5) * 0.0002;
  t3.push({ time: i, open: p, high: p + 0.001, low: p - 0.001, close: p + 0.0005 });
}
t3.push({ time: 11, open: 1.1, high: 1.099, low: 1.101, close: 1.1 }); // low > high
const r3 = sanitizeCandles(t3);
check('T3: low > high filtered', r3.length === 10);

// Test 4: negative/zero OHLC filtered
const t4 = [
  { time: 1, open: 1.1, high: 1.11, low: 1.09, close: 1.1 },
  { time: 2, open: 0, high: 1.11, low: 1.09, close: 1.1 },
  { time: 3, open: 1.1, high: 1.11, low: 1.09, close: -1 },
  { time: 4, open: 1.1, high: 1.11, low: 1.09, close: 1.1 },
];
const r4 = sanitizeCandles(t4);
check('T4: zero/negative OHLC filtered', r4.length === 2);

// Test 5: empty array + null
check('T5: empty array', sanitizeCandles([]).length === 0);
check('T5b: null', sanitizeCandles(null) === null);

// Test 6: legitimate 5% gradual climb should NOT be filtered
const t6 = [];
for (let i = 0; i < 20; i++) {
  const p = 1.10000 * (1 + (i / 20) * 0.05);
  t6.push({ time: i, open: p, high: p * 1.001, low: p * 0.999, close: p });
}
const r6 = sanitizeCandles(t6);
check('T6: 5% gradual climb preserved', r6.length === 20);

// Test 7: outlier ABOVE main band (e.g. 3x price) also filtered
const t7 = [];
for (let i = 0; i < 20; i++) t7.push({ time: i, open: 1.1, high: 1.101, low: 1.099, close: 1.1 });
t7.push({ time: 21, open: 3.5, high: 3.6, low: 3.4, close: 3.5 });
const r7 = sanitizeCandles(t7);
check('T7: high outlier dropped', r7.length === 20);

// Test 8 (NEW): iteration_19 real-world reproduction — 20 candles at 1.066 with
// 3 outliers at 1.128 (~5.8% off median). Under the old 25% threshold these were
// NOT dropped. Under the new MAD filter they MUST be dropped.
const t8 = [];
for (let i = 0; i < 20; i++) {
  const p = 1.06635 + (Math.random() - 0.5) * 0.0004; // realistic FX jitter
  t8.push({ time: i, open: p, high: p + 0.00015, low: p - 0.00015, close: p });
}
t8.push({ time: 20, open: 1.12845, high: 1.12900, low: 1.12800, close: 1.12845 });
t8.push({ time: 21, open: 1.12674, high: 1.12720, low: 1.12620, close: 1.12674 });
t8.push({ time: 22, open: 1.12475, high: 1.12520, low: 1.12420, close: 1.12475 });
const r8 = sanitizeCandles(t8);
check('T8 (regression): 20 candles @1.066 + 3 outliers @1.128 (~5.8% off) => outliers dropped',
      r8.length === 20 && !r8.some(c => c.high > 1.10));

// Test 9 (NEW): high-wick escape — midprice looks OK but high spike blows out.
// Ensures we filter by high/low, not only midprice.
const t9 = [];
for (let i = 0; i < 15; i++) t9.push({ time: i, open: 1.1, high: 1.1005, low: 1.0995, close: 1.1 });
// Rogue candle: mid=1.1 (looks fine), but high=1.5 (visually escapes band).
t9.push({ time: 15, open: 1.1, high: 1.5, low: 1.0995, close: 1.1 });
const r9 = sanitizeCandles(t9);
check('T9: high-wick spike (mid ok, high extreme) filtered', r9.length === 15);

// Test 10 (NEW): small batch (<8 valid rows) is passed through unchanged (no robust stats).
const t10 = [
  { time: 1, open: 1.1, high: 1.11, low: 1.09, close: 1.1 },
  { time: 2, open: 3.0, high: 3.1, low: 2.9, close: 3.0 }, // would be an outlier if we had stats
];
const r10 = sanitizeCandles(t10);
check('T10: small batch (<8) skips robust stats but still enforces invariants', r10.length === 2);

// Test 11 (NEW — 2026-07-28 screenshot repro): a 60-candle DOWNTREND with a
// 3-candle "floating island" ~4% below the local band, inserted mid-series.
// The old global-median/MAD filter kept these (trend widened the band); the
// local-window filter must drop exactly those 3.
const t11 = [];
let p11 = 1.17000;
for (let i = 0; i < 60; i++) {
  p11 -= 0.00012 + Math.random() * 0.00004; // steady decline
  if (i >= 30 && i < 33) {
    const bad = p11 * 0.96; // island far below the real band
    t11.push({ time: i, open: bad, high: bad * 1.0004, low: bad * 0.9996, close: bad * 0.9998 });
  } else {
    t11.push({ time: i, open: p11, high: p11 * 1.0002, low: p11 * 0.9998, close: p11 * 0.99995 });
  }
}
const r11 = sanitizeCandles(t11);
check('T11 (repro): floating 3-candle island inside a downtrend is dropped',
      r11.length === 57 && !r11.some((c) => c.time >= 30 && c.time < 33));

// Test 12 (NEW): a legitimate sharp V-reversal (fast but continuous) must survive.
const t12 = [];
let p12 = 1.10000;
for (let i = 0; i < 60; i++) {
  p12 += i < 30 ? -0.0006 : 0.0006; // sharp down then sharp up
  t12.push({ time: i, open: p12, high: p12 * 1.0005, low: p12 * 0.9995, close: p12 });
}
const r12 = sanitizeCandles(t12);
check('T12: legitimate sharp V-reversal preserved', r12.length === 60);

// Test 13 (NEW): OHLC invariant — open/close outside the high/low range is corrupt.
const t13 = [];
for (let i = 0; i < 12; i++) {
  const p = 1.1 + i * 0.0001;
  t13.push({ time: i, open: p, high: p + 0.0003, low: p - 0.0003, close: p + 0.0001 });
}
t13.push({ time: 12, open: 1.1, high: 1.1005, low: 1.0995, close: 1.2 }); // close > high
const r13 = sanitizeCandles(t13);
check('T13: close outside high/low range filtered', r13.length === 12);

console.log(`\nResult: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
