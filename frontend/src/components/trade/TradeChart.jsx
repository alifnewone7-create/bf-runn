import React, { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, BarSeries, LineSeries, AreaSeries } from 'lightweight-charts';
import { DotsThree, X, PencilSimpleLine, ChartBar, Sparkle, CaretRight } from '@phosphor-icons/react';
import { useToast } from '../../hooks/use-toast';
import TradeResultCard from './TradeResultCard';
import useDrawings from './drawing/useDrawings';
import DrawingLayer from './drawing/DrawingLayer';
import DrawingPanel from './drawing/DrawingPanel';
import DrawingStyleBar from './drawing/DrawingStyleBar';
import { TOOL_MAP, DEFAULT_STYLE, DRAW_COLORS } from './drawing/tools';
import useIndicators from './indicators/useIndicators';
import IndicatorLayer from './indicators/IndicatorLayer';
import IndicatorPanel from './indicators/IndicatorPanel';

// Full timeframe menu (seconds → display label).
export const TF_LIST = [
  [5, '5s'], [10, '10s'], [15, '15s'], [30, '30s'],
  [60, '1m'], [120, '2m'], [180, '3m'], [300, '5m'],
  [600, '10m'], [900, '15m'], [1800, '30m'],
  [3600, '1h'], [14400, '4h'], [86400, '1d'],
];

const CHART_TYPES = [
  ['candles', 'Candles'],
  ['bars', 'Bars'],
  ['line', 'Line'],
  ['area', 'Area'],
];

// In-memory per-tab cache so switching pair/TF is instant on repeat.
const _candlesCache = new Map(); // key: `${symbol}|${tf}` → { data, ts }

// Overlay writers — transform-only positioning (GPU composited, no layout) and
// write-if-changed so per-frame overlay work never forces a reflow. Forced
// reflows on every frame were what made the crosshair feel laggy.
const setXform = (el, v) => { if (el && (el.dataset.xf !== v || el.style.transform !== v)) { el.dataset.xf = v; el.style.transform = v; } };
const SAFE_CMP = new Set(['visibility', 'width', 'height', 'zIndex', 'opacity']);
const setStyle = (el, prop, v) => {
  if (!el) return;
  const k = `s_${prop}`;
  if (el.dataset[k] === v && (!SAFE_CMP.has(prop) || el.style[prop] === v)) return;
  el.dataset[k] = v;
  el.style[prop] = v;
};
const setVis = (el, v) => setStyle(el, 'visibility', v);
// Cached element size — offsetWidth/Height reads are layout-forcing, so they are
// re-measured at most every 400ms instead of every frame.
const sizeCache = new WeakMap();
const measure = (el, fallbackW = 0, fallbackH = 0) => {
  if (!el) return { w: fallbackW, h: fallbackH };
  const now = performance.now();
  const c = sizeCache.get(el);
  if (c && now - c.at < 400) return c;
  const next = { w: el.offsetWidth || fallbackW, h: el.offsetHeight || fallbackH, at: now };
  sizeCache.set(el, next);
  return next;
};

// Empty bars kept to the right of the live candle (the live edge "parks" here).
const BASE_RIGHT_OFFSET = 8;

function addSeriesOfType(chart, type) {
  const common = { lastValueVisible: false, priceLineVisible: false };
  if (type === 'bars') return chart.addSeries(BarSeries, { ...common, upColor: '#14b877', downColor: '#f43f5e' });
  if (type === 'line') return chart.addSeries(LineSeries, { ...common, color: '#14b877', lineWidth: 2 });
  if (type === 'area') return chart.addSeries(AreaSeries, { ...common, lineColor: '#14b877', lineWidth: 2, topColor: 'rgba(20,184,119,0.28)', bottomColor: 'rgba(20,184,119,0.0)' });
  return chart.addSeries(CandlestickSeries, { ...common, upColor: '#14b877', downColor: '#f43f5e', wickUpColor: '#14b877', wickDownColor: '#f43f5e', borderVisible: false });
}

const toSeriesData = (candles, type) => ((type === 'line' || type === 'area')
  ? candles.map((c) => ({ time: c.time, value: c.close }))
  : candles);

const medianOf = (arr) => {
  if (!arr.length) return 0;
  const a = arr.slice().sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
};

// Robust "typical bar-to-bar move" of a series — median absolute consecutive
// change of the midprice. Immune to a handful of corrupt rows.
export const robustStep = (mids) => {
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

const RailBtn = ({ active, onClick, children, testId }) => (
  <button onClick={onClick} data-testid={testId}
          className={`h-9 w-9 flex items-center justify-center rounded-lg transition-colors ${active ? 'bg-[#14b877] text-[#03150d]' : 'text-white/60 bg-white/[0.04] active:bg-white/[0.1]'}`}>
    {children}
  </button>
);

export default function TradeChart({ symbol, digits, lastTick, openTrades, hoverDir, results, onDismissResult, resultTtl = 9000, wsRef }) {
  const { toast } = useToast();
  // Per-pair timeframe memory (Quotex-style) — each pair remembers its own period.
  const readTfFor = (sym) => {
    try {
      const m = JSON.parse(localStorage.getItem('bfg_tf_map') || '{}');
      if (m[sym]) return Number(m[sym]);
    } catch (e) { /* noop */ }
    return Number(localStorage.getItem('bfg_tf')) || 60;
  };
  const [tf, setTf] = useState(() => readTfFor(symbol));
  const [chartType, setChartType] = useState(() => localStorage.getItem('bfg_chart_type') || 'candles');
  const [localClock, setLocalClock] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [panel, setPanel] = useState(null); // 'tf' | 'type' | null
  const [deskPanel, setDeskPanel] = useState(null); // desktop rail panel: 'tf' | 'type' | null
  // ── Drawing tools state (per-account, per-pair; persisted over socket.io) ──
  const [drawPanel, setDrawPanel] = useState(false);
  const [drawMode, setDrawMode] = useState('idle'); // 'idle' | 'draw' | 'edit'
  const [drawTool, setDrawTool] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [hideAll, setHideAll] = useState(() => localStorage.getItem('bfg_draw_hide') === '1');
  const [newStyle, setNewStyle] = useState(DEFAULT_STYLE);
  // Set by the chart effect — pixel gap between the over-panned timeScale and the
  // locked position the series actually paints at (0 unless the pan lock is fighting a drag).
  const panExcessPxRef = useRef(null);
  const maxRightBarsRef = useRef(null);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const { drawings, create, update, remove, clear } = useDrawings({ symbol, wsRef });
  // ── Indicators (per-account, per-pair; persisted over socket.io) ──
  const [indPanel, setIndPanel] = useState(false);
  const {
    indicators, add: addIndicator, update: updateIndicator,
    saveNow: saveIndicator, remove: removeIndicator, clear: clearIndicators,
  } = useIndicators({ symbol, wsRef });
  const wrapRef = useRef(null);
  // Host size cache — clientWidth/Height reads inside the RAF loops forced a
  // layout on every frame, which is what made the crosshair feel laggy.
  const hostSizeRef = useRef({ w: 0, h: 0 });
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const lastCandleRef = useRef(null);
  const dataRef = useRef([]);
  const digitsRef = useRef(digits);
  const typeRef = useRef(chartType);
  const readyRef = useRef(false); // true once initial history rendered
  const hasMoreRef = useRef(true);
  const volRef = useRef(0); // robust bar-to-bar move of the loaded history
  const tickRejectRef = useRef(0); // consecutive rejected ticks (escape hatch)
  const loadingOlderRef = useRef(false);
  const loadOlderRef = useRef(() => {});
  digitsRef.current = digits;
  typeRef.current = chartType;

  const utcOffH = -new Date().getTimezoneOffset() / 60;
  const utcOff = `${utcOffH >= 0 ? '+' : ''}${utcOffH}`;

  // Switching pair → restore that pair's remembered period.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setTf(readTfFor(symbol)); }, [symbol]);
  useEffect(() => {
    localStorage.setItem('bfg_tf', String(tf));
    try {
      const m = JSON.parse(localStorage.getItem('bfg_tf_map') || '{}');
      m[symbol] = tf;
      localStorage.setItem('bfg_tf_map', JSON.stringify(m));
    } catch (e) { /* noop */ }
  }, [tf, symbol]);
  useEffect(() => { localStorage.setItem('bfg_chart_type', chartType); }, [chartType]);
  useEffect(() => { localStorage.setItem('bfg_draw_hide', hideAll ? '1' : '0'); }, [hideAll]);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const on = () => setIsMobile(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  // Switching pair drops any active selection/half-drawn shape.
  useEffect(() => { setSelectedId(null); setDrawMode('idle'); setDrawTool(null); }, [symbol]);

  const selectedDrawing = drawings.find((d) => d.id === selectedId) || null;
  const pickTool = (id) => {
    setDrawTool(id);
    setDrawMode('draw');
    setSelectedId(null);
    setDrawPanel(false);
    if (hideAll) setHideAll(false);
    // Every new drawing starts on a fresh random colour from the palette (never
    // the same one twice in a row); it stays editable from the style bar.
    setNewStyle((s) => {
      const pool = DRAW_COLORS.filter((c) => c !== s.color);
      return { ...s, color: pool[Math.floor(Math.random() * pool.length)] };
    });
  };
  const duplicateDrawing = () => {
    const d = selectedDrawing;
    if (!d) return;
    // Offset by 3 bars so the clone is visible and grabbable — identical shape,
    // size, colour, thickness and line style otherwise.
    const shift = (tf || 60) * 3;
    const points = (d.points || []).map((q) => ({ t: q.t + shift, p: q.p }));
    const copy = create(d.tool, points, {
      color: d.color, width: d.width, style: d.style, visible: true,
    });
    setSelectedId(copy.id);
  };
  const handleCreate = (tool, points) => {
    const d = create(tool, points, newStyle);
    setSelectedId(d.id);
    setDrawMode('idle');
    setDrawTool(null);
  };
  const handleStyleChange = (patch) => {
    if (!selectedId) return;
    update(selectedId, patch);
    if (patch.visible === undefined) setNewStyle((s) => ({ ...s, ...patch }));
  };
  const exitDrawing = () => { setDrawMode('idle'); setDrawTool(null); setSelectedId(null); };
  const indicatorPanelProps = {
    indicators,
    onAdd: (kind) => addIndicator(kind),
    onUpdate: updateIndicator,
    onSaveNow: saveIndicator,
    onRemove: removeIndicator,
    onClear: clearIndicators,
    onClose: () => setIndPanel(false),
  };
  const drawingPanelProps = {
    tool: drawTool, mode: drawMode, drawings, selectedId, hideAll,
    onPick: pickTool,
    onClose: () => setDrawPanel(false),
    onToggleHideAll: () => setHideAll((v) => !v),
    onClear: () => { clear(); setSelectedId(null); },
    onSelect: (id) => setSelectedId(id),
    onToggleVisible: (id) => {
      const d = drawings.find((x) => x.id === id);
      update(id, { visible: d?.visible === false });
    },
    onRemove: (id) => { remove(id); if (id === selectedId) setSelectedId(null); },
  };

  // Chart lifecycle — created once.
  useEffect(() => {
    // Touch devices (mobile/tablet) don't have a mouse — the crosshair follows
    // the finger which is confusing, so hide it entirely on hover-less devices.
    const isTouchDevice = typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(hover: none)').matches;
    touchDeviceRef.current = isTouchDevice;
    const chart = createChart(wrapRef.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: 'rgba(255,255,255,0.55)', fontSize: 11, attributionLogo: false },
      localization: { locale: 'en-US' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      timeScale: { timeVisible: true, secondsVisible: true, borderColor: 'rgba(255,255,255,0.08)', rightOffset: BASE_RIGHT_OFFSET, barSpacing: (wrapRef.current?.clientWidth || 900) < 700 ? 12 : 22, minBarSpacing: 3, maxBarSpacing: 58 },
      // autoScale stays ON so the price range is always fitted to the candles —
      // that keeps the chart vertically locked (no up/down drift). Vertical
      // "zoom" is done purely through scaleMargins (see the axis drag below).
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)', autoScale: true, scaleMargins: { top: 0.1, bottom: 0.1 } },
      // Smooth momentum on touch flick + pinch zoom on mobile, and mouse-wheel/
      // press-drag on desktop. Clamp code below re-enforces the 50% rule every
      // frame so kinetic overshoot cannot escape it.
      kineticScroll: { touch: true, mouse: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: { time: true, price: false }, mouseWheel: true, pinch: true },
      crosshair: {
        // Always Hidden (2) — the canvas crosshair only repainted with the chart's
        // own render pass, so it trailed the pointer. A DOM crosshair (see the
        // pointer handler below) is driven straight off pointerrawupdate and moves
        // in the compositor, so it stays glued to the cursor with zero latency.
        mode: 2,
        vertLine: { visible: false, labelVisible: false },
        horzLine: { visible: false, labelVisible: false },
      },
    });
    chartRef.current = chart;
    hostSizeRef.current = { w: wrapRef.current?.clientWidth || 0, h: wrapRef.current?.clientHeight || 0 };
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) hostSizeRef.current = { w: r.width, h: r.height };
    });
    ro.observe(wrapRef.current);
    // Lazy history — when the user pans near the oldest loaded candle, fetch 500 more.
    // Right-pan clamp — the newest candle can be pushed left up to the WRAPPER's
    // 50% mark (visual middle including the right price-axis); any further and we
    // snap it back so at least half the visible chart always shows candles.
    //
    // Two-tier enforcement:
    //  1) subscribeVisibleLogicalRangeChange — catches range changes from mouse/wheel/touch drag.
    //  2) A continuous RAF loop below — pulls the chart back every frame while
    //     kinetic momentum is trying to slide past the limit, so momentum can
    //     never win against the clamp even on flaky mobile browsers.
    // How many bars the range currently sits past the left-pan limit (0 when inside it).
    const panExcessBars = (range) => {
      if (!range || !readyRef.current) return 0;
      const N = dataRef.current.length;
      if (!N) return 0;
      const visible = range.to - range.from;
      if (visible <= 0) return 0;
      const ts = chart.timeScale();
      const paneW = ts.width() || 0;
      const wrapperW = hostSizeRef.current.w || paneW;
      if (paneW <= 0) return 0;
      const maxRightOffsetBars = (Math.max(0, paneW - wrapperW / 2) / paneW) * visible;
      const excess = (range.to - (N - 1)) - maxRightOffsetBars;
      return excess > 0 ? excess : 0;
    };
    const clampToLimit = (range) => {
      const excess = panExcessBars(range);
      // Tolerance of 0.05 bars stops us from re-firing forever on identical values.
      if (excess <= 0.05) return false;
      try {
        chart.timeScale().setVisibleLogicalRange({
          from: range.from - excess,
          to: range.to - excess,
        });
      } catch (e) { /* noop */ }
      return true;
    };
    const onRange = (range) => {
      if (!range || !readyRef.current) return;
      if (!loadingOlderRef.current && hasMoreRef.current && range.from < 15) loadOlderRef.current();
      clampToLimit(range);
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    // Resume the smooth live follow as soon as the user parks back near the live
    // edge (and stop fighting them while they are browsing history).
    const onUserEnd = () => {
      const range = chart.timeScale().getVisibleLogicalRange();
      const N = dataRef.current.length;
      if (!range || !N) return;
      const maxBars = maxRightBarsRef.current?.() ?? Infinity;
      const edge = Math.min(BASE_RIGHT_OFFSET, Math.max(1, maxBars - 1.5));
      // Re-engage the live follow ONLY when the newest candle is still parked near
      // the right edge. Panning left into history (offset goes negative) must never
      // yank the view back to the live edge.
      const off = range.to - (N - 1);
      followRef.current = off >= 0 && off <= edge + 2.5;
    };
    const wrapEl = wrapRef.current;
    // Let the user drag freely: pause the follow while the pointer is down, then
    // decide on release whether they parked back at the live edge.
    const onUserStart = () => { followRef.current = false; };
    wrapEl?.addEventListener('pointerdown', onUserStart);
    wrapEl?.addEventListener('pointerup', onUserEnd);
    wrapEl?.addEventListener('pointercancel', onUserEnd);
    wrapEl?.addEventListener('wheel', onUserEnd, { passive: true });
    // ── Price axis drag — shrink only ────────────────────────────────────────
    // Dragging the right price bar DOWN compresses the candles; dragging UP only
    // undoes that compression back to the default (candles can never be blown up
    // bigger than the auto-fitted size). Margins move symmetrically so the chart
    // never slides up/down while scaling.
    const PRICE_MARGIN_BASE = 0.1;
    const PRICE_MARGIN_MAX = 0.42;
    let priceMargin = PRICE_MARGIN_BASE;
    let axisDrag = null;
    const onAxisDown = (e) => {
      if (!wrapEl) return;
      const rect = wrapEl.getBoundingClientRect();
      const axisW = chart.priceScale('right').width() || 0;
      if (e.clientX < rect.right - axisW - 2) return;
      axisDrag = { y: e.clientY, m: priceMargin };
    };
    const onAxisMove = (e) => {
      if (!axisDrag) return;
      const h = wrapEl?.clientHeight || 1;
      const next = Math.min(PRICE_MARGIN_MAX, Math.max(PRICE_MARGIN_BASE, axisDrag.m + ((e.clientY - axisDrag.y) / h)));
      if (next === priceMargin) return;
      priceMargin = next;
      chart.priceScale('right').applyOptions({ scaleMargins: { top: next, bottom: next } });
    };
    const onAxisUp = () => { axisDrag = null; };
    // Restore the classic vertical-resize cursor while hovering the price bar
    // (the library only shows it when its own axis scaling is enabled, which we
    // replaced with the shrink-only drag above).
    let cursorEl = null;
    const clearAxisCursor = () => {
      if (cursorEl) { cursorEl.style.removeProperty('cursor'); cursorEl = null; }
    };
    const onAxisHover = (e) => {
      if (!wrapEl) return;
      const rect = wrapEl.getBoundingClientRect();
      const axisW = chart.priceScale('right').width() || 0;
      const inAxis = e.clientX >= rect.right - axisW - 2 && e.clientX <= rect.right
        && e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (!inAxis) return clearAxisCursor();
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (!el || el === cursorEl) return;
      clearAxisCursor();
      cursorEl = el;
      el.style.setProperty('cursor', 'ns-resize', 'important');
    };
    wrapEl?.addEventListener('pointerdown', onAxisDown);
    wrapEl?.addEventListener('pointermove', onAxisHover);
    wrapEl?.addEventListener('pointerleave', clearAxisCursor);
    window.addEventListener('pointermove', onAxisMove);
    window.addEventListener('pointerup', onAxisUp);
    window.addEventListener('pointercancel', onAxisUp);
    // While a drag/fling pushes past the limit, the series keeps painting at the
    // clamped position but timeScale coordinates still report the over-panned
    // range for a frame — overlays that convert time→pixel would draw shifted
    // left. Expose that gap in pixels so they can cancel it out.
    panExcessPxRef.current = () => {
      const ts = chart.timeScale();
      const range = ts.getVisibleLogicalRange();
      const excess = panExcessBars(range);
      if (!excess) return 0;
      const visible = range.to - range.from;
      const paneW = ts.width() || 0;
      if (visible <= 0 || paneW <= 0) return 0;
      return (excess / visible) * paneW;
    };
    // Largest right offset (in bars) the pan lock allows — the live-follow scroll
    // must stay inside it, otherwise the clamp and the follow fight each other and
    // the chart freezes (narrow/mobile panes hit this).
    maxRightBarsRef.current = () => {
      const ts = chart.timeScale();
      const range = ts.getVisibleLogicalRange();
      if (!range) return Infinity;
      const visible = range.to - range.from;
      const paneW = ts.width() || 0;
      const wrapperW = hostSizeRef.current.w || paneW;
      if (visible <= 0 || paneW <= 0) return Infinity;
      return (Math.max(0, paneW - wrapperW / 2) / paneW) * visible;
    };
    // Continuous clamp loop — enforces the 50% limit against kinetic momentum
    // frame-by-frame; kinetic scroll stays ON so scrolling still feels smooth.
    let clampRaf = 0;
    const clampLoop = () => {
      if (chartRef.current) {
        const range = chartRef.current.timeScale().getVisibleLogicalRange();
        clampToLimit(range);
      }
      clampRaf = requestAnimationFrame(clampLoop);
    };
    clampRaf = requestAnimationFrame(clampLoop);
    const t = setInterval(() => {
      setLocalClock(new Date().toLocaleTimeString('en-GB'));
    }, 1000);
    return () => { ro.disconnect(); cancelAnimationFrame(clampRaf); clearInterval(t); panExcessPxRef.current = null; wrapEl?.removeEventListener('pointerup', onUserEnd); wrapEl?.removeEventListener('pointerdown', onUserStart); wrapEl?.removeEventListener('pointercancel', onUserEnd); wrapEl?.removeEventListener('wheel', onUserEnd); wrapEl?.removeEventListener('pointerdown', onAxisDown); wrapEl?.removeEventListener('pointermove', onAxisHover); wrapEl?.removeEventListener('pointerleave', clearAxisCursor); clearAxisCursor(); window.removeEventListener('pointermove', onAxisMove); window.removeEventListener('pointerup', onAxisUp); window.removeEventListener('pointercancel', onAxisUp); chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, []);

  // ── DOM crosshair ─────────────────────────────────────────────────────────
  // Painted as absolutely-positioned divs and moved with a transform straight
  // inside the pointer handler (pointerrawupdate when available), so it never
  // waits for the chart's canvas render pass. This is what removes the lag.
  useEffect(() => {
    const host = wrapRef.current;
    if (!host) return undefined;
    const refreshRect = () => { hostRectRef.current = host.getBoundingClientRect(); };
    const hide = () => {
      setVis(chVertRef.current, 'hidden');
      setVis(chHorzRef.current, 'hidden');
      setVis(chPriceRef.current, 'hidden');
      setVis(chTimeRef.current, 'hidden');
    };
    const move = (e) => {
      if (touchDeviceRef.current || e.pointerType === 'touch') return;
      const rect = hostRectRef.current;
      const chart = chartRef.current;
      const s = seriesRef.current;
      if (!rect || !chart || !s) return;
      const ts = chart.timeScale();
      const paneW = ts.width() || 0;
      const paneH = Math.max(0, (hostSizeRef.current.h || rect.height) - (ts.height() || 0));
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > paneW || y > paneH) { hide(); return; }
      setVis(chVertRef.current, 'visible');
      setStyle(chVertRef.current, 'height', `${Math.round(paneH)}px`);
      setXform(chVertRef.current, `translate3d(${x}px,0,0)`);
      setVis(chHorzRef.current, 'visible');
      setStyle(chHorzRef.current, 'width', `${Math.round(paneW)}px`);
      setXform(chHorzRef.current, `translate3d(0,${y}px,0)`);
      const pl = chPriceRef.current;
      const price = s.coordinateToPrice(y);
      if (pl && price !== null && price !== undefined) {
        const txt = Number(price).toFixed(digitsRef.current);
        if (pl.textContent !== txt) pl.textContent = txt;
        setVis(pl, 'visible');
        setXform(pl, `translate3d(0,${y}px,0) translateY(-50%)`);
      } else if (pl) {
        setVis(pl, 'hidden');
      }
      const tl = chTimeRef.current;
      if (tl) {
        const logical = ts.coordinateToLogical(x);
        const arr = dataRef.current;
        const N = arr.length;
        let stamp = null;
        if (logical !== null && logical !== undefined && N) {
          const i = Math.round(logical);
          stamp = i >= 0 && i < N ? arr[i].time : arr[N - 1].time + (i - (N - 1)) * tfRef.current;
        }
        if (stamp) {
          const txt = new Date(stamp * 1000).toLocaleTimeString('en-GB', { hour12: false });
          if (tl.textContent !== txt) tl.textContent = txt;
          setVis(tl, 'visible');
          const w = measure(tl, 56).w || 56;
          const cx = Math.max(0, Math.min(x - w / 2, Math.max(0, paneW - w)));
          setXform(tl, `translate3d(${cx}px,${Math.round(paneH + 3)}px,0)`);
        } else {
          setVis(tl, 'hidden');
        }
      }
    };
    refreshRect();
    const moveEvt = 'onpointerrawupdate' in host ? 'pointerrawupdate' : 'pointermove';
    host.addEventListener(moveEvt, move, { passive: true });
    host.addEventListener('pointerenter', refreshRect);
    host.addEventListener('pointerleave', hide);
    window.addEventListener('scroll', refreshRect, { passive: true });
    window.addEventListener('resize', refreshRect);
    return () => {
      host.removeEventListener(moveEvt, move);
      host.removeEventListener('pointerenter', refreshRect);
      host.removeEventListener('pointerleave', hide);
      window.removeEventListener('scroll', refreshRect);
      window.removeEventListener('resize', refreshRect);
    };
  }, []);


  // Series lifecycle — swapped when chart type changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (seriesRef.current) { try { chart.removeSeries(seriesRef.current); } catch (e) { /* noop */ } }
    const series = addSeriesOfType(chart, chartType);
    series.applyOptions({ priceFormat: { type: 'price', precision: digitsRef.current, minMove: 1 / 10 ** digitsRef.current } });
    series.setData(toSeriesData(dataRef.current, chartType));
    seriesRef.current = series;
  }, [chartType]);

  // Stale-data guard — a forced reload discards everything and refetches history.
  // Triggered when the tab comes back after being hidden, or when the live tick
  // jumps past a whole candle bucket (both used to bridge the gap with one giant
  // synthetic candle, which is what looked "wrong" until a manual refresh).
  const forceReloadRef = useRef(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reloadPendingRef = useRef(false);
  const requestReload = () => {
    if (reloadPendingRef.current) return;
    reloadPendingRef.current = true;
    forceReloadRef.current = true;
    readyRef.current = false;
    pendingTickRef.current = null;
    targetRef.current = null;
    lastCandleRef.current = null;
    setLoading(true);
    setReloadKey((k) => k + 1);
    setTimeout(() => { reloadPendingRef.current = false; }, 1200);
  };
  const requestReloadRef = useRef(requestReload);
  requestReloadRef.current = requestReload;

  // Refetch whenever the user returns to the tab after being away.
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      if (away > 3000) requestReloadRef.current?.();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // History loader — cache-first (instant switch), then network refresh.
  useEffect(() => {
    if (!seriesRef.current) return;
    let cancelled = false;
    readyRef.current = false;
    targetRef.current = null;
    pendingTickRef.current = null;
    seriesRef.current.applyOptions({ priceFormat: { type: 'price', precision: digits, minMove: 1 / 10 ** digits } });

    const cacheKey = `${symbol}|${tf}`;
    // A forced reload (tab was hidden / a candle gap was detected) must never
    // paint the stale cache — that is what showed wrong/oversized candles until
    // a manual refresh.
    const force = forceReloadRef.current;
    forceReloadRef.current = false;
    if (force) _candlesCache.delete(cacheKey);
    const cached = _candlesCache.get(cacheKey);
    const fresh = cached && Date.now() - cached.ts < 30000; // 30 s freshness window

    // Instantly paint from cache — this eliminates the "big first-candle" flash.
    if (cached) {
      dataRef.current = cached.data;
      volRef.current = robustStep(cached.data.map((c) => (c.open + c.close) / 2));
      seriesRef.current.setData(toSeriesData(cached.data, typeRef.current));
      lastCandleRef.current = cached.data[cached.data.length - 1] || null;
      readyRef.current = true;
      setLoading(false);
    } else {
      // No cache → clear chart and show skeleton until data arrives.
      dataRef.current = [];
      seriesRef.current.setData([]);
      lastCandleRef.current = null;
      setLoading(true);
    }

    if (!fresh) {
      // Fetch candles over Socket.IO — mirrors HTTP GET /api/market/candles but
      // nothing shows up in the browser Network tab (Quotex-style). If the
      // socket isn't ready yet, poll briefly then emit.
      const emitCandles = () => {
        const ws = wsRef?.current;
        if (!ws || !ws.connected) {
          setTimeout(emitCandles, 120);
          return;
        }
        ws.emit('candles/get', { symbol, tf, limit: 500 }, (data) => {
          if (cancelled || !seriesRef.current) return;
          if (!data || data.error) { setLoading(false); return; }
          const candles = sanitizeCandles(data.candles || []);
          volRef.current = robustStep(candles.map((c) => (c.open + c.close) / 2));
          _candlesCache.set(cacheKey, { data: candles, ts: Date.now() });
          dataRef.current = candles;
          seriesRef.current.setData(toSeriesData(candles, typeRef.current));
          lastCandleRef.current = candles[candles.length - 1] || null;
          chartRef.current?.timeScale().scrollToRealTime();
          followRef.current = true;
          readyRef.current = true;
          setLoading(false);
        });
      };
      emitCandles();
    }

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf, digits, chartType, reloadKey]); // chartType: re-sync after series swap. wsRef is a stable ref — safe to omit.

  // Live tick update — RAF-batched for butter-smooth candle animation.
  // Every tick lands in a ref; a single requestAnimationFrame loop applies the
  // latest state to the chart at the display's refresh rate (~60fps). This
  // decouples the render loop from tick frequency and eliminates jank caused
  // by React re-renders on every incoming tick.
  const symbolRef = useRef(symbol);
  const tfRef = useRef(tf);
  symbolRef.current = symbol;
  tfRef.current = tf;
  const pendingTickRef = useRef(null);
  const targetRef = useRef(null); // latest tick target the candle glides toward
  const lastFrameRef = useRef(0);
  const livePriceLineRef = useRef(null);
  const liveVertTopRef = useRef(null);
  const liveVertBotRef = useRef(null);
  const livePriceTagRef = useRef(null);
  const liveCountdownRef = useRef(null);
  // DOM crosshair — moves straight off the pointer event (no canvas repaint).
  const chVertRef = useRef(null);
  const chHorzRef = useRef(null);
  const chPriceRef = useRef(null);
  const chTimeRef = useRef(null);
  const touchDeviceRef = useRef(false);
  const hostRectRef = useRef(null);
  // Server clock anchor (from the tick stream) + live-edge follow state.
  const serverClockRef = useRef(null);
  const followRef = useRef(true);
  const browsingRef = useRef(false);
  const [browsingHistory, setBrowsingHistory] = useState(false);
  const jumpToLive = () => {
    const ts = chartRef.current?.timeScale();
    if (!ts) return;
    try { ts.scrollToRealTime(); } catch (e) { /* noop */ }
    followRef.current = true;
  };
  const serverNow = () => {
    const a = serverClockRef.current;
    if (!a) return Date.now() / 1000;
    return a.t + (performance.now() - a.at) / 1000;
  };

  useEffect(() => {
    if (!lastTick || lastTick.symbol !== symbol) return;
    // Outlier guard — reject non-positive prices and wild jumps (>15% off the last
    // rendered candle close). Stray corrupt socket frames were creating "floating"
    // candles far below the main price cluster (see bug 2026-07-28).
    if (!(lastTick.price > 0)) return;
    const lcNow = lastCandleRef.current;
    if (lcNow && lcNow.close > 0) {
      // Volatility-aware band: 20x the pair's own typical bar move, never tighter
      // than 0.3% of price. The old fixed 15% gate was far too loose for FX pairs,
      // so a corrupt frame ~3-5% off could still spawn a "floating" candle.
      const base = volRef.current > 0 ? volRef.current : lcNow.close * 0.0002;
      const limit = Math.max(20 * base, lcNow.close * 0.003);
      if (Math.abs(lastTick.price - lcNow.close) > limit) {
        tickRejectRef.current += 1;
        // Escape hatch — if the feed genuinely repriced, stop rejecting after a
        // sustained run of out-of-band ticks so the chart never freezes.
        if (tickRejectRef.current < 15) return;
      }
      tickRejectRef.current = 0;
    }
    // Merge into pending; keep hi/lo across ticks so nothing is lost between frames.
    serverClockRef.current = { t: lastTick.t, at: performance.now() };
    const prev = pendingTickRef.current;
    if (prev && prev.symbol === lastTick.symbol) {
      pendingTickRef.current = {
        symbol: lastTick.symbol,
        t: lastTick.t,
        price: lastTick.price,
        hi: Math.max(prev.hi, lastTick.price),
        lo: Math.min(prev.lo, lastTick.price),
      };
    } else {
      pendingTickRef.current = { symbol: lastTick.symbol, t: lastTick.t, price: lastTick.price, hi: lastTick.price, lo: lastTick.price };
    }
  }, [lastTick, symbol]);

  useEffect(() => {
    let raf;
    const drain = (now) => {
      const s = seriesRef.current;
      const tfNow = tfRef.current;
      const dt = Math.min(100, now - (lastFrameRef.current || now));
      lastFrameRef.current = now;

      // 1) Absorb the newest tick into the glide target (no direct jump).
      const tick = pendingTickRef.current;
      if (readyRef.current && tick && tick.symbol === symbolRef.current) {
        pendingTickRef.current = null;
        const bucket = Math.floor(tick.t / tfNow) * tfNow;
        const tgt = targetRef.current;
        targetRef.current = (tgt && tgt.symbol === tick.symbol && tgt.bucket === bucket)
          ? { symbol: tick.symbol, bucket, price: tick.price, hi: Math.max(tgt.hi, tick.hi), lo: Math.min(tgt.lo, tick.lo) }
          : { symbol: tick.symbol, bucket, price: tick.price, hi: tick.hi, lo: tick.lo };
      }

      // 2) Every frame: ease the displayed close toward the target price.
      //    Exponential smoothing → continuous, alive, tick-by-tick glide (Quotex feel).
      const tgt = targetRef.current;
      if (s && readyRef.current && tgt && tgt.symbol === symbolRef.current) {
        const type = typeRef.current;
        let lc = lastCandleRef.current;
        if (lc && tgt.bucket - lc.time > tfNow) {
          // A whole bucket (or more) is missing — the tab was throttled/hidden or
          // the feed stalled. Bridging the gap with one synthetic candle produced
          // the oversized/wrong candle; refetch the real history instead.
          requestReloadRef.current?.();
          raf = requestAnimationFrame(drain);
          return;
        }
        if (!lc || tgt.bucket > lc.time) {
          const open = lc ? lc.close : tgt.price;
          lc = { time: tgt.bucket, open, high: open, low: open, close: open };
          lastCandleRef.current = lc;
          dataRef.current.push(lc);
        }
        if (lc.time === tgt.bucket) {
          const diff = tgt.price - lc.close;
          const snap = 1 / 10 ** (digitsRef.current + 1);
          const alpha = 1 - Math.exp(-dt / 220); // ~220ms glide constant
          const next = Math.abs(diff) <= snap ? tgt.price : lc.close + diff * alpha;
          if (next !== lc.close || lc.high < next || lc.low > next) {
            lc.close = next;
            lc.high = Math.max(lc.high, next);
            lc.low = Math.min(lc.low, next);
            s.update(type === 'line' || type === 'area' ? { time: lc.time, value: lc.close } : { ...lc });
          }
        }
      }
      // Live price line + tag — Quotex-style, tracks last candle close every frame.
      const ts = chartRef.current?.timeScale();
      const lc = lastCandleRef.current;
      const line = livePriceLineRef.current;
      const vTop = liveVertTopRef.current;
      const vBot = liveVertBotRef.current;
      const tag = livePriceTagRef.current;
      if (s && ts && lc && line && vTop && vBot && tag) {
        const y = s.priceToCoordinate(lc.close);
        if (y !== null && y !== undefined) {
          const up = lc.close >= lc.open;
          setVis(line, 'visible');
          setXform(line, `translate3d(0,${y - 0.5}px,0)`);
          setStyle(line, 'width', `${Math.max(0, Math.round(ts.width() || 0))}px`);
          const x = ts.timeToCoordinate(lc.time);
          const yHi = s.priceToCoordinate(lc.high);
          const yLo = s.priceToCoordinate(lc.low);
          if (x !== null && x !== undefined && yHi !== null && yLo !== null) {
            const gap = 7; // breathing gap above/below the candle
            setVis(vTop, 'visible');
            setXform(vTop, `translate3d(${x - 0.5}px,0,0)`);
            setStyle(vTop, 'height', `${Math.max(0, Math.round(yHi - gap))}px`);
            setVis(vBot, 'visible');
            const hostH = hostSizeRef.current.h || 0;
            setXform(vBot, `translate3d(${x - 0.5}px,${Math.round(yLo + gap)}px,0)`);
            setStyle(vBot, 'height', `${Math.max(0, Math.round(hostH - (yLo + gap)))}px`);
          } else {
            setVis(vTop, 'hidden');
            setVis(vBot, 'hidden');
          }
          setVis(tag, 'visible');
          setXform(tag, `translate3d(0,${y}px,0) translateY(-50%)`);
          setStyle(tag, 'background', up ? '#14b877' : '#f43f5e');
          const px = Number(lc.close).toFixed(digitsRef.current);
          if (tag.textContent !== px) tag.textContent = px;
          // Candle countdown — sits with the running candle and counts it down.
          const cd = liveCountdownRef.current;
          if (cd) {
            const left = Math.max(0, Math.ceil(lc.time + tfNow - serverNow()));
            const mm = String(Math.floor(left / 60)).padStart(2, '0');
            const ss = String(left % 60).padStart(2, '0');
            const txt = `${mm}:${ss}`;
            if (cd.textContent !== txt) cd.textContent = txt;
            if (x !== null && x !== undefined) {
              const paneW = ts.width() || 0;
              const w = measure(cd, 40).w || 40;
              // Sits detached from the running candle — ~1 bar to its right,
              // parked on the live price line (Quotex-style).
              const bs = ts.options()?.barSpacing || 22;
              const offset = Math.max(18, bs);
              setVis(cd, 'visible');
              const cx = Math.max(2, Math.min(x + offset, paneW - w - 2));
              setXform(cd, `translate3d(${cx}px,${y}px,0) translateY(-50%)`);
            } else {
              setVis(cd, 'hidden');
            }
          }
        } else {
          setVis(line, 'hidden');
          setVis(vTop, 'hidden');
          setVis(vBot, 'hidden');
          setVis(tag, 'hidden');
          setVis(liveCountdownRef.current, 'hidden');
        }
      }

      // Continuous live scroll — slide the view by the fraction of the bar that
      // has elapsed so the chart drifts smoothly instead of jumping a whole bar
      // when a new candle opens. Only while the user is parked at the live edge.
      if (ts && readyRef.current && lc && dataRef.current.length) {
        const wrapEl2 = wrapRef.current;
        if (wrapEl2) wrapEl2.dataset.liveFollow = followRef.current ? '1' : '0';
        // Show the jump-to-live arrow only while the newest candle is off to the
        // right of the viewport (i.e. the user is browsing history).
        const range = ts.getVisibleLogicalRange();
        const off = range ? range.to - (dataRef.current.length - 1) : 0;
        const browsing = !followRef.current && off < 0;
        if (browsing !== browsingRef.current) {
          browsingRef.current = browsing;
          setBrowsingHistory(browsing);
        }
      }
      // Live edge follow — the view stays FIXED while the current candle is
      // forming (no continuous right-drift); it only shifts by one bar the moment
      // a new candle opens, and only while the user is parked at the live edge.
      if (ts && readyRef.current && lc && followRef.current && dataRef.current.length) {
        const range = ts.getVisibleLogicalRange();
        if (range) {
          const maxBars = maxRightBarsRef.current?.() ?? Infinity;
          const baseOff = Math.min(BASE_RIGHT_OFFSET, Math.max(1, maxBars - 1.5));
          const want = Math.min(baseOff, Math.max(1, maxBars - 0.2));
          const cur = range.to - (dataRef.current.length - 1);
          if (Math.abs(cur - want) > 0.05) {
            try { ts.scrollToPosition(want, false); } catch (e) { /* noop */ }
          }
        }
      }
      raf = requestAnimationFrame(drain);
    };
    raf = requestAnimationFrame(drain);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Older-history loader — Quotex-style chunked pagination (500 per request).
  loadOlderRef.current = async () => {
    const first = dataRef.current[0];
    if (!first || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const t0 = Date.now();
    const sym = symbolRef.current;
    const tfNow = tfRef.current;
    try {
      // Older-history over Socket.IO — same event, same shape as the initial fetch.
      const data = await new Promise((resolve, reject) => {
        const ws = wsRef?.current;
        if (!ws || !ws.connected) { reject(new Error('socket-not-ready')); return; }
        const timer = setTimeout(() => reject(new Error('timeout')), 8000);
        ws.emit('candles/get', { symbol: sym, tf: tfNow, limit: 500, before: first.time }, (resp) => {
          clearTimeout(timer);
          if (!resp || resp.error) reject(new Error(resp?.error || 'server error'));
          else resolve(resp);
        });
      });
      const rawOlder = (data.candles || []).filter((c) => c.time < first.time);
      // Sanitize older candles against the current visible data's price band so
      // outlier rows (from earlier buggy backfill) don't reappear on pan-left.
      const combined = sanitizeCandles(rawOlder.concat(dataRef.current));
      const older = combined.filter((c) => c.time < first.time);
      hasMoreRef.current = rawOlder.length > 0 && data.has_more !== false;
      // Guard: pair / timeframe may have changed while the request was in flight.
      if (older.length && seriesRef.current && sym === symbolRef.current && tfNow === tfRef.current &&
          dataRef.current[0] && dataRef.current[0].time === first.time) {
        const merged = older.concat(dataRef.current);
        dataRef.current = merged;
        const ts = chartRef.current?.timeScale();
        const range = ts?.getVisibleLogicalRange();
        seriesRef.current.setData(toSeriesData(merged, typeRef.current));
        if (ts && range) ts.setVisibleLogicalRange({ from: range.from + older.length, to: range.to + older.length });
        _candlesCache.set(`${sym}|${tfNow}`, { data: merged, ts: Date.now(), hasMore: hasMoreRef.current });
      }
    } catch (e) { /* transient — user can scroll again */ }
    loadingOlderRef.current = false;
    setTimeout(() => setLoadingOlder(false), Math.max(0, 300 - (Date.now() - t0)));
  };

  // Entry price lines removed — trade badge on the chart marks the position instead.

  const tfLabel = (TF_LIST.find(([v]) => v === tf) || [0, '1m'])[1];

  // Overlay refresh tick — keeps trade badges + hover tint in sync with pan/zoom/ticks.
  const symTrades = (openTrades || []).filter((t) => t.symbol === symbol);
  const symTradesRef = useRef(symTrades);
  symTradesRef.current = symTrades;
  const [, setOverlayTick] = useState(0);
  useEffect(() => {
    if (!hoverDir && !symTrades.length) return;
    const i = setInterval(() => setOverlayTick((v) => v + 1), 250);
    return () => clearInterval(i);
  }, [hoverDir, symTrades.length]);

  // Hover tint — y coordinate of the live price line.
  const hoverY = hoverDir && seriesRef.current && lastCandleRef.current
    ? seriesRef.current.priceToCoordinate(lastCandleRef.current.close)
    : null;

  // Trade badges — compact "$amount mm:ss" pills anchored at the entry point.
  // React only owns the list + countdown text; placement happens frame-by-frame
  // in the RAF loop below so the pills stay glued to the chart while panning.
  const nowMs = Date.now();
  const badges = symTrades.filter((t) => t.entry_time).map((t) => {
    const remain = Math.max(0, Math.ceil((new Date(t.expiry_time).getTime() - nowMs) / 1000));
    const mm = String(Math.floor(remain / 60)).padStart(2, '0');
    const ss = String(remain % 60).padStart(2, '0');
    return { id: t.id, dir: t.direction, amount: t.amount, timeLeft: `${mm}:${ss}` };
  });

  // Frame-locked positioning — badges/dots follow chart coords on every zoom/pan
  // frame. Pills that would land on the same spot are laid out side by side (the
  // newest keeps the anchor, older ones march off to the LEFT) so every trade
  // stays fully readable instead of hiding behind the one in front.
  const badgeElsRef = useRef({});
  const badgeKey = symTrades.map((t) => t.id).join(',');
  useEffect(() => {
    if (!badgeKey) return undefined;
    let raf;
    const GAP = 5; // horizontal breathing room between neighbouring pills
    const loop = () => {
      const ts = chartRef.current?.timeScale();
      const s = seriesRef.current;
      if (ts && s) {
        const paneW = ts.width() || 0;
        const compact = paneW < 620; // phone-sized pane → tighter clustering box
        const boxW = compact ? 76 : 98;
        const boxH = compact ? 17 : 20;

        // 1) Resolve chart coordinates for every open trade on this symbol.
        const items = [];
        for (const t of symTradesRef.current) {
          const el = badgeElsRef.current[t.id];
          if (!el) continue;
          const bucket = Math.floor(new Date(t.entry_time).getTime() / 1000 / tf) * tf;
          const x = ts.timeToCoordinate(bucket);
          const y = s.priceToCoordinate(t.entry_price);
          const dot = badgeElsRef.current[`dot-${t.id}`];
          const line = badgeElsRef.current[`line-${t.id}`];
          const endDot = badgeElsRef.current[`enddot-${t.id}`];
          if (x === null || x === undefined || y === null || y === undefined) {
            setVis(el, 'hidden');
            setVis(dot, 'hidden');
            setVis(line, 'hidden');
            setVis(endDot, 'hidden');
            continue;
          }
          // Compute end-of-line coordinate = expiry time (clamped to visible pane).
          const expiryBucket = Math.floor(new Date(t.expiry_time).getTime() / 1000 / tf) * tf;
          let endX = ts.timeToCoordinate(expiryBucket);
          if (endX === null || endX === undefined) endX = paneW;
          endX = Math.max(x, Math.min(endX, paneW));
          if (line) {
            const lw = Math.max(0, endX - x);
            setVis(line, lw > 1 ? 'visible' : 'hidden');
            setXform(line, `translate3d(${x}px,${y - 0.5}px,0)`);
            setStyle(line, 'width', `${Math.round(lw)}px`);
          }
          if (endDot) {
            const showEnd = endX - x > 2 && endX < paneW - 1;
            setVis(endDot, showEnd ? 'visible' : 'hidden');
            setXform(endDot, `translate3d(${endX}px,${y}px,0) translate(-50%,-50%)`);
          }
          items.push({ t, el, dot, line, endDot, endX, x, y, time: new Date(t.entry_time).getTime() });
        }

        // 2) Group pills that would collide and spread the group horizontally.
        //    Every trade keeps its OWN entry dot + line + end-dot; when dots
        //    would coincide (same tf-bucket + same price), stack them vertically
        //    with a small offset so each trade is individually visible.
        items.sort((a, b) => a.x - b.x || a.y - b.y || a.time - b.time);
        let start = 0;
        for (let i = 1; i <= items.length; i += 1) {
          const brk = i === items.length
            || Math.abs(items[i].x - items[i - 1].x) > boxW * 0.62
            || Math.abs(items[i].y - items[i - 1].y) > boxH;
          if (!brk) continue;
          const cluster = items.slice(start, i).sort((a, b) => a.time - b.time);

          // Vertical stack offsets for coincident dots — group items by identical
          // (x rounded to bucket, y rounded to px) and spread them by 6px steps.
          const stackKey = new Map();
          for (const it of cluster) {
            const k = `${Math.round(it.x)}|${Math.round(it.y)}`;
            const idx = stackKey.get(k) || 0;
            it._stack = idx;
            stackKey.set(k, idx + 1);
          }

          let shift = 0; // px already consumed to the left of the anchor
          for (let k = cluster.length - 1; k >= 0; k -= 1) { // newest keeps the anchor
            const it = cluster[k];
            const cx = Math.min(Math.max(it.x, 12), Math.max(12, paneW - 4));
            setVis(it.el, 'visible');
            setXform(it.el, `translate3d(${cx - 10 - shift}px,${it.y}px,0) translate(-100%,-50%)`);
            setStyle(it.el, 'zIndex', String(20 - (cluster.length - 1 - k)));
            setStyle(it.el, 'opacity', '1');
            if (it.dot) {
              // Small +6px vertical step per stacked trade so overlapping dots
              // never merge into a single blob (Quotex-style multi-trade marker).
              const stackDy = (it._stack || 0) * 6;
              setVis(it.dot, 'visible');
              setXform(it.dot, `translate3d(${cx}px,${it.y + stackDy}px,0) translate(-50%,-50%)`);
              // Keep the line + end-dot glued to their own entry dot so each
              // trade's visual triple (dot → line → end-dot) stays coherent.
              if (stackDy && it.line && it.line.dataset.s_visibility === 'visible') {
                setXform(it.line, `translate3d(${it.x}px,${it.y + stackDy - 0.5}px,0)`);
              }
              if (stackDy && it.endDot && it.endDot.dataset.s_visibility === 'visible') {
                setXform(it.endDot, `translate3d(${it.endX}px,${it.y + stackDy}px,0) translate(-50%,-50%)`);
              }
            }
            shift += measure(it.el, boxW).w + GAP;
          }
          start = i;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [badgeKey, tf]);

  // Settled-trade result cards — anchored at the exit point, clamped to the pane.
  const symResults = (results || []).filter((r) => r.symbol === symbol);
  const resultKey = symResults.map((r) => r.id).join(',');
  const resultElsRef = useRef({});
  const symResultsRef = useRef(symResults);
  symResultsRef.current = symResults;
  useEffect(() => {
    if (!resultKey) return undefined;
    let raf;
    const loop = () => {
      const ts = chartRef.current?.timeScale();
      const s = seriesRef.current;
      const host = wrapRef.current;
      if (ts && s && host) {
        const paneW = ts.width() || hostSizeRef.current.w || 0;
        const paneH = hostSizeRef.current.h || 0;
        let slot = 0;
        for (const r of symResultsRef.current) {
          const el = resultElsRef.current[r.id];
          if (!el) continue;
          const m = measure(el, 158, 52);
          const w = m.w || 158;
          const h = m.h || 52;
          const stamp = new Date(r.expiry_time || r.closed_at || Date.now()).getTime();
          const x = ts.timeToCoordinate(Math.floor(stamp / 1000 / tf) * tf);
          const y = s.priceToCoordinate(Number(r.exit_price));
          const ax = (x === null || x === undefined) ? paneW - 18 : x;
          const ay = (y === null || y === undefined) ? paneH / 2 : y;
          let left = ax - 16 - w;
          if (left < 10) left = ax + 16; // not enough room on the left → flip right
          left = Math.max(8, Math.min(left, Math.max(8, paneW - w - 8)));
          const top = Math.max(h / 2 + 6, Math.min(ay + slot * (h + 8), Math.max(h / 2 + 6, paneH - h / 2 - 6)));
          setVis(el, 'visible');
          setXform(el, `translate3d(${left}px,${top}px,0) translateY(-50%)`);
          const dot = resultElsRef.current[`dot-${r.id}`];
          if (dot) {
            const onScreen = x !== null && x !== undefined && y !== null && y !== undefined;
            setVis(dot, onScreen ? 'visible' : 'hidden');
            if (onScreen) setXform(dot, `translate3d(${ax}px,${ay}px,0) translate(-50%,-50%)`);
          }
          slot += 1;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [resultKey, tf]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={wrapRef} className="absolute inset-0 z-[2]" data-testid="trade-chart" />

      {/* Jump back to the live edge — only while browsing history. */}
      {browsingHistory && (
        <button onClick={jumpToLive} data-testid="jump-to-live-button" data-chart-overlay="1"
                title="Back to live"
                className="absolute right-[68px] bottom-[46px] z-[40] h-9 w-9 flex items-center justify-center rounded-full border border-[#14b877]/45 bg-[#050f0a]/90 backdrop-blur-md text-[#14b877] shadow-[0_6px_20px_rgba(0,0,0,0.45)] transition-[transform,background-color,border-color] duration-200 hover:bg-[#14b877]/15 hover:border-[#14b877]/80 hover:scale-105 active:scale-95">
          <CaretRight size={16} weight="bold" />
        </button>
      )}

      {/* Drawing tools overlay — pointer-events only while drawing/editing. */}
      <DrawingLayer chartRef={chartRef} seriesRef={seriesRef} getData={() => dataRef.current}
                    tf={tf} drawings={drawings} mode={drawMode} tool={drawTool}
                    selectedId={selectedId} hideAll={hideAll} newStyle={newStyle}
                    panExcessPxRef={panExcessPxRef}
                    onSelect={setSelectedId} onCreate={handleCreate} onUpdate={update} />
      <IndicatorLayer chartRef={chartRef} getData={() => dataRef.current} tf={tf} indicators={indicators} />

      {/* Active drawing-mode chip */}
      {drawMode === 'draw' && (
        <div className="absolute right-2 top-2 z-[40] flex items-center gap-1.5 rounded-full bg-[#050f0a]/92 backdrop-blur-md border border-white/[0.1] pl-2.5 pr-1 py-1 text-[10.5px] font-bold text-white/75 shadow-[0_6px_20px_rgba(0,0,0,0.4)]"
             data-testid="drawing-mode-chip" data-chart-overlay="1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#14b877] animate-pulse" />
          {`${TOOL_MAP[drawTool]?.label || 'Drawing'} · ${TOOL_MAP[drawTool]?.points || 2} pts`}
          <button onClick={exitDrawing} data-testid="drawing-mode-exit"
                  className="h-5 w-5 flex items-center justify-center rounded-full text-white/55 hover:text-white hover:bg-white/[0.1]">
            <X size={12} weight="bold" />
          </button>
        </div>
      )}

      {selectedDrawing && (
        <DrawingStyleBar drawing={selectedDrawing} onChange={handleStyleChange}
                         onDuplicate={duplicateDrawing}
                         onRemove={() => { remove(selectedDrawing.id); setSelectedId(null); }}
                         onClose={() => setSelectedId(null)} />
      )}

      {drawPanel && isMobile && <DrawingPanel variant="mobile" {...drawingPanelProps} />}
      {indPanel && isMobile && <IndicatorPanel variant="mobile" {...indicatorPanelProps} />}

      {/* DOM crosshair — instant, pointer-driven (canvas crosshair is disabled). */}
      <div ref={chVertRef} data-testid="crosshair-vert"
           className="absolute left-0 top-0 z-[8] pointer-events-none"
           style={{ visibility: 'hidden', width: 1, background: 'rgba(255,255,255,0.35)', willChange: 'transform' }} />
      <div ref={chHorzRef} data-testid="crosshair-horz"
           className="absolute left-0 top-0 z-[8] pointer-events-none"
           style={{ visibility: 'hidden', height: 1, background: 'rgba(255,255,255,0.35)', willChange: 'transform' }} />
      <div ref={chPriceRef} data-testid="crosshair-price-label"
           className="absolute right-1 top-0 z-[9] pointer-events-none px-1.5 py-[2px] text-[10.5px] font-semibold tabular-nums text-white/90 rounded-[3px]"
           style={{ visibility: 'hidden', background: 'rgba(38,48,44,0.95)', willChange: 'transform' }} />
      <div ref={chTimeRef} data-testid="crosshair-time-label"
           className="absolute left-0 top-0 z-[9] pointer-events-none px-1.5 py-[2px] text-[10.5px] font-semibold tabular-nums text-white/90 rounded-[3px] whitespace-nowrap"
           style={{ visibility: 'hidden', background: 'rgba(38,48,44,0.95)', willChange: 'transform' }} />

      {/* Live price line — hyphen-dash horizontal at current price (Quotex-style). */}
      <div ref={livePriceLineRef} data-testid="live-price-line"
           className="absolute left-0 z-[4] pointer-events-none"
           style={{ visibility: 'hidden', top: 0, height: 1, background: 'repeating-linear-gradient(to right, rgba(255,255,255,0.75) 0 6px, transparent 6px 11px)', willChange: 'transform' }} />

      {/* Live vertical line — hyphen-dash, split with a gap above & below the candle. */}
      <div ref={liveVertTopRef} data-testid="live-vert-line-top"
           className="absolute top-0 z-[4] pointer-events-none"
           style={{ visibility: 'hidden', top: 0, width: 1, background: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.75) 0 6px, transparent 6px 11px)', willChange: 'transform' }} />
      <div ref={liveVertBotRef} data-testid="live-vert-line-bottom"
           className="absolute top-0 z-[4] pointer-events-none"
           style={{ visibility: 'hidden', width: 1, background: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.75) 0 6px, transparent 6px 11px)', willChange: 'transform' }} />

      {/* Live price tag — floats on the right axis with current price. */}
      <div ref={livePriceTagRef} data-testid="live-price-tag"
           className="absolute right-1 z-[7] pointer-events-none px-1.5 py-[2px] text-[10.5px] font-bold tabular-nums text-white rounded-[3px] shadow-[0_2px_6px_rgba(0,0,0,0.4)]"
           style={{ visibility: 'hidden', top: 0, transform: 'translateY(-50%)', background: '#14b877', willChange: 'transform' }} />

      {/* Candle countdown — time left before the live bar closes (Quotex-style).
          z-12 keeps it above the drawing canvas (z-8) so tool lines never cover it. */}
      <div ref={liveCountdownRef} data-testid="candle-countdown"
           className="absolute z-[12] pointer-events-none px-1.5 py-[2px] text-[10.5px] font-bold tabular-nums text-white/90 rounded-[3px] border border-white/10 shadow-[0_2px_6px_rgba(0,0,0,0.45)]"
           style={{ visibility: 'hidden', transform: 'translateY(-50%)', left: 0, top: 0, background: 'rgba(11,22,17,0.92)', willChange: 'transform' }} />

      {/* Hover tint — green above price for UP, red below for DOWN (Quotex-style). */}
      {hoverY !== null && hoverY !== undefined && (
        <div className="absolute inset-x-0 z-[5] pointer-events-none" data-testid={`hover-zone-${hoverDir}`}
             style={hoverDir === 'higher'
               ? { top: 0, height: Math.max(0, hoverY), background: 'linear-gradient(to top, rgba(20,184,119,0.20), rgba(20,184,119,0.05))', borderBottom: '1px dashed rgba(20,184,119,0.55)' }
               : { top: Math.max(0, hoverY), bottom: 0, background: 'linear-gradient(to bottom, rgba(244,63,94,0.20), rgba(244,63,94,0.05))', borderTop: '1px dashed rgba(244,63,94,0.55)' }}>
          <span className={`absolute right-24 ${hoverDir === 'higher' ? 'bottom-3 text-[#14b877]' : 'top-3 text-[#f43f5e]'}`}>
            {hoverDir === 'higher'
              ? <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" style={{ filter: 'drop-shadow(0 2px 6px rgba(20,184,119,0.6))' }}><path d="M5 17L17 5M17 5H9M17 5v8" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
              : <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" style={{ filter: 'drop-shadow(0 2px 6px rgba(244,63,94,0.6))' }}><path d="M5 7l12 12M17 19H9M17 19v-8" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>}
          </span>
        </div>
      )}

      {/* Open-trade badges — compact gradient "$amount mm:ss" pills at the entry
         point. Overlapping pills are fanned out as a card deck by the RAF loop. */}
      {badges.map((b) => (
        <div key={b.id} data-testid={`trade-badge-${b.id}`}
             ref={(el) => { badgeElsRef.current[b.id] = el; }}
             className="bfg-trade-badge absolute pointer-events-none flex items-center gap-[3px] rounded-[7px] pl-[3px] pr-[5px] py-[2px] text-[9.5px] sm:text-[10.5px] font-bold tabular-nums whitespace-nowrap text-white"
             style={{
               visibility: 'hidden', left: 0, top: 0, zIndex: 20,
               transform: 'translate(-100%, -50%)',
               background: b.dir === 'higher'
                 ? 'linear-gradient(135deg,#2fe19c 0%,#12b877 48%,#0a7d51 100%)'
                 : 'linear-gradient(135deg,#ff8ba1 0%,#f2536d 48%,#c3183f 100%)',
               border: '1px solid rgba(255,255,255,0.2)',
               boxShadow: b.dir === 'higher'
                 ? '0 4px 12px -3px rgba(8,110,71,0.8), inset 0 1px 0 rgba(255,255,255,0.28)'
                 : '0 4px 12px -3px rgba(170,20,55,0.8), inset 0 1px 0 rgba(255,255,255,0.28)',
             }}>
          <span className="flex h-[13px] w-[13px] shrink-0 items-center justify-center rounded-full bg-black/25">
            {b.dir === 'higher'
              ? <svg width="8" height="8" viewBox="0 0 24 24"><path d="M12 4l7 8h-4v8h-6v-8H5z" fill="currentColor"/></svg>
              : <svg width="8" height="8" viewBox="0 0 24 24"><path d="M12 20l-7-8h4V4h6v8h4z" fill="currentColor"/></svg>}
          </span>
          ${Number(b.amount).toFixed(2)}
          <span className="font-semibold opacity-85">{b.timeLeft}</span>
        </div>
      ))}
      {/* Entry point dot — small radial-gradient sphere, one per open trade. */}
      {badges.map((b) => (
        <span key={`dot-${b.id}`} ref={(el) => { badgeElsRef.current[`dot-${b.id}`] = el; }}
              data-testid={`trade-entry-dot-${b.id}`}
              className="absolute z-[6] pointer-events-none h-[7px] w-[7px] sm:h-[8px] sm:w-[8px] rounded-full"
              style={{
                visibility: 'hidden', left: 0, top: 0, transform: 'translate(-50%, -50%)',
                background: b.dir === 'higher'
                  ? 'radial-gradient(circle at 30% 30%, #b4ffdc 0%, #2fe19c 35%, #12b877 70%, #0a7d51 100%)'
                  : 'radial-gradient(circle at 30% 30%, #ffd1da 0%, #ff8ba1 35%, #f2536d 70%, #c3183f 100%)',
                boxShadow: b.dir === 'higher'
                  ? '0 0 0 1.5px #04100b, 0 0 6px 1px rgba(20,184,119,0.55)'
                  : '0 0 0 1.5px #04100b, 0 0 6px 1px rgba(244,63,94,0.55)',
              }} />
      ))}
      {/* Entry price line — horizontal segment from entry dot extending to expiry
         time, one per open trade. Colour matches the trade direction. */}
      {badges.map((b) => (
        <span key={`line-${b.id}`} ref={(el) => { badgeElsRef.current[`line-${b.id}`] = el; }}
              data-testid={`trade-entry-line-${b.id}`}
              className="absolute z-[5] pointer-events-none"
              style={{
                visibility: 'hidden', left: 0, top: 0, height: '1px',
                transform: 'translateY(-0.5px)',
                background: b.dir === 'higher'
                  ? 'linear-gradient(to right, rgba(20,184,119,0.85) 0%, rgba(20,184,119,0.55) 100%)'
                  : 'linear-gradient(to right, rgba(244,63,94,0.85) 0%, rgba(244,63,94,0.55) 100%)',
                boxShadow: b.dir === 'higher'
                  ? '0 0 4px rgba(20,184,119,0.45)'
                  : '0 0 4px rgba(244,63,94,0.45)',
              }} />
      ))}
      {/* End dot at expiry — same style as the entry dot so both ends match. */}
      {badges.map((b) => (
        <span key={`enddot-${b.id}`} ref={(el) => { badgeElsRef.current[`enddot-${b.id}`] = el; }}
              data-testid={`trade-end-dot-${b.id}`}
              className="absolute z-[6] pointer-events-none h-[7px] w-[7px] sm:h-[8px] sm:w-[8px] rounded-full"
              style={{
                visibility: 'hidden', left: 0, top: 0, transform: 'translate(-50%, -50%)',
                background: b.dir === 'higher'
                  ? 'radial-gradient(circle at 30% 30%, #b4ffdc 0%, #2fe19c 35%, #12b877 70%, #0a7d51 100%)'
                  : 'radial-gradient(circle at 30% 30%, #ffd1da 0%, #ff8ba1 35%, #f2536d 70%, #c3183f 100%)',
                boxShadow: b.dir === 'higher'
                  ? '0 0 0 1.5px #04100b, 0 0 6px 1px rgba(20,184,119,0.55)'
                  : '0 0 0 1.5px #04100b, 0 0 6px 1px rgba(244,63,94,0.55)',
              }} />
      ))}

      {/* Settled-trade result (P/L) cards + the marker dot on the closing candle */}
      {symResults.map((r) => (
        <span key={`rdot-${r.id}`} ref={(el) => { resultElsRef.current[`dot-${r.id}`] = el; }}
              data-testid={`trade-result-dot-${r.id}`}
              className="absolute z-[29] pointer-events-none h-[7px] w-[7px] sm:h-[8px] sm:w-[8px] rounded-full"
              style={{
                visibility: 'hidden', left: 0, top: 0, transform: 'translate(-50%, -50%)',
                background: r.status === 'won'
                  ? 'radial-gradient(circle at 30% 30%, #b4ffdc 0%, #2fe19c 35%, #17b077 70%, #0a7d51 100%)'
                  : r.status === 'lost'
                    ? 'radial-gradient(circle at 30% 30%, #ffd1da 0%, #ff8ba1 35%, #f4576b 70%, #b52240 100%)'
                    : 'radial-gradient(circle at 30% 30%, #d9dfe8 0%, #b1b9c6 40%, #8994a5 80%, #5c6577 100%)',
                boxShadow: r.status === 'won'
                  ? '0 0 0 1.5px #04100b, 0 0 6px 1px rgba(23,176,119,0.55)'
                  : r.status === 'lost'
                    ? '0 0 0 1.5px #04100b, 0 0 6px 1px rgba(244,87,107,0.55)'
                    : '0 0 0 1.5px #04100b, 0 0 5px 1px rgba(137,148,165,0.45)',
              }} />
      ))}
      {symResults.map((r) => (
        <TradeResultCard key={r.id} trade={r} ttl={resultTtl}
                         ref={(el) => { resultElsRef.current[r.id] = el; }}
                         onClose={onDismissResult || (() => {})} />
      ))}

      {/* Chart skeleton overlay — same subtle diagonal-line pattern as the boot
         skeleton's chart area, shown until the first history batch is rendered.
         No candle blocks, no "Loading chart…" text (per user request). */}
      {loading && (
        <div className="absolute inset-0 z-20 pointer-events-none bfg-chart-skel" data-testid="chart-skeleton" />
      )}

      {/* Older-history loading chip */}
      {loadingOlder && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full bg-[#050f0a]/90 border border-white/[0.09] px-3 py-1.5 text-[11px] text-white/70 shadow-[0_6px_20px_rgba(0,0,0,0.35)]" data-testid="chart-loading-older">
          <span className="h-1.5 w-1.5 rounded-full bg-[#14b877] animate-pulse" /> Loading history…
        </div>
      )}

      {/* Desktop — local time + UTC (Quotex-style) */}
      <div className="hidden md:block absolute top-2 left-2 z-10">
        <div className="rounded-xl bg-[#050f0a]/80 backdrop-blur-md border border-white/[0.08] px-3 py-1.5 leading-tight shadow-[0_6px_20px_rgba(0,0,0,0.3)]" data-testid="chart-clock">
          <div className="text-[12.5px] font-bold text-white/90 tabular-nums flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#14b877] animate-pulse" /> {localClock}
          </div>
          <div className="text-[9.5px] text-white/40 font-semibold tracking-wider pl-3">UTC{utcOff}</div>
        </div>
      </div>

      {/* Desktop — vertical tool rail (Quotex-style) */}
      <div className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-30 items-center gap-2">
        <div className="flex flex-col gap-1 rounded-xl bg-[#050f0a]/90 backdrop-blur-xl border border-white/[0.09] p-1 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
          <RailBtn testId="desk-rail-tf" active={deskPanel === 'tf'} onClick={() => setDeskPanel(deskPanel === 'tf' ? null : 'tf')}>
            <span className="text-[10.5px] font-bold tabular-nums">{tfLabel}</span>
          </RailBtn>
          <RailBtn testId="desk-rail-drawing" active={drawPanel || drawMode !== 'idle'}
                   onClick={() => { setDeskPanel(null); setDrawPanel(!drawPanel); }}><PencilSimpleLine size={16} /></RailBtn>
          <RailBtn testId="desk-rail-type" active={deskPanel === 'type'} onClick={() => setDeskPanel(deskPanel === 'type' ? null : 'type')}><ChartBar size={16} /></RailBtn>
          <RailBtn testId="desk-rail-indicators" active={indPanel}
                   onClick={() => { setDeskPanel(null); setDrawPanel(false); setIndPanel(!indPanel); }}><Sparkle size={16} /></RailBtn>
        </div>
        {deskPanel === 'tf' && (
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#050f0a]/92 backdrop-blur-xl border border-white/[0.09] p-1.5 w-[192px] shadow-[0_10px_30px_rgba(0,0,0,0.5)] tp-fade-up" data-testid="desk-tf-panel">
            {TF_LIST.map(([v, label]) => (
              <button key={v} onClick={() => { setTf(v); setDeskPanel(null); }} data-testid={`chart-tf-${label}`}
                      className={`h-9 rounded-lg text-[12px] font-bold tabular-nums transition-colors ${tf === v ? 'bg-[#14b877] text-[#03150d]' : 'bg-white/[0.04] text-white/75 hover:bg-white/[0.1]'}`}>
                {label}
              </button>
            ))}
          </div>
        )}
        {deskPanel === 'type' && (
          <div className="flex flex-col gap-1 rounded-xl bg-[#050f0a]/92 backdrop-blur-xl border border-white/[0.09] p-1.5 w-[128px] shadow-[0_10px_30px_rgba(0,0,0,0.5)] tp-fade-up" data-testid="desk-type-panel">
            {CHART_TYPES.map(([id, label]) => (
              <button key={id} onClick={() => { setChartType(id); setDeskPanel(null); }} data-testid={`desk-chart-type-${id}`}
                      className={`h-9 rounded-lg text-[12px] font-bold transition-colors ${chartType === id ? 'bg-[#14b877] text-[#03150d]' : 'bg-white/[0.04] text-white/75 hover:bg-white/[0.1]'}`}>
                {label}
              </button>
            ))}
          </div>
        )}
        {drawPanel && !isMobile && <DrawingPanel variant="desktop" {...drawingPanelProps} />}
        {indPanel && !isMobile && <IndicatorPanel variant="desktop" {...indicatorPanelProps} />}
      </div>

      {/* Mobile — tool rail + local time */}
      <div className="md:hidden absolute top-2 left-2 z-30 flex items-start gap-2">
        {railOpen ? (
          <div className="flex items-start gap-1.5 tp-fade-up">
            <div className="flex flex-col gap-1 rounded-xl bg-[#050f0a]/92 backdrop-blur-xl border border-white/[0.09] p-1 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
              <RailBtn testId="rail-close" onClick={() => { setRailOpen(false); setPanel(null); }}><X size={16} weight="bold" /></RailBtn>
              <RailBtn testId="rail-tf" active={panel === 'tf'} onClick={() => setPanel(panel === 'tf' ? null : 'tf')}>
                <span className="text-[10.5px] font-bold tabular-nums">{tfLabel}</span>
              </RailBtn>
              <RailBtn testId="rail-drawing" active={drawPanel || drawMode !== 'idle'}
                       onClick={() => { setPanel(null); setDrawPanel(!drawPanel); }}><PencilSimpleLine size={16} /></RailBtn>
              <RailBtn testId="rail-type" active={panel === 'type'} onClick={() => setPanel(panel === 'type' ? null : 'type')}><ChartBar size={16} /></RailBtn>
              <RailBtn testId="rail-indicators" active={indPanel}
                       onClick={() => { setPanel(null); setDrawPanel(false); setIndPanel(!indPanel); }}><Sparkle size={16} /></RailBtn>
            </div>
            {panel === 'tf' && (
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#050f0a]/92 backdrop-blur-xl border border-white/[0.09] p-1.5 w-[192px] shadow-[0_10px_30px_rgba(0,0,0,0.5)] tp-fade-up" data-testid="mobile-tf-panel">
                {TF_LIST.map(([v, label]) => (
                  <button key={v} onClick={() => { setTf(v); setPanel(null); }} data-testid={`mobile-tf-${label}`}
                          className={`h-9 rounded-lg text-[12px] font-bold tabular-nums transition-colors ${tf === v ? 'bg-[#14b877] text-[#03150d]' : 'bg-white/[0.04] text-white/75 active:bg-white/[0.1]'}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            {panel === 'type' && (
              <div className="flex flex-col gap-1 rounded-xl bg-[#050f0a]/92 backdrop-blur-xl border border-white/[0.09] p-1.5 w-[128px] shadow-[0_10px_30px_rgba(0,0,0,0.5)] tp-fade-up" data-testid="mobile-type-panel">
                {CHART_TYPES.map(([id, label]) => (
                  <button key={id} onClick={() => { setChartType(id); setPanel(null); }} data-testid={`chart-type-${id}`}
                          className={`h-9 rounded-lg text-[12px] font-bold transition-colors ${chartType === id ? 'bg-[#14b877] text-[#03150d]' : 'bg-white/[0.04] text-white/75 active:bg-white/[0.1]'}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => setRailOpen(true)} data-testid="mobile-chart-tools"
                  className="h-10 w-10 rounded-xl bg-[#050f0a]/85 backdrop-blur-md border border-white/[0.09] flex items-center justify-center text-white/70 active:bg-white/[0.08] transition-colors shadow-[0_6px_20px_rgba(0,0,0,0.3)]">
            <DotsThree size={22} weight="bold" />
          </button>
        )}
        <div className="rounded-xl bg-[#050f0a]/70 backdrop-blur-md border border-white/[0.07] px-2.5 py-1 leading-tight" data-testid="mobile-clock">
          <div className="text-[11.5px] font-bold text-white/85 tabular-nums flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#14b877] animate-pulse" /> {localClock}
          </div>
          <div className="text-[9px] text-white/40 font-semibold tracking-wider">UTC{utcOff}</div>
        </div>
      </div>
    </div>
  );
}
