import React, { useMemo } from 'react';
import { Lightning, Clock } from '@phosphor-icons/react';
import { TIMER_STEPS, fmtDur, resolveTimeTarget, buildTimeChips } from './durations';

export default function DurationSheet({ open, onClose, duration, setDuration, mode, setMode }) {
  const timeChips = useMemo(() => buildTimeChips(), [open]); // eslint-disable-line
  if (!open) return null;

  const pick = (d) => { setDuration(d); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden" data-testid="duration-sheet">
      <div className="flex-1 bg-black/50 backdrop-blur-[3px]" onClick={onClose} data-testid="duration-sheet-backdrop" />
      <div className="bg-gradient-to-b from-[#071410] to-[#040D09] border-t border-white/[0.09] pb-[calc(0.75rem+env(safe-area-inset-bottom))] tp-fade-up">
        {/* Blitz | Fixed Time toggle */}
        <div className="grid grid-cols-2 gap-2 p-3 pb-2">
          <button onClick={() => setMode('timer')} data-testid="duration-sheet-blitz"
                  className={`h-11 rounded-xl text-[12.5px] font-bold tracking-wide flex items-center justify-center gap-1.5 border transition-colors ${mode === 'timer'
                    ? 'bg-[#14b877]/15 border-[#14b877]/50 text-[#14b877] shadow-[0_0_16px_rgba(20,184,119,0.15)]'
                    : 'border-white/[0.08] bg-white/[0.03] text-white/50'}`}>
            <Lightning size={15} weight="bold" /> Blitz
          </button>
          <button onClick={() => setMode('time')} data-testid="duration-sheet-fixed"
                  className={`h-11 rounded-xl text-[12.5px] font-bold tracking-wide flex items-center justify-center gap-1.5 border transition-colors ${mode === 'time'
                    ? 'bg-[#14b877]/15 border-[#14b877]/50 text-[#14b877] shadow-[0_0_16px_rgba(20,184,119,0.15)]'
                    : 'border-white/[0.08] bg-white/[0.03] text-white/50'}`}>
            <Clock size={15} weight="bold" /> Fixed Time
          </button>
        </div>

        {/* Current value */}
        <div className="text-center text-[24px] font-extrabold text-white/85 tabular-nums pb-2" data-testid="duration-sheet-value">
          {fmtDur(duration)}
        </div>

        {/* Chips */}
        <div className="px-3 max-h-[46vh] overflow-y-auto">
          <div className="grid grid-cols-3 gap-2 pb-1">
            {mode === 'timer'
              ? TIMER_STEPS.map((s) => (
                  <button key={s} onClick={() => pick(s)} data-testid={`sheet-timer-chip-${s}`}
                          className={`h-11 rounded-xl text-[13px] font-bold tabular-nums border transition-colors active:scale-[0.96] ${duration === s
                            ? 'bg-[#14b877] border-[#14b877] text-[#03150d]'
                            : 'border-white/[0.08] bg-white/[0.04] text-white/85'}`}>
                    {fmtDur(s)}
                  </button>
                ))
              : timeChips.map(({ off, label }) => {
                  const { duration: d } = resolveTimeTarget(off);
                  return (
                    <button key={off} onClick={() => pick(d)} data-testid={`sheet-time-chip-${off}m`}
                            className={`h-11 rounded-xl text-[13px] font-bold tabular-nums border transition-colors active:scale-[0.96] ${duration === d
                              ? 'bg-[#14b877] border-[#14b877] text-[#03150d]'
                              : 'border-white/[0.08] bg-white/[0.04] text-white/85'}`}>
                      {label}
                    </button>
                  );
                })}
          </div>
        </div>
      </div>
    </div>
  );
}
