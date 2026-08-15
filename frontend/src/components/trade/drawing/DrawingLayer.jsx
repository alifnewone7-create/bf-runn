import React, { useCallback, useEffect, useRef } from 'react';
import { makeConverters } from './geom';
import { buildGeometry, drawShape, hitTest } from './render';
import { TOOL_MAP, DEFAULT_STYLE } from './tools';

/**
 * Canvas overlay that renders and edits chart drawings.
 * mode: 'idle' → clicks pass through to the chart (pan/zoom untouched)
 *       'draw' → taps place points for the armed tool
 *       'edit' → tap to select, drag body to move, drag handle to resize/extend;
 *                dragging empty space still pans the chart.
 */
export default function DrawingLayer({
  chartRef, seriesRef, getData, tf, drawings, mode, tool, selectedId,
  hideAll, newStyle, onSelect, onCreate, onUpdate, panExcessPxRef,
}) {
  const canvasRef = useRef(null);
  const paintedRef = useRef(false);
  const requestRef = useRef(null);
  const draftRef = useRef(null);
  const dragRef = useRef(null);
  const propsRef = useRef({});
  propsRef.current = { drawings, mode, tool, selectedId, hideAll, tf, newStyle };
  const cbRef = useRef({});
  cbRef.current = { onSelect, onCreate, onUpdate };
  // getData is re-created on every parent render — keep it in a ref so the
  // effects below never tear down (a mid-drag teardown killed move/resize).
  const getDataRef = useRef(getData);
  getDataRef.current = getData;

  const shiftRef = useRef(null);
  shiftRef.current = panExcessPxRef;
  // Cached host size — paint() runs inside the chart's render pass (every
  // crosshair move), so reading clientWidth/Height there forced a layout on
  // each pointer move and made the crosshair feel laggy.
  const sizeRef = useRef({ w: 0, h: 0 });

  const conv = useCallback(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return null;
    return makeConverters({
      chart, series, data: getDataRef.current() || [], tf: propsRef.current.tf,
      xShift: shiftRef.current?.current?.() || 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Paint the overlay canvas. Called from inside the chart's own render pass (see
  // the primitive below) so time/price coordinates are the exact ones the candles
  // are being drawn with — painting from our own rAF used to read a scale that was
  // one frame out of sync, which made drawings glitch/jump while panning.
  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!canvas || !chart || !series) return;
    const host = canvas.parentElement;
    if (!sizeRef.current.w || !sizeRef.current.h) {
      sizeRef.current = { w: host?.clientWidth || 0, h: host?.clientHeight || 0 };
    }
    const { w, h } = sizeRef.current;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { hideAll: hide, drawings: list, selectedId: sel } = propsRef.current;
    const draft = hide ? null : draftRef.current;
    if (hide || (!list.length && !draft)) {
      if (paintedRef.current) {
        ctx.clearRect(0, 0, w, h);
        paintedRef.current = false;
      }
      return;
    }
    const cv = makeConverters({
      chart, series, data: getDataRef.current() || [], tf: propsRef.current.tf,
    });
    ctx.clearRect(0, 0, w, h);
    paintedRef.current = true;
    // While a shape is being dragged its points live in a ref, so the move is
    // painted at pointer speed without a React state update per event (that is
    // what made move/resize feel stuck and steppy).
    const drag = dragRef.current;
    for (const d of list) {
      if (d.visible === false) continue;
      const live = (drag && drag.id === d.id && drag.livePoints) ? { ...d, points: drag.livePoints } : d;
      const g = buildGeometry(live, cv, h, propsRef.current.tf);
      if (g) drawShape(ctx, live, g, { selected: d.id === sel });
    }
    if (draft) {
      const pts = draft.points.concat(
        draft.points.length < (TOOL_MAP[draft.tool]?.points || 2) && draft.hover ? [draft.hover] : [],
      );
      const temp = { ...DEFAULT_STYLE, ...(propsRef.current.newStyle || {}), tool: draft.tool, points: pts, style: 'dashed' };
      const g = buildGeometry(temp, cv, h, propsRef.current.tf);
      if (g) drawShape(ctx, temp, g, { selected: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attach a series primitive whose only job is to paint us in sync with the chart.
  useEffect(() => {
    let timer;
    let attachedSeries = null;
    let primitive = null;
    const attach = () => {
      const series = seriesRef.current;
      if (!series || !series.attachPrimitive) { timer = setTimeout(attach, 150); return; }
      const renderer = { draw: () => paint() };
      const paneView = { zOrder: () => 'top', renderer: () => renderer };
      primitive = {
        attached: ({ requestUpdate }) => { requestRef.current = requestUpdate; },
        detached: () => { requestRef.current = null; },
        updateAllViews: () => {},
        paneViews: () => [paneView],
      };
      attachedSeries = series;
      series.attachPrimitive(primitive);
      paint();
    };
    attach();
    return () => {
      clearTimeout(timer);
      requestRef.current = null;
      try { if (attachedSeries && primitive) attachedSeries.detachPrimitive(primitive); } catch (e) { /* chart already gone */ }
    };
  }, [seriesRef, paint]);

  // Repaint when our own state changes (the chart itself may be idle).
  useEffect(() => {
    if (requestRef.current) requestRef.current();
    else paint();
  }, [drawings, selectedId, hideAll, newStyle, tool, mode, tf, paint]);

  // Container resizes don't always trigger a chart repaint.
  useEffect(() => {
    const host = canvasRef.current?.parentElement;
    if (!host || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) sizeRef.current = { w: r.width, h: r.height };
      if (requestRef.current) requestRef.current(); else paint();
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [paint]);

  // Reset any half-finished shape when the tool/mode changes.
  useEffect(() => { draftRef.current = null; }, [mode, tool]);

  // Draft lives in a ref, so ask the chart to repaint after every draft edit.
  const repaint = () => { if (requestRef.current) requestRef.current(); else paint(); };

  const localPt = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e) => {
    const cv = conv();
    if (!cv) return;
    if (propsRef.current.mode !== 'draw') return;
    const { x, y } = localPt(e);
    canvasRef.current.setPointerCapture?.(e.pointerId);

    const spec = TOOL_MAP[propsRef.current.tool];
    if (!spec) return;
    const t = cv.t(x);
    const p = cv.p(y);
    if (t === null || p === null) return;
    const pt = { t, p };
    const draft = draftRef.current || { tool: spec.id, points: [] };
    draft.points = draft.points.concat([pt]);
    draft.hover = pt;
    draft.tool = spec.id;
    draftRef.current = draft;
    dragRef.current = { drawStart: { x, y } };
    if (draft.points.length >= spec.points) {
      draftRef.current = null;
      dragRef.current = null;
      cbRef.current.onCreate(spec.id, draft.points);
    }
    repaint();
  };

  const onPointerMove = (e) => {
    const cv = conv();
    if (!cv) return;
    if (propsRef.current.mode !== 'draw' || !draftRef.current) return;
    const { x, y } = localPt(e);
    const t = cv.t(x);
    const p = cv.p(y);
    if (t !== null && p !== null) {
      draftRef.current.hover = { t, p };
      paint();
    }
  };

  const onPointerUp = (e) => {
    const cv = conv();
    if (propsRef.current.mode !== 'draw') return;
    const { x, y } = localPt(e);
    canvasRef.current.releasePointerCapture?.(e.pointerId);
    const draft = draftRef.current;
    const start = dragRef.current?.drawStart;
    dragRef.current = null;
    if (!draft || !start || !cv) return;
    const moved = Math.hypot(x - start.x, y - start.y);
    const spec = TOOL_MAP[draft.tool];
    if (moved > 6 && draft.points.length < spec.points) {
      const t = cv.t(x);
      const p = cv.p(y);
      if (t !== null && p !== null) draft.points = draft.points.concat([{ t, p }]);
      if (draft.points.length >= spec.points) {
        draftRef.current = null;
        cbRef.current.onCreate(spec.id, draft.points);
      }
    }
    repaint();
  };

  // Cursor for a hit: handles get a directional resize arrow, the body gets the
  // 4-way move arrow — the same affordances TradingView shows on hover.
  const cursorFor = (d, g, res) => {
    if (res.handle === null || res.handle === undefined) return 'move';
    if (d.tool === 'horizontal_line') return 'ns-resize';
    if (d.tool === 'vertical_line') return 'ew-resize';
    if (d.tool === 'cross_line') return 'move';
    const pts = g.handles;
    if (pts.length < 2) return 'move';
    const cx = pts.reduce((a, q) => a + q.x, 0) / pts.length;
    const cy = pts.reduce((a, q) => a + q.y, 0) / pts.length;
    const h = pts[res.handle];
    const dx = h.x - cx;
    const dy = h.y - cy;
    if (Math.abs(dx) < 4) return 'ns-resize';
    if (Math.abs(dy) < 4) return 'ew-resize';
    return dx * dy > 0 ? 'nwse-resize' : 'nesw-resize';
  };

  // Always-on direct manipulation: a press that lands ON a drawing selects it and
  // starts a move/resize drag; a press on empty space is left to the chart so
  // pan/zoom keep working without any "select mode" toggle.
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!host) return undefined;

    const applyDrag = () => {
      const drag = dragRef.current;
      if (!drag?.id) return;
      const cv = conv();
      if (!cv) return;
      const x = drag.px;
      const y = drag.py;
      const t = cv.t(x);
      const p = cv.p(y);
      if (t === null || p === null) return;
      drag.livePoints = (drag.handle !== null && drag.handle !== undefined)
        ? drag.points.map((q, i) => (i === drag.handle ? { t, p } : q))
        : drag.points.map((q) => ({ t: q.t + (t - drag.startT), p: q.p + (p - drag.startP) }));
      // Painted right here, in the pointer event — going through the chart's
      // requestUpdate() cost an extra frame and made the move feel one step
      // behind the cursor.
      paint();
    };

    const onMove = (e) => {
      const drag = dragRef.current;
      if (!drag?.id) return;
      e.stopPropagation();
      // Only the pointer position is recorded here; the geometry is recomputed
      // and painted once per frame, so a 120Hz pointer never queues up work.
      const r = drag.rect;
      drag.px = e.clientX - r.left;
      drag.py = e.clientY - r.top;
      applyDrag();
    };

    const onUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag?.raf) cancelAnimationFrame(drag.raf);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      if (!drag?.id) return;
      host.style.cursor = '';
      // One single state commit for the whole gesture.
      if (drag.livePoints) cbRef.current.onUpdate(drag.id, { points: drag.livePoints }, { save: true });
      else cbRef.current.onUpdate(drag.id, {}, { save: true });
      repaint();
    };

    // Hover feedback — frame-throttled hit test that swaps the chart cursor so
    // every drawing advertises what a press will do (move vs resize).
    const hoverState = { raf: null, x: 0, y: 0, cur: '' };
    const setCursor = (c) => {
      if (hoverState.cur === c) return;
      hoverState.cur = c;
      host.style.cursor = c;
    };
    const resolveHover = () => {
      hoverState.raf = null;
      const p = propsRef.current;
      if (dragRef.current?.id) return;
      if (p.mode === 'draw') { setCursor('crosshair'); return; }
      if (p.hideAll || !p.drawings.length) { setCursor(''); return; }
      const cv = conv();
      if (!cv) return;
      const h = sizeRef.current.h || host.clientHeight || 0;
      for (let i = p.drawings.length - 1; i >= 0; i -= 1) {
        const d = p.drawings[i];
        if (d.visible === false) continue;
        const g = buildGeometry(d, cv, h, p.tf);
        if (!g) continue;
        const res = hitTest(g, hoverState.x, hoverState.y, 10);
        if (res.hit) { setCursor(cursorFor(d, g, res)); return; }
      }
      setCursor('');
    };
    const onHover = (e) => {
      if (e.target?.closest?.('[data-chart-overlay]')) return;
      const r = canvas.getBoundingClientRect();
      hoverState.x = e.clientX - r.left;
      hoverState.y = e.clientY - r.top;
      if (!hoverState.raf) hoverState.raf = requestAnimationFrame(resolveHover);
    };
    const onLeave = () => setCursor('');

    const onDown = (e) => {
      if (propsRef.current.mode === 'draw' || propsRef.current.hideAll) return;
      // The style editor and other floating overlays live inside this same host,
      // so a press on them must not run hit-testing (it used to deselect and
      // unmount the editor before its click ever fired).
      if (e.target?.closest?.('[data-chart-overlay]')) return;
      const cv = conv();
      if (!cv) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const h = sizeRef.current.h || host.clientHeight || 0;
      const list = propsRef.current.drawings;
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const d = list[i];
        if (d.visible === false) continue;
        const g = buildGeometry(d, cv, h, propsRef.current.tf);
        if (!g) continue;
        const res = hitTest(g, x, y, 10);
        if (!res.hit) continue;
        e.stopPropagation();
        e.preventDefault();
        cbRef.current.onSelect(d.id);
        dragRef.current = {
          id: d.id, handle: res.handle, points: d.points.map((q) => ({ ...q })),
          startT: cv.t(x), startP: cv.p(y), rect, px: x, py: y, raf: null, livePoints: null,
        };
        setCursor(res.handle === null || res.handle === undefined
          ? 'grabbing' : cursorFor(d, g, res));
        window.addEventListener('pointermove', onMove, true);
        window.addEventListener('pointerup', onUp, true);
        window.addEventListener('pointercancel', onUp, true);
        return;
      }
      if (propsRef.current.selectedId) cbRef.current.onSelect(null);
    };

    // Touch events are separate from pointer events — swallow them while a
    // drawing drag is in progress so the chart does not pan at the same time.
    const blockTouch = (e) => {
      if (!dragRef.current?.id) return;
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
    };

    host.addEventListener('pointermove', onHover, { passive: true });
    host.addEventListener('pointerleave', onLeave);
    host.addEventListener('pointerdown', onDown, true);
    host.addEventListener('touchstart', blockTouch, { capture: true, passive: false });
    host.addEventListener('touchmove', blockTouch, { capture: true, passive: false });
    host.addEventListener('touchend', blockTouch, true);
    return () => {
      if (hoverState.raf) cancelAnimationFrame(hoverState.raf);
      host.style.cursor = '';
      host.removeEventListener('pointermove', onHover);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('pointerdown', onDown, true);
      host.removeEventListener('touchstart', blockTouch, { capture: true });
      host.removeEventListener('touchmove', blockTouch, { capture: true });
      host.removeEventListener('touchend', blockTouch, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
    };
  }, [conv]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { draftRef.current = null; if (requestRef.current) requestRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-testid="drawing-canvas"
      className="absolute inset-0 z-[8]"
      style={{
        pointerEvents: mode === 'draw' ? 'auto' : 'none',
        touchAction: mode === 'draw' ? 'none' : 'auto',
        cursor: mode === 'draw' ? 'crosshair' : 'inherit',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}
