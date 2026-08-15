import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, Trash2, X, Ban, Plus, SlidersHorizontal } from 'lucide-react';
import { GROUPS, INDICATORS, listByGroup } from './catalog';

const Field = ({ p, value, onChange, testId }) => {
  if (p.type === 'color') {
    return (
      <label className="flex items-center justify-between gap-2 py-1">
        <span className="text-[11px] font-semibold text-white/55">{p.label}</span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId}
               className="h-6 w-9 rounded border border-white/15 bg-transparent p-0 cursor-pointer" />
      </label>
    );
  }
  if (p.type === 'select') {
    return (
      <label className="flex items-center justify-between gap-2 py-1">
        <span className="text-[11px] font-semibold text-white/55">{p.label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId}
                className="h-7 rounded-md bg-white/[0.06] border border-white/10 px-1.5 text-[11px] font-bold text-white/85 outline-none">
          {p.options.map(([v, label]) => <option key={v} value={v} className="bg-[#07150f]">{label}</option>)}
        </select>
      </label>
    );
  }
  const step = p.type === 'float' ? 0.01 : 1;
  return (
    <label className="flex items-center justify-between gap-2 py-1">
      <span className="text-[11px] font-semibold text-white/55">{p.label}</span>
      <input type="number" value={value} min={p.min} max={p.max} step={step} data-testid={testId}
             onChange={(e) => {
               const raw = Number(e.target.value);
               if (!Number.isFinite(raw)) return;
               onChange(Math.max(p.min, Math.min(p.max, p.type === 'float' ? raw : Math.round(raw))));
             }}
             className="h-7 w-16 rounded-md bg-white/[0.06] border border-white/10 px-1.5 text-[11px] font-bold text-white/85 outline-none" />
    </label>
  );
};

/**
 * Indicators panel — catalogue on top (Trend / Oscillators, tap to add) and the
 * active instances below, each expandable into its own settings block.
 */
export default function IndicatorPanel({
  variant = 'desktop', indicators, onAdd, onUpdate, onSaveNow, onRemove, onClear, onClose,
}) {
  const [openGroup, setOpenGroup] = useState('trend');
  const [openId, setOpenId] = useState(null);

  const body = (
    <>
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-[14px] font-extrabold text-white/90">Indicators</span>
        <button onClick={onClose} data-testid="indicators-close"
                className="h-7 w-7 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/[0.08]">
          <X size={15} />
        </button>
      </div>

      {GROUPS.map((g) => (
        <div key={g.id} className="pb-1">
          <button onClick={() => setOpenGroup(openGroup === g.id ? null : g.id)} data-testid={`ind-group-${g.id}`}
                  className="w-full flex items-center gap-1.5 px-1.5 py-1.5 rounded-lg text-[9.5px] font-bold tracking-[0.14em] text-white/40 hover:bg-white/[0.05]">
            {openGroup === g.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {g.label.toUpperCase()}
          </button>
          {openGroup === g.id && (
            <div className={variant === 'mobile' ? 'grid grid-cols-2 gap-1' : 'flex flex-col gap-0.5'}>
              {listByGroup(g.id).map((ind) => (
                <button key={ind.id} onClick={() => { const item = onAdd(ind.id); if (item) setOpenId(item.id); }}
                        data-testid={`ind-add-${ind.id}`}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-[12px] font-semibold text-white/75 hover:bg-white/[0.07] active:bg-white/[0.1]">
                  <Plus size={13} className="shrink-0 opacity-50" />
                  <span className="flex-1 truncate">{ind.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center justify-between px-1.5 pt-2 pb-1">
        <span className="text-[9.5px] font-bold tracking-[0.14em] text-white/35">
          ACTIVE ({indicators.length})
        </span>
        {indicators.length > 0 && (
          <button onClick={onClear} data-testid="indicators-clear-all"
                  className="h-6 w-7 rounded-md bg-white/[0.05] text-[#f43f5e] hover:bg-[#f43f5e]/15 flex items-center justify-center">
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {indicators.length === 0 ? (
        <div className="flex items-center gap-2 px-2.5 py-2 text-[11.5px] text-white/35">
          <Ban size={13} /> No indicator on this pair
        </div>
      ) : (
        <div className="flex flex-col gap-1" data-testid="indicators-active-list">
          {indicators.map((item) => {
            const def = INDICATORS[item.kind];
            if (!def) return null;
            const open = openId === item.id;
            return (
              <div key={item.id} data-testid={`ind-item-${item.id}`}
                   className={`rounded-lg ${open ? 'bg-white/[0.05] ring-1 ring-white/[0.08]' : 'hover:bg-white/[0.05]'}`}>
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: item.params?.color || '#14b877' }} />
                  <button onClick={() => setOpenId(open ? null : item.id)} data-testid={`ind-open-${item.id}`}
                          className="flex-1 text-left text-[11.5px] font-semibold text-white/75 truncate">
                    {def.label}
                    {item.params?.period ? <span className="text-white/40"> · {item.params.period}</span> : null}
                  </button>
                  <button onClick={() => setOpenId(open ? null : item.id)}
                          className="h-6 w-6 flex items-center justify-center rounded text-white/40 hover:text-white">
                    <SlidersHorizontal size={12} />
                  </button>
                  <button onClick={() => onUpdate(item.id, { visible: item.visible === false })} data-testid={`ind-eye-${item.id}`}
                          className="h-6 w-6 flex items-center justify-center rounded text-white/45 hover:text-white">
                    {item.visible === false ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <button onClick={() => onRemove(item.id)} data-testid={`ind-del-${item.id}`}
                          className="h-6 w-6 flex items-center justify-center rounded text-white/40 hover:text-[#f43f5e]">
                    <Trash2 size={13} />
                  </button>
                </div>
                {open && (
                  <div className="px-2.5 pb-2 pt-1 border-t border-white/[0.06]" data-testid={`ind-settings-${item.id}`}>
                    {def.params.map((p) => (
                      <Field key={p.key} p={p} value={item.params?.[p.key] ?? p.def}
                             testId={`ind-param-${item.id}-${p.key}`}
                             onChange={(v) => onUpdate(item.id, { params: { [p.key]: v } })} />
                    ))}
                    {def.approxVolume && (
                      <p className="pt-1 text-[10px] font-semibold text-[#f59e0b]/80 leading-snug">
                        Volume is approximated from candle range (the OTC feed has no real volume).
                      </p>
                    )}
                    <button onClick={() => { onSaveNow(item.id); setOpenId(null); }} data-testid={`ind-done-${item.id}`}
                            className="mt-1.5 w-full h-7 rounded-md bg-gradient-to-r from-[#14b877] to-[#0ea968] text-[11px] font-extrabold text-[#03150d]">
                      Done
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  if (variant === 'mobile') {
    return (
      <div className="fixed inset-x-0 bottom-0 z-[60] md:hidden" data-testid="indicators-panel-mobile" data-chart-overlay="1">
        <div className="absolute inset-0 -top-[100vh] bg-black/45" onClick={onClose} />
        <div className="relative rounded-t-2xl bg-[#050f0a] border-t border-white/[0.1] px-3 pt-3 pb-6 max-h-[68vh] overflow-y-auto shadow-[0_-14px_40px_rgba(0,0,0,0.6)] tp-fade-up">
          <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-white/20" />
          {body}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#050f0a]/95 backdrop-blur-xl border border-white/[0.09] p-2 w-[248px] max-h-[74vh] overflow-y-auto shadow-[0_10px_30px_rgba(0,0,0,0.5)] tp-fade-up"
         data-testid="indicators-panel-desktop">
      {body}
    </div>
  );
}
