import { useCallback, useEffect, useRef } from 'react';
import { LineSeries, HistogramSeries } from 'lightweight-charts';
import { INDICATORS, plotColor } from './catalog';
import { compute } from './calc';

const SUB_PANE_HEIGHT = 120;

const seriesOptions = (plot, params) => {
  const color = plotColor(plot, params);
  const lineWidth = Math.max(1, Math.min(6, Number(params.width) || 2));
  const base = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
  if (plot.type === 'hist') {
    return [HistogramSeries, { ...base, color, base: 0 }];
  }
  if (plot.type === 'points') {
    return [LineSeries, {
      ...base, color, lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 2,
    }];
  }
  return [LineSeries, { ...base, color, lineWidth, lineStyle: plot.dashed ? 2 : 0 }];
};

/**
 * Renders every active indicator as real chart series: overlays share the price
 * pane, oscillators each get their own pane below. Series are rebuilt when the
 * set of indicators changes and re-fed whenever the candles move.
 */
export default function IndicatorLayer({ chartRef, getData, tf, indicators }) {
  const builtRef = useRef({ sig: '', entries: [], panes: [] });
  const propsRef = useRef({ tf, indicators });
  propsRef.current = { tf, indicators };
  const lastDataRef = useRef('');

  const teardown = useCallback(() => {
    const chart = chartRef.current;
    const built = builtRef.current;
    if (chart) {
      // Removing the series is enough — lightweight-charts drops the pane once it
      // is empty, and calling removePane() ourselves shifts the remaining indices
      // underneath us (that used to leave orphan panes behind).
      for (const entry of built.entries) {
        for (const s of Object.values(entry.series)) {
          try { chart.removeSeries(s); } catch (e) { /* already gone */ }
        }
      }
    }
    builtRef.current = { sig: '', entries: [], panes: [] };
  }, [chartRef]);

  const feed = useCallback((force = false) => {
    const chart = chartRef.current;
    const built = builtRef.current;
    if (!chart || !built.entries.length) return;
    const candles = getData() || [];
    if (!candles.length) return;
    const last = candles[candles.length - 1];
    const stamp = `${candles.length}:${last.time}:${last.close}:${propsRef.current.tf}`;
    if (!force && stamp === lastDataRef.current) return;
    lastDataRef.current = stamp;
    for (const entry of built.entries) {
      const item = propsRef.current.indicators.find((x) => x.id === entry.id);
      if (!item) continue;
      let out = {};
      try {
        out = compute(item.kind, item.params || {}, candles, propsRef.current.tf) || {};
      } catch (e) {
        out = {};
      }
      for (const [key, series] of Object.entries(entry.series)) {
        try { series.setData(out[key] || []); } catch (e) { /* series detached */ }
      }
    }
  }, [chartRef, getData]);

  // (Re)build series whenever the active set changes (add / remove / hide).
  useEffect(() => {
    const list = indicators.filter((x) => x.visible !== false && INDICATORS[x.kind]);
    const sig = list.map((x) => `${x.id}:${x.kind}`).join('|');
    let timer;
    const build = () => {
      const chart = chartRef.current;
      if (!chart) { timer = setTimeout(build, 200); return; }
      if (builtRef.current.sig === sig) return;
      teardown();
      // Drop any pane left behind by a previous rebuild.
      try {
        const panesNow = chart.panes();
        for (let i = panesNow.length - 1; i >= 1; i -= 1) {
          if (!panesNow[i].getSeries().length) chart.removePane(i);
        }
      } catch (e) { /* noop */ }
      const entries = [];
      const panes = [];
      for (const item of list) {
        const def = INDICATORS[item.kind];
        const params = item.params || {};
        let paneIndex = 0;
        if (def.pane === 'sub') {
          try {
            const pane = chart.addPane();
            paneIndex = pane.paneIndex();
            panes.push(paneIndex);
          } catch (e) { paneIndex = 0; }
        }
        const series = {};
        for (const plot of def.plots) {
          const [type, opts] = seriesOptions(plot, params);
          try { series[plot.key] = chart.addSeries(type, opts, paneIndex); } catch (e) { /* skip plot */ }
        }
        const first = Object.values(series)[0];
        if (first && def.levels) {
          for (const level of def.levels) {
            try {
              first.createPriceLine({
                price: level, color: 'rgba(255,255,255,0.18)', lineWidth: 1,
                lineStyle: 2, axisLabelVisible: false,
              });
            } catch (e) { /* noop */ }
          }
        }
        entries.push({ id: item.id, kind: item.kind, paneIndex, series });
      }
      builtRef.current = { sig, entries, panes };
      // Size the sub-panes once they all exist, keeping at least half the height
      // for the candles.
      if (panes.length) {
        try {
          const all = chart.panes();
          // Stretch factors are the reliable way to split pane heights (setHeight
          // fights with the neighbouring pane); candles keep ~3/4 of the space.
          if (typeof all[0]?.setStretchFactor === 'function') {
            all[0].setStretchFactor(Math.max(3, panes.length * 2));
            for (const idx of panes) all[idx]?.setStretchFactor(1);
          } else {
            const total = all.reduce((acc, p) => acc + p.getHeight(), 0);
            const height = Math.max(58, Math.min(SUB_PANE_HEIGHT, (total * 0.5) / panes.length));
            for (let i = panes.length - 1; i >= 0; i -= 1) all[panes[i]]?.setHeight(height);
          }
        } catch (e) { /* noop */ }
      }
      lastDataRef.current = '';
      feed(true);
    };
    build();
    return () => clearTimeout(timer);
  }, [indicators, chartRef, teardown, feed]);

  // Param edits (period / colour / width) — colours and widths are options,
  // everything else changes the numbers, so refresh both.
  useEffect(() => {
    const built = builtRef.current;
    for (const entry of built.entries) {
      const item = indicators.find((x) => x.id === entry.id);
      if (!item) continue;
      const def = INDICATORS[item.kind];
      for (const plot of def.plots) {
        const s = entry.series[plot.key];
        if (!s) continue;
        const [, opts] = seriesOptions(plot, item.params || {});
        try { s.applyOptions(opts); } catch (e) { /* noop */ }
      }
    }
    feed(true);
  }, [indicators, feed]);

  // Follow the candles (new bar / live tick / pair or timeframe switch).
  useEffect(() => {
    let raf;
    let lastRun = 0;
    const loop = (now) => {
      if (now - lastRun > 200) { lastRun = now; feed(); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [feed]);

  useEffect(() => teardown, [teardown]);

  return null;
}
