import React, { useState } from 'react';
import { Eye, EyeOff, Trash2, X, GripVertical, Pencil, ChevronDown, Minus, Plus, Copy } from 'lucide-react';
import { DRAW_PALETTE, DRAW_STYLES, TOOL_MAP } from './tools';

const DASH_PREVIEW = {
  solid: 'linear-gradient(to right, currentColor 0 100%)',
  dashed: 'repeating-linear-gradient(to right, currentColor 0 7px, transparent 7px 12px)',
  dotted: 'repeating-linear-gradient(to right, currentColor 0 2px, transparent 2px 6px)',
};

const clampW = (w) => Math.max(1, Math.min(10, w));

// Compact TradingView-style editor for the selected drawing.
// Desktop: top centre · Mobile: bottom centre.
export default function DrawingStyleBar({ drawing, onChange, onDuplicate, onRemove, onClose }) {
  const [open, setOpen] = useState(null); // 'color' | 'line' | null
  if (!drawing) return null;
  const accent = drawing.color || '#14b877';
  const width = clampW(drawing.width || 2);
  const style = drawing.style || 'solid';
  const toggle = (k) => setOpen((v) => (v === k ? null : k));

  const popCls = 'absolute bottom-full mb-2 md:bottom-auto md:top-full md:mt-2 md:mb-0 rounded-xl border border-white/[0.1] p-2 shadow-[0_16px_40px_rgba(0,0,0,0.65)] tp-fade-up';
  const popStyle = {
    background: 'linear-gradient(135deg, rgba(10,36,25,0.98) 0%, rgba(4,16,11,0.98) 55%, rgba(11,42,30,0.98) 100%)',
  };

  return (
    <div data-chart-overlay="1"
         className="absolute left-0 right-0 bottom-3 md:bottom-auto md:top-2 z-[40] flex justify-center px-2 pointer-events-none">
      <div data-testid="drawing-style-bar" data-chart-overlay="1"
           style={{
             background: 'linear-gradient(135deg, rgba(8,32,22,0.97) 0%, rgba(4,16,11,0.96) 45%, rgba(10,38,27,0.97) 100%)',
             boxShadow: `0 14px 38px rgba(0,0,0,0.6), 0 0 0 1px ${accent}2e, inset 0 1px 0 rgba(255,255,255,0.06)`,
           }}
           className="pointer-events-auto relative flex items-stretch rounded-xl backdrop-blur-xl border border-white/[0.1] overflow-visible tp-fade-up">

        <span className="flex items-center px-1.5 text-white/25" title={TOOL_MAP[drawing.tool]?.label || drawing.tool}>
          <GripVertical size={14} />
        </span>

        {/* Colour */}
        <div className="relative flex border-l border-white/[0.07]">
          <button type="button" data-testid="draw-pen-btn" onClick={() => toggle('color')}
                  className={`h-9 w-10 flex flex-col items-center justify-center gap-1 transition-colors ${open === 'color' ? 'bg-white/[0.1]' : 'hover:bg-white/[0.07]'}`}>
            <Pencil size={14} className="text-white/85" />
            <span className="h-[3px] w-4 rounded-full" style={{ background: accent }} />
          </button>
          {open === 'color' && (
            <div data-testid="draw-color-pop" style={popStyle} className={`${popCls} left-0 w-[188px]`}>
              <div className="grid grid-cols-6 gap-1.5">
                {DRAW_PALETTE.map((c) => (
                  <button key={c} type="button" data-testid={`draw-color-${c.replace('#', '')}`}
                          onClick={() => { onChange({ color: c }); setOpen(null); }}
                          className={`h-6 w-6 rounded-md border transition-transform hover:scale-110 ${drawing.color === c ? 'border-white scale-110' : 'border-white/15'}`}
                          style={{ background: `linear-gradient(140deg, ${c} 0%, ${c}b3 100%)` }} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Line style + thickness */}
        <div className="relative flex border-l border-white/[0.07]">
          <button type="button" data-testid="draw-line-btn" onClick={() => toggle('line')}
                  className={`h-9 px-2.5 flex items-center gap-1.5 transition-colors ${open === 'line' ? 'bg-white/[0.1]' : 'hover:bg-white/[0.07]'}`}>
            <span className="w-6 rounded-full text-white/85" style={{ height: Math.min(width, 6), background: DASH_PREVIEW[style], color: '#ffffffd9' }} />
            <ChevronDown size={12} className="text-white/45" />
          </button>
          {open === 'line' && (
            <div data-testid="draw-line-pop" style={popStyle} className={`${popCls} left-1/2 -ml-[86px] w-[172px]`}>
              <div className="flex flex-col gap-1">
                {DRAW_STYLES.map(([id, label]) => (
                  <button key={id} type="button" data-testid={`draw-style-${id}`}
                          onClick={() => onChange({ style: id })}
                          className={`h-8 px-2 rounded-lg flex items-center gap-2 text-[11px] font-bold transition-colors ${style === id ? 'bg-gradient-to-r from-[#14b877]/35 to-[#0b5f3d]/20 text-white ring-1 ring-[#14b877]/40' : 'text-white/65 hover:bg-white/[0.07]'}`}>
                    <span className="flex-1 rounded-full" style={{ height: 2, background: DASH_PREVIEW[id], color: '#ffffffcc' }} />
                    <span className="w-12 text-right">{label}</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-white/[0.08] flex items-center justify-between">
                <span className="pl-1 text-[10px] font-bold tracking-[0.1em] text-white/40">THICKNESS</span>
                <div className="flex items-center gap-1">
                  <button type="button" data-testid="draw-width-dec" disabled={width <= 1}
                          onClick={() => onChange({ width: clampW(width - 1) })}
                          className="h-6 w-6 rounded-md bg-white/[0.06] text-white/80 hover:bg-white/[0.12] disabled:opacity-30 flex items-center justify-center">
                    <Minus size={12} />
                  </button>
                  <span data-testid="draw-width-value" className="w-6 text-center text-[12px] font-extrabold text-white">{width}</span>
                  <button type="button" data-testid="draw-width-inc" disabled={width >= 10}
                          onClick={() => onChange({ width: clampW(width + 1) })}
                          className="h-6 w-6 rounded-md bg-gradient-to-br from-[#14b877]/35 to-[#0b5f3d]/20 text-white hover:from-[#14b877]/55 disabled:opacity-30 flex items-center justify-center">
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Visibility */}
        <button type="button" onClick={() => onChange({ visible: drawing.visible === false })} data-testid="draw-toggle-visible"
                className="h-9 w-9 border-l border-white/[0.07] text-white/70 hover:bg-white/[0.07] flex items-center justify-center">
          {drawing.visible === false ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>

        {/* Duplicate — exact same shape, size and style, offset 3 bars right. */}
        <button type="button" onClick={onDuplicate} data-testid="draw-copy-selected" title="Duplicate"
                className="h-9 w-9 border-l border-white/[0.07] text-white/70 hover:bg-white/[0.07] hover:text-white flex items-center justify-center">
          <Copy size={14} />
        </button>

        {/* Delete */}
        <button type="button" onClick={onRemove} data-testid="draw-delete-selected"
                className="h-9 w-9 border-l border-white/[0.07] text-[#f43f5e] hover:bg-[#f43f5e]/15 flex items-center justify-center">
          <Trash2 size={14} />
        </button>

        {/* Close */}
        <button type="button" onClick={onClose} data-testid="draw-style-close"
                className="h-9 w-9 border-l border-white/[0.07] rounded-r-xl text-white/45 hover:bg-white/[0.07] flex items-center justify-center">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
