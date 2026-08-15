import React from 'react';
import { ChevronRight, Eye, EyeOff, Trash2, X, Ban } from 'lucide-react';
import { TOOLS, TOOL_MAP } from './tools';

const Row = ({ children, onClick, active, testId }) => (
  <button onClick={onClick} data-testid={testId}
          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[12.5px] font-semibold transition-colors ${
            active ? 'bg-[#14b877]/18 text-[#14b877]' : 'text-white/75 hover:bg-white/[0.07] active:bg-white/[0.1]'}`}>
    {children}
  </button>
);

/**
 * Drawing tools panel. Same content, two shells:
 *  - desktop: compact list docked beside the vertical rail
 *  - mobile: bottom sheet with big tap targets
 */
export default function DrawingPanel({
  variant = 'desktop', tool, mode, drawings, selectedId, hideAll,
  onPick, onClose, onToggleHideAll, onClear, onSelect, onToggleVisible, onRemove,
}) {
  const body = (
    <>
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-[14px] font-extrabold text-white/90">Drawings</span>
        <button onClick={onClose} data-testid="drawings-close"
                className="h-7 w-7 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/[0.08]">
          <X size={15} />
        </button>
      </div>

      <div className="flex items-center gap-1 pb-2">
        <span className="flex-1 px-1.5 text-[10.5px] font-semibold text-white/40 leading-tight">
          Tap any drawing on the chart to edit it
        </span>
        <button onClick={onToggleHideAll} data-testid="drawings-toggle-all"
                className="h-8 w-9 rounded-lg bg-white/[0.05] text-white/70 hover:bg-white/[0.1] flex items-center justify-center">
          {hideAll ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button onClick={onClear} data-testid="drawings-clear-all"
                className="h-8 w-9 rounded-lg bg-white/[0.05] text-[#f43f5e] hover:bg-[#f43f5e]/15 flex items-center justify-center">
          <Trash2 size={14} />
        </button>
      </div>

      <div className="text-[9.5px] font-bold tracking-[0.14em] text-white/35 px-1.5 pb-1">DRAWINGS</div>
      <div className={variant === 'mobile' ? 'grid grid-cols-2 gap-1' : 'flex flex-col gap-0.5'}>
        {TOOLS.map((t) => (
          <Row key={t.id} testId={`draw-tool-${t.id}`} active={mode === 'draw' && tool === t.id} onClick={() => onPick(t.id)}>
            <t.icon size={15} className="shrink-0 opacity-80" />
            <span className="flex-1 truncate">{t.label}</span>
            {variant !== 'mobile' && <ChevronRight size={13} className="opacity-35" />}
          </Row>
        ))}
      </div>

      <div className="text-[9.5px] font-bold tracking-[0.14em] text-white/35 px-1.5 pt-3 pb-1">
        OBJECTS ({drawings.length})
      </div>
      {drawings.length === 0 ? (
        <div className="flex items-center gap-2 px-2.5 py-2 text-[11.5px] text-white/35">
          <Ban size={13} /> Nothing drawn on this pair
        </div>
      ) : (
        <div className="flex flex-col gap-0.5" data-testid="drawings-object-list">
          {drawings.map((d) => (
            <div key={d.id} data-testid={`draw-object-${d.id}`}
                 className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 ${selectedId === d.id ? 'bg-[#14b877]/15' : 'hover:bg-white/[0.06]'}`}>
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
              <button onClick={() => onSelect(d.id)} className="flex-1 text-left text-[11.5px] font-semibold text-white/70 truncate">
                {TOOL_MAP[d.tool]?.label || d.tool}
              </button>
              <button onClick={() => onToggleVisible(d.id)} data-testid={`draw-object-eye-${d.id}`}
                      className="h-6 w-6 flex items-center justify-center rounded text-white/45 hover:text-white">
                {d.visible === false ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              <button onClick={() => onRemove(d.id)} data-testid={`draw-object-del-${d.id}`}
                      className="h-6 w-6 flex items-center justify-center rounded text-white/40 hover:text-[#f43f5e]">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );

  if (variant === 'mobile') {
    return (
      <div className="fixed inset-x-0 bottom-0 z-[60] md:hidden" data-testid="drawings-panel-mobile" data-chart-overlay="1">
        <div className="absolute inset-0 -top-[100vh] bg-black/45" onClick={onClose} />
        <div className="relative rounded-t-2xl bg-[#050f0a] border-t border-white/[0.1] px-3 pt-3 pb-6 max-h-[68vh] overflow-y-auto shadow-[0_-14px_40px_rgba(0,0,0,0.6)] tp-fade-up">
          <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-white/20" />
          {body}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#050f0a]/95 backdrop-blur-xl border border-white/[0.09] p-2 w-[228px] max-h-[74vh] overflow-y-auto shadow-[0_10px_30px_rgba(0,0,0,0.5)] tp-fade-up"
         data-testid="drawings-panel-desktop">
      {body}
    </div>
  );
}
