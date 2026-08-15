import {
  TrendingUp, ArrowUpRight, MoveDiagonal, MoveHorizontal, MoveVertical,
  Crosshair, Square, Triangle, Rows3, Equal, EqualNot, Ruler, CalendarRange,
} from 'lucide-react';

// Core drawing tool set. `points` = how many taps/clicks define the shape.
export const TOOLS = [
  { id: 'trend_line', label: 'Trend Line', points: 2, icon: TrendingUp },
  { id: 'ray', label: 'Ray', points: 2, icon: ArrowUpRight },
  { id: 'extended_line', label: 'Extended Line', points: 2, icon: MoveDiagonal },
  { id: 'horizontal_line', label: 'Horizontal line', points: 1, icon: MoveHorizontal },
  { id: 'vertical_line', label: 'Vertical line', points: 1, icon: MoveVertical },
  { id: 'cross_line', label: 'Cross Line', points: 1, icon: Crosshair },
  { id: 'rectangle', label: 'Rectangle', points: 2, icon: Square },
  { id: 'triangle', label: 'Triangle', points: 3, icon: Triangle },
  { id: 'fib_retracement', label: 'Fibonacci Retracement', points: 2, icon: Rows3 },
  { id: 'parallel_channel', label: 'Parallel Channel', points: 3, icon: Equal },
  { id: 'disjoint_channel', label: 'Disjoint Channel', points: 4, icon: EqualNot },
  { id: 'price_range', label: 'Price Range', points: 2, icon: Ruler },
  { id: 'date_range', label: 'Date Range', points: 2, icon: CalendarRange },
];

export const TOOL_MAP = TOOLS.reduce((acc, t) => { acc[t.id] = t; return acc; }, {});

export const DRAW_COLORS = ['#14b877', '#f43f5e', '#3b82f6', '#f59e0b', '#a855f7', '#22d3ee', '#ffffff', '#94a3b8'];
// Full swatch grid used by the pen popover in the drawing style bar.
export const DRAW_PALETTE = [
  '#ffffff', '#94a3b8', '#64748b', '#0f172a', '#14b877', '#0ea968',
  '#22c55e', '#84cc16', '#facc15', '#f59e0b', '#fb923c', '#f97316',
  '#f43f5e', '#ec4899', '#a855f7', '#6366f1', '#3b82f6', '#22d3ee',
];
export const DRAW_WIDTHS = [1, 2, 3, 4];
export const DRAW_STYLES = [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']];

export const DEFAULT_STYLE = { color: '#14b877', width: 2, style: 'solid', visible: true };
