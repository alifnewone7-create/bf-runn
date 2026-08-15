// Indicator catalog — labels, groups, editable params and plot definitions.
// `pane: 'price'` overlays the candles, `pane: 'sub'` gets its own pane below.

const col = (def) => ({ key: 'color', label: 'Color', type: 'color', def });
const col2 = (def) => ({ key: 'color2', label: 'Color 2', type: 'color', def });
const col3 = (def) => ({ key: 'color3', label: 'Color 3', type: 'color', def });
const width = () => ({ key: 'width', label: 'Line width', type: 'int', def: 2, min: 1, max: 6 });
const period = (def, label = 'Period', max = 400) => ({ key: 'period', label, type: 'int', def, min: 1, max });

export const INDICATORS = {
  // ── Trend / overlays ──────────────────────────────────────────────────────
  alligator: {
    label: 'Alligator', group: 'trend', pane: 'price',
    params: [
      { key: 'jaw', label: 'Jaw period', type: 'int', def: 13, min: 2, max: 200 },
      { key: 'teeth', label: 'Teeth period', type: 'int', def: 8, min: 2, max: 200 },
      { key: 'lips', label: 'Lips period', type: 'int', def: 5, min: 2, max: 200 },
      col('#3b82f6'), col2('#f43f5e'), col3('#22c55e'), width(),
    ],
    plots: [
      { key: 'jaw', label: 'Jaw', type: 'line', colorParam: 'color' },
      { key: 'teeth', label: 'Teeth', type: 'line', colorParam: 'color2' },
      { key: 'lips', label: 'Lips', type: 'line', colorParam: 'color3' },
    ],
  },
  bollinger_bands: {
    label: 'Bollinger Bands', group: 'trend', pane: 'price',
    params: [period(20), { key: 'dev', label: 'Deviation', type: 'float', def: 2, min: 0.1, max: 10 }, col('#22d3ee'), width()],
    plots: [
      { key: 'upper', label: 'Upper', type: 'line', colorParam: 'color' },
      { key: 'middle', label: 'Basis', type: 'line', colorParam: 'color', dashed: true },
      { key: 'lower', label: 'Lower', type: 'line', colorParam: 'color' },
    ],
  },
  envelopes: {
    label: 'Envelopes', group: 'trend', pane: 'price',
    params: [period(20), { key: 'pct', label: 'Deviation %', type: 'float', def: 0.5, min: 0.05, max: 20 }, col('#a855f7'), width()],
    plots: [
      { key: 'upper', label: 'Upper', type: 'line', colorParam: 'color' },
      { key: 'middle', label: 'Basis', type: 'line', colorParam: 'color', dashed: true },
      { key: 'lower', label: 'Lower', type: 'line', colorParam: 'color' },
    ],
  },
  fractal: {
    label: 'Fractal', group: 'trend', pane: 'price',
    params: [{ key: 'span', label: 'Bars each side', type: 'int', def: 2, min: 1, max: 10 }, col('#22c55e'), col2('#f43f5e')],
    plots: [
      { key: 'up', label: 'Up fractal', type: 'points', colorParam: 'color' },
      { key: 'down', label: 'Down fractal', type: 'points', colorParam: 'color2' },
    ],
  },
  ichimoku_cloud: {
    label: 'Ichimoku Cloud', group: 'trend', pane: 'price',
    params: [
      { key: 'tenkan', label: 'Tenkan', type: 'int', def: 9, min: 1, max: 200 },
      { key: 'kijun', label: 'Kijun', type: 'int', def: 26, min: 1, max: 200 },
      { key: 'senkou', label: 'Senkou B', type: 'int', def: 52, min: 1, max: 400 },
      col('#3b82f6'), col2('#f43f5e'), col3('#22c55e'), width(),
    ],
    plots: [
      { key: 'tenkan', label: 'Tenkan-sen', type: 'line', colorParam: 'color' },
      { key: 'kijun', label: 'Kijun-sen', type: 'line', colorParam: 'color2' },
      { key: 'spanA', label: 'Senkou A', type: 'line', colorParam: 'color3' },
      { key: 'spanB', label: 'Senkou B', type: 'line', color: '#f59e0b' },
      { key: 'chikou', label: 'Chikou', type: 'line', color: '#a855f7', dashed: true },
    ],
  },
  keltner_channel: {
    label: 'Keltner channel', group: 'trend', pane: 'price',
    params: [
      period(20), { key: 'atrPeriod', label: 'ATR period', type: 'int', def: 10, min: 1, max: 200 },
      { key: 'mult', label: 'Multiplier', type: 'float', def: 2, min: 0.1, max: 10 }, col('#f59e0b'), width(),
    ],
    plots: [
      { key: 'upper', label: 'Upper', type: 'line', colorParam: 'color' },
      { key: 'middle', label: 'Basis', type: 'line', colorParam: 'color', dashed: true },
      { key: 'lower', label: 'Lower', type: 'line', colorParam: 'color' },
    ],
  },
  donchian_channel: {
    label: 'Donchian channel', group: 'trend', pane: 'price',
    params: [period(20), col('#60a5fa'), width()],
    plots: [
      { key: 'upper', label: 'Upper', type: 'line', colorParam: 'color' },
      { key: 'middle', label: 'Middle', type: 'line', colorParam: 'color', dashed: true },
      { key: 'lower', label: 'Lower', type: 'line', colorParam: 'color' },
    ],
  },
  supertrend: {
    label: 'Supertrend', group: 'trend', pane: 'price',
    params: [
      { key: 'atrPeriod', label: 'ATR period', type: 'int', def: 10, min: 1, max: 200 },
      { key: 'mult', label: 'Multiplier', type: 'float', def: 3, min: 0.1, max: 15 },
      col('#22c55e'), col2('#f43f5e'), width(),
    ],
    plots: [
      { key: 'up', label: 'Uptrend', type: 'line', colorParam: 'color' },
      { key: 'down', label: 'Downtrend', type: 'line', colorParam: 'color2' },
    ],
  },
  moving_average: {
    label: 'Moving Average', group: 'trend', pane: 'price',
    params: [
      period(20),
      { key: 'method', label: 'Method', type: 'select', def: 'sma', options: [['sma', 'SMA'], ['ema', 'EMA'], ['wma', 'WMA'], ['smma', 'SMMA']] },
      { key: 'source', label: 'Source', type: 'select', def: 'close', options: [['close', 'Close'], ['open', 'Open'], ['high', 'High'], ['low', 'Low'], ['hl2', 'HL/2'], ['hlc3', 'HLC/3']] },
      col('#14b877'), width(),
    ],
    plots: [{ key: 'ma', label: 'MA', type: 'line', colorParam: 'color' }],
  },
  parabolic_sar: {
    label: 'Parabolic SAR', group: 'trend', pane: 'price',
    params: [
      { key: 'step', label: 'Step', type: 'float', def: 0.02, min: 0.001, max: 1 },
      { key: 'max', label: 'Max step', type: 'float', def: 0.2, min: 0.01, max: 1 },
      col('#22d3ee'),
    ],
    plots: [{ key: 'sar', label: 'SAR', type: 'points', colorParam: 'color' }],
  },
  zig_zag: {
    label: 'Zig Zag', group: 'trend', pane: 'price',
    params: [
      { key: 'depth', label: 'Depth', type: 'int', def: 12, min: 2, max: 100 },
      { key: 'dev', label: 'Deviation %', type: 'float', def: 0.1, min: 0.01, max: 20 },
      col('#e879f9'), width(),
    ],
    plots: [{ key: 'zz', label: 'Zig Zag', type: 'line', colorParam: 'color' }],
  },

  // ── Oscillators (own pane) ────────────────────────────────────────────────
  adx: {
    label: 'ADX', group: 'osc', pane: 'sub',
    params: [period(14), col('#f59e0b'), col2('#22c55e'), col3('#f43f5e'), width()],
    plots: [
      { key: 'adx', label: 'ADX', type: 'line', colorParam: 'color' },
      { key: 'plusDI', label: '+DI', type: 'line', colorParam: 'color2' },
      { key: 'minusDI', label: '-DI', type: 'line', colorParam: 'color3' },
    ],
  },
  aroon: {
    label: 'Aroon', group: 'osc', pane: 'sub',
    params: [period(14), col('#22c55e'), col2('#f43f5e'), width()],
    plots: [
      { key: 'up', label: 'Aroon Up', type: 'line', colorParam: 'color' },
      { key: 'down', label: 'Aroon Down', type: 'line', colorParam: 'color2' },
    ],
  },
  awesome_oscillator: {
    label: 'Awesome Oscillator', group: 'osc', pane: 'sub',
    params: [
      { key: 'fast', label: 'Fast', type: 'int', def: 5, min: 1, max: 200 },
      { key: 'slow', label: 'Slow', type: 'int', def: 34, min: 2, max: 400 },
      col('#22c55e'), col2('#f43f5e'),
    ],
    plots: [{ key: 'ao', label: 'AO', type: 'hist', colorParam: 'color' }],
  },
  bears_power: {
    label: 'Bears power', group: 'osc', pane: 'sub',
    params: [period(13), col('#f43f5e')],
    plots: [{ key: 'bears', label: 'Bears', type: 'hist', colorParam: 'color' }],
  },
  bulls_power: {
    label: 'Bulls power', group: 'osc', pane: 'sub',
    params: [period(13), col('#22c55e')],
    plots: [{ key: 'bulls', label: 'Bulls', type: 'hist', colorParam: 'color' }],
  },
  cci: {
    label: 'CCI', group: 'osc', pane: 'sub',
    params: [period(20), col('#22d3ee'), width()],
    plots: [{ key: 'cci', label: 'CCI', type: 'line', colorParam: 'color' }],
  },
  demarker: {
    label: 'DeMarker', group: 'osc', pane: 'sub',
    params: [period(14), col('#a855f7'), width()],
    plots: [{ key: 'dem', label: 'DeMarker', type: 'line', colorParam: 'color' }],
  },
  atr: {
    label: 'Average True Range', group: 'osc', pane: 'sub',
    params: [period(14), col('#f59e0b'), width()],
    plots: [{ key: 'atr', label: 'ATR', type: 'line', colorParam: 'color' }],
  },
  macd: {
    label: 'MACD', group: 'osc', pane: 'sub',
    params: [
      { key: 'fast', label: 'Fast EMA', type: 'int', def: 12, min: 1, max: 200 },
      { key: 'slow', label: 'Slow EMA', type: 'int', def: 26, min: 2, max: 400 },
      { key: 'signal', label: 'Signal', type: 'int', def: 9, min: 1, max: 200 },
      col('#22d3ee'), col2('#f59e0b'), width(),
    ],
    plots: [
      { key: 'hist', label: 'Histogram', type: 'hist', color: '#14b877' },
      { key: 'macd', label: 'MACD', type: 'line', colorParam: 'color' },
      { key: 'signal', label: 'Signal', type: 'line', colorParam: 'color2' },
    ],
  },
  momentum: {
    label: 'Momentum', group: 'osc', pane: 'sub',
    params: [period(10), col('#60a5fa'), width()],
    plots: [{ key: 'mom', label: 'Momentum', type: 'line', colorParam: 'color' }],
  },
  rsi: {
    label: 'RSI', group: 'osc', pane: 'sub',
    params: [period(14), col('#a855f7'), width()],
    plots: [{ key: 'rsi', label: 'RSI', type: 'line', colorParam: 'color' }],
    levels: [30, 50, 70],
  },
  rate_of_change: {
    label: 'Rate Of Change', group: 'osc', pane: 'sub',
    params: [period(9), col('#22c55e'), width()],
    plots: [{ key: 'roc', label: 'ROC', type: 'line', colorParam: 'color' }],
  },
  stochastic: {
    label: 'Stochastic Oscillator', group: 'osc', pane: 'sub',
    params: [
      { key: 'k', label: '%K period', type: 'int', def: 14, min: 1, max: 200 },
      { key: 'd', label: '%D period', type: 'int', def: 3, min: 1, max: 100 },
      { key: 'slow', label: 'Slowing', type: 'int', def: 3, min: 1, max: 100 },
      col('#22d3ee'), col2('#f59e0b'), width(),
    ],
    plots: [
      { key: 'k', label: '%K', type: 'line', colorParam: 'color' },
      { key: 'd', label: '%D', type: 'line', colorParam: 'color2' },
    ],
    levels: [20, 80],
  },
  schaff_trend_cycle: {
    label: 'Schaff Trend Cycle', group: 'osc', pane: 'sub',
    params: [
      { key: 'fast', label: 'Fast', type: 'int', def: 23, min: 2, max: 200 },
      { key: 'slow', label: 'Slow', type: 'int', def: 50, min: 3, max: 400 },
      { key: 'cycle', label: 'Cycle', type: 'int', def: 10, min: 2, max: 100 },
      col('#e879f9'), width(),
    ],
    plots: [{ key: 'stc', label: 'STC', type: 'line', colorParam: 'color' }],
    levels: [25, 75],
  },
  vortex: {
    label: 'Vortex', group: 'osc', pane: 'sub',
    params: [period(14), col('#22c55e'), col2('#f43f5e'), width()],
    plots: [
      { key: 'viPlus', label: 'VI+', type: 'line', colorParam: 'color' },
      { key: 'viMinus', label: 'VI-', type: 'line', colorParam: 'color2' },
    ],
  },
  volume_oscillator: {
    label: 'Volume Oscillator', group: 'osc', pane: 'sub',
    params: [
      { key: 'fast', label: 'Fast', type: 'int', def: 5, min: 1, max: 200 },
      { key: 'slow', label: 'Slow', type: 'int', def: 10, min: 2, max: 400 },
      col('#60a5fa'),
    ],
    plots: [{ key: 'vo', label: 'Volume Osc', type: 'hist', colorParam: 'color' }],
    approxVolume: true,
  },
  williams_r: {
    label: 'Williams %R', group: 'osc', pane: 'sub',
    params: [period(14), col('#22d3ee'), width()],
    plots: [{ key: 'wr', label: '%R', type: 'line', colorParam: 'color' }],
    levels: [-80, -20],
  },
  weis_waves_volume: {
    label: 'Weis Waves Volume', group: 'osc', pane: 'sub',
    params: [
      { key: 'depth', label: 'Wave depth', type: 'int', def: 6, min: 2, max: 100 },
      col('#22c55e'), col2('#f43f5e'),
    ],
    plots: [{ key: 'wave', label: 'Wave volume', type: 'hist', colorParam: 'color' }],
    approxVolume: true,
  },
};

export const GROUPS = [
  { id: 'trend', label: 'Trend' },
  { id: 'osc', label: 'Oscillators' },
];

export const listByGroup = (group) => Object.entries(INDICATORS)
  .filter(([, def]) => def.group === group)
  .map(([id, def]) => ({ id, ...def }));

export const defaultParams = (kind) => {
  const def = INDICATORS[kind];
  if (!def) return {};
  const out = {};
  for (const p of def.params) out[p.key] = p.def;
  return out;
};

export const plotColor = (plot, params) => (plot.colorParam ? params[plot.colorParam] : plot.color) || '#14b877';
