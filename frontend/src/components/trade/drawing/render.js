import { far, distToSegment, hexAlpha } from './geom';

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

const DASH = { solid: [], dashed: [7, 5], dotted: [2, 4] };

// Resolve stored {t,p} points to pixels. Returns null when the chart can't map them.
const toPx = (d, cv) => {
  const out = [];
  for (const pt of d.points || []) {
    const x = cv.x(pt.t);
    const y = cv.y(pt.p);
    if (x === null || y === null) return null;
    out.push({ x, y });
  }
  return out;
};

/**
 * Build renderable geometry for a drawing.
 * → { polys:[[{x,y}..]], closed:[[..]], fills:[[..]], labels:[{x,y,text,align}], handles:[{x,y}] }
 */
export function buildGeometry(d, cv, paneH, tf) {
  const P = toPx(d, cv);
  if (!P || !P.length) return null;
  const W = cv.paneW;
  const H = paneH;
  const g = { polys: [], fills: [], labels: [], handles: P };

  switch (d.tool) {
    case 'trend_line':
      g.polys.push([P[0], P[1] || P[0]]);
      break;
    case 'ray':
      g.polys.push(P[1] ? far(P[0], P[1]) : [P[0], P[0]]);
      break;
    case 'extended_line':
      g.polys.push(P[1] ? far(P[0], P[1], true) : [P[0], P[0]]);
      break;
    case 'horizontal_line':
      g.polys.push([{ x: 0, y: P[0].y }, { x: W, y: P[0].y }]);
      g.labels.push({ x: W - 6, y: P[0].y - 5, text: Number(d.points[0].p).toFixed(5), align: 'right' });
      break;
    case 'vertical_line':
      g.polys.push([{ x: P[0].x, y: 0 }, { x: P[0].x, y: H }]);
      break;
    case 'cross_line':
      g.polys.push([{ x: 0, y: P[0].y }, { x: W, y: P[0].y }]);
      g.polys.push([{ x: P[0].x, y: 0 }, { x: P[0].x, y: H }]);
      break;
    case 'rectangle': {
      if (!P[1]) break;
      const box = [P[0], { x: P[1].x, y: P[0].y }, P[1], { x: P[0].x, y: P[1].y }];
      g.fills.push(box);
      g.polys.push(box.concat([P[0]]));
      break;
    }
    case 'triangle': {
      if (!P[1]) break;
      const tri = P.length >= 3 ? [P[0], P[1], P[2]] : [P[0], P[1]];
      if (tri.length === 3) g.fills.push(tri);
      g.polys.push(tri.concat([P[0]]));
      break;
    }
    case 'fib_retracement': {
      if (!P[1]) break;
      const x1 = Math.min(P[0].x, P[1].x);
      const x2 = Math.max(P[0].x, P[1].x);
      const right = Math.max(x2, x1 + 40);
      const pA = d.points[0].p;
      const pB = d.points[1].p;
      g.polys.push([P[0], P[1]]);
      for (const lv of FIB_LEVELS) {
        const price = pB + (pA - pB) * lv;
        const y = cv.y(price);
        if (y === null) continue;
        g.polys.push([{ x: x1, y }, { x: right, y }]);
        g.labels.push({ x: right - 4, y: y - 5, text: `${(lv * 100).toFixed(1)}%  ${price.toFixed(5)}`, align: 'right' });
      }
      break;
    }
    case 'parallel_channel': {
      if (!P[1]) break;
      g.polys.push([P[0], P[1]]);
      if (P[2]) {
        const slope = (P[1].y - P[0].y) / ((P[1].x - P[0].x) || 1);
        const baseY = P[0].y + slope * (P[2].x - P[0].x);
        const dy = P[2].y - baseY;
        const b0 = { x: P[0].x, y: P[0].y + dy };
        const b1 = { x: P[1].x, y: P[1].y + dy };
        g.polys.push([b0, b1]);
        g.fills.push([P[0], P[1], b1, b0]);
      }
      break;
    }
    case 'disjoint_channel': {
      if (!P[1]) break;
      g.polys.push([P[0], P[1]]);
      if (P[2] && P[3]) {
        g.polys.push([P[2], P[3]]);
        g.fills.push([P[0], P[1], P[3], P[2]]);
      } else if (P[2]) {
        g.polys.push([P[2], P[2]]);
      }
      break;
    }
    case 'price_range': {
      if (!P[1]) break;
      const box = [P[0], { x: P[1].x, y: P[0].y }, P[1], { x: P[0].x, y: P[1].y }];
      g.fills.push(box);
      g.polys.push(box.concat([P[0]]));
      const a = d.points[0].p;
      const b = d.points[1].p;
      const pct = a ? ((b - a) / a) * 100 : 0;
      g.labels.push({
        x: (P[0].x + P[1].x) / 2, y: Math.min(P[0].y, P[1].y) - 6, align: 'center',
        text: `${(b - a) >= 0 ? '+' : ''}${(b - a).toFixed(5)}  (${pct.toFixed(2)}%)`,
      });
      break;
    }
    case 'date_range': {
      if (!P[1]) break;
      const box = [{ x: P[0].x, y: 0 }, { x: P[1].x, y: 0 }, { x: P[1].x, y: H }, { x: P[0].x, y: H }];
      g.fills.push(box);
      g.polys.push([{ x: P[0].x, y: 0 }, { x: P[0].x, y: H }]);
      g.polys.push([{ x: P[1].x, y: 0 }, { x: P[1].x, y: H }]);
      const bars = Math.abs(Math.round((d.points[1].t - d.points[0].t) / (tf || 60)));
      g.labels.push({ x: (P[0].x + P[1].x) / 2, y: 16, align: 'center', text: `${bars} bars` });
      break;
    }
    default:
      g.polys.push(P.length > 1 ? P : [P[0], P[0]]);
  }
  return g;
}

export function drawShape(ctx, d, g, { selected }) {
  const color = d.color || '#14b877';
  ctx.save();
  for (const poly of g.fills) {
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i += 1) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath();
    ctx.fillStyle = hexAlpha(color, 0.12);
    ctx.fill();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = d.width || 2;
  ctx.setLineDash(DASH[d.style] || []);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const poly of g.polys) {
    if (poly.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i += 1) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  if (g.labels.length) {
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = hexAlpha(color, 0.95);
    // The desktop vertical tool rail overlays the left ~56px of the canvas, so
    // labels are pushed right of it (measured width aware) and kept on-canvas.
    const RAIL = 60;
    const maxX = ctx.canvas.width / (window.devicePixelRatio || 1);
    for (const l of g.labels) {
      const align = l.align || 'left';
      const tw = ctx.measureText(l.text).width;
      let lx = l.x;
      if (align === 'right') lx = Math.min(Math.max(lx, RAIL + tw), maxX - 4);
      else if (align === 'left') lx = Math.min(Math.max(lx, RAIL), maxX - 4 - tw);
      else lx = Math.min(Math.max(lx, RAIL + tw / 2), maxX - 4 - tw / 2);
      ctx.textAlign = align;
      ctx.fillText(l.text, lx, l.y);
    }
    ctx.textAlign = 'left';
  }
  if (selected) {
    for (const h of g.handles) {
      ctx.beginPath();
      ctx.arc(h.x, h.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#04100b';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Even-odd point-in-polygon — lets a press anywhere INSIDE a shape select it,
// instead of only on its 8px border (a big rectangle was almost unclickable).
function inPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i];
    const b = poly[j];
    if (((a.y > y) !== (b.y > y))
      && (x < ((b.x - a.x) * (y - a.y)) / ((b.y - a.y) || 1e-9) + a.x)) inside = !inside;
  }
  return inside;
}

export function hitTest(g, x, y, tol = 8) {
  for (let i = 0; i < g.handles.length; i += 1) {
    const h = g.handles[i];
    if (Math.hypot(x - h.x, y - h.y) <= 10) return { hit: true, handle: i };
  }
  for (const poly of g.polys) {
    for (let i = 0; i < poly.length - 1; i += 1) {
      if (distToSegment(x, y, poly[i], poly[i + 1]) <= tol) return { hit: true, handle: null };
    }
  }
  for (const poly of g.fills) {
    if (poly.length >= 3 && inPoly(poly, x, y)) return { hit: true, handle: null, inside: true };
  }
  return { hit: false, handle: null };
}
