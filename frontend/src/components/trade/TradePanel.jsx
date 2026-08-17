import React, { useMemo, useState } from 'react';
import { Plus, Minus, ArrowUp, ArrowDown, Clock, Timer, CaretDown } from '@phosphor-icons/react';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import { AssetIcon } from './AssetIcon';
import AmountSheet from './AmountSheet';
import DurationSheet from './DurationSheet';
import { TIMER_STEPS, fmtDur, resolveTimeTarget, buildTimeChips } from './durations';

export { TIMER_STEPS, fmtDur, resolveTimeTarget };

const QUICK_AMOUNTS = [5, 10, 50, 100];

const Stepper = ({ label, onMinus, onPlus, children, testId }) => (
  <div className="rounded-xl border border-white/[0.08] bg-black/30 px-1.5 py-1.5 flex items-center gap-1" data-testid={testId}>
    <button onClick={onMinus} data-testid={`${testId}-minus`}
            className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg bg-white/[0.04] text-white/50 hover:text-white hover:bg-white/[0.09] transition-colors">
      <Minus size={14} weight="bold" />
    </button>
    <div className="flex-1 text-center min-w-0">
      <div className="text-[9.5px] uppercase tracking-[0.14em] text-white/40 font-semibold">{label}</div>
      {children}
    </div>
    <button onClick={onPlus} data-testid={`${testId}-plus`}
            className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg bg-white/[0.04] text-white/50 hover:text-white hover:bg-white/[0.09] transition-colors">
      <Plus size={14} weight="bold" />
    </button>
  </div>
);

/**
 * DurationPicker — Quotex-style Timer|Time toggle (desktop popover).
 */
function DurationPicker({ mode, setMode, duration, setDuration }) {
  const [open, setOpen] = useState(false);
  const timeChips = useMemo(() => buildTimeChips(), [open]); // eslint-disable-line

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          data-testid="duration-picker-button"
          className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-1.5 py-1.5 flex items-center gap-1 hover:border-[#14b877]/30 transition-colors group"
        >
          <span className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg bg-[#14b877]/[0.09] text-[#14b877]">
            {mode === 'time' ? <Clock size={15} weight="bold" /> : <Timer size={15} weight="bold" />}
          </span>
          <div className="flex-1 text-center">
            <div className="text-[9.5px] uppercase tracking-[0.14em] text-white/40 font-semibold">
              {mode === 'time' ? 'Time' : 'Timer'}
            </div>
            <div className="text-[16px] font-bold text-white tabular-nums leading-tight" data-testid="trade-duration-value">
              {fmtDur(duration)}
            </div>
          </div>
          <span className="h-9 w-6 shrink-0 flex items-center justify-center text-white/30 group-hover:text-white/60 transition-colors">
            <CaretDown size={11} weight="bold" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[268px] p-0 bg-[#071410]/95 backdrop-blur-xl border border-white/10 text-white rounded-2xl overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
      >
        {/* Timer|Time toggle */}
        <div className="grid grid-cols-2 gap-1 p-1.5 bg-black/40 border-b border-white/[0.07]">
          <button
            onClick={() => setMode('timer')}
            data-testid="duration-mode-timer"
            className={`py-2 text-[11.5px] font-bold tracking-wider rounded-lg transition-colors flex items-center justify-center gap-1.5 ${mode === 'timer' ? 'bg-[#14b877] text-[#03150d]' : 'text-white/50 hover:text-white hover:bg-white/[0.05]'}`}
          >
            <Timer size={13} weight="bold" /> TIMER
          </button>
          <button
            onClick={() => setMode('time')}
            data-testid="duration-mode-time"
            className={`py-2 text-[11.5px] font-bold tracking-wider rounded-lg transition-colors flex items-center justify-center gap-1.5 ${mode === 'time' ? 'bg-[#14b877] text-[#03150d]' : 'text-white/50 hover:text-white hover:bg-white/[0.05]'}`}
          >
            <Clock size={13} weight="bold" /> TIME
          </button>
        </div>

        {/* Body */}
        <div className="p-2.5 max-h-[264px] overflow-y-auto">
          {mode === 'timer' ? (
            <div className="grid grid-cols-3 gap-1.5">
              {TIMER_STEPS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setDuration(s); setOpen(false); }}
                  data-testid={`timer-chip-${s}`}
                  className={`py-2 rounded-lg text-[12px] font-bold tabular-nums transition-colors ${duration === s ? 'bg-[#14b877] text-[#03150d]' : 'bg-white/[0.05] text-white/85 hover:bg-white/[0.1]'}`}
                >
                  {fmtDur(s)}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {timeChips.map(({ off, label }) => {
                const { duration: d } = resolveTimeTarget(off);
                const isActive = duration === d;
                return (
                  <button
                    key={off}
                    onClick={() => { setDuration(d); setOpen(false); }}
                    data-testid={`time-chip-${off}m`}
                    className={`py-2 rounded-lg text-[12px] font-bold tabular-nums transition-colors ${isActive ? 'bg-[#14b877] text-[#03150d]' : 'bg-white/[0.05] text-white/85 hover:bg-white/[0.1]'}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function TradePanel({ instrument, amount, setAmount, duration, setDuration, onTrade, placing, mobile, balance, onHoverDir }) {
  // Payout may be momentarily unknown (socket table not in yet) — show a dash
  // instead of a misleading 0%.
  const payoutKnown = Number(instrument?.payout) > 0;
  const payout = payoutKnown ? Number(instrument.payout) : 0;
  const payoutLabel = payoutKnown ? `${payout}%` : '—';
  const profit = (Number(amount) || 0) * payout / 100;
  const [mode, setMode] = useState(() => localStorage.getItem('bfg_dur_mode') || 'timer');
  const [sheet, setSheet] = useState(null); // 'amount' | 'duration' | null
  const setModeSafe = (m) => { setMode(m); localStorage.setItem('bfg_dur_mode', m); };

  const stepAmt = (dir) => setAmount(Math.max(1, (Number(amount) || 1) + dir));

  const higherBtn = (
    <button onClick={() => onTrade('higher')} data-testid="trade-higher-button"
            onMouseEnter={() => onHoverDir?.('higher')} onMouseLeave={() => onHoverDir?.(null)}
            className="flex-1 lg:flex-none h-12 lg:h-[54px] flex items-center justify-between rounded-xl font-extrabold text-[15px] lg:text-[16px] tracking-[0.1em] px-4 lg:px-4 text-[#03150d] bg-gradient-to-b from-[#26e69d] via-[#14b877] to-[#0d9c63] shadow-[0_6px_24px_rgba(20,184,119,0.3),inset_0_1px_0_rgba(255,255,255,0.35)] hover:shadow-[0_8px_32px_rgba(20,184,119,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] hover:brightness-110 active:scale-[0.97] transition-[transform,box-shadow,filter] duration-150 disabled:opacity-50 disabled:pointer-events-none">
      UP
      <span className="h-7 w-7 lg:h-7 lg:w-7 rounded-full bg-[#03150d]/[0.16] ring-1 ring-[#03150d]/10 flex items-center justify-center shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)]">
        <ArrowUp className="text-[15px] lg:text-[15px]" size={undefined} style={{ width: '1em', height: '1em' }} weight="bold" />
      </span>
    </button>
  );
  const lowerBtn = (
    <button onClick={() => onTrade('lower')} data-testid="trade-lower-button"
            onMouseEnter={() => onHoverDir?.('lower')} onMouseLeave={() => onHoverDir?.(null)}
            className="flex-1 lg:flex-none h-12 lg:h-[54px] flex items-center justify-between rounded-xl font-extrabold text-[15px] lg:text-[16px] tracking-[0.1em] px-4 lg:px-4 text-white bg-gradient-to-b from-[#fb6b82] via-[#f43f5e] to-[#d1203f] shadow-[0_6px_24px_rgba(244,63,94,0.28),inset_0_1px_0_rgba(255,255,255,0.25)] hover:shadow-[0_8px_32px_rgba(244,63,94,0.5),inset_0_1px_0_rgba(255,255,255,0.25)] hover:brightness-110 active:scale-[0.97] transition-[transform,box-shadow,filter] duration-150 disabled:opacity-50 disabled:pointer-events-none">
      DOWN
      <span className="h-7 w-7 lg:h-7 lg:w-7 rounded-full bg-black/[0.22] ring-1 ring-white/15 flex items-center justify-center shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)]">
        <ArrowDown className="text-[15px] lg:text-[15px]" size={undefined} style={{ width: '1em', height: '1em' }} weight="bold" />
      </span>
    </button>
  );

  if (mobile) {
    return (
      <>
        <div className="lg:hidden shrink-0 border-t border-white/[0.07] bg-[#050f0a]/95 backdrop-blur-xl px-3 pt-2 pb-2" data-testid="trade-panel-mobile">
          {/* Investments + Expiration boxes */}
          <div className="flex gap-2">
            <button onClick={() => setSheet('amount')} data-testid="mobile-investment-box"
                    className="flex-1 text-left rounded-xl border border-white/[0.09] bg-black/30 px-3 py-1.5 active:bg-white/[0.05] transition-colors">
              <div className="text-[9px] uppercase tracking-[0.14em] text-white/40 font-semibold">Investments</div>
              <div className="flex items-center">
                <span className="flex-1 text-[15px] font-bold text-white tabular-nums" data-testid="mobile-investment-value">{amount}</span>
                <span className="text-[12px] font-bold text-white/40">$</span>
              </div>
            </button>
            <button onClick={() => setSheet('duration')} data-testid="mobile-expiration-box"
                    className="flex-1 text-left rounded-xl border border-white/[0.09] bg-black/30 px-3 py-1.5 active:bg-white/[0.05] transition-colors">
              <div className="text-[9px] uppercase tracking-[0.14em] text-white/40 font-semibold">Expiration</div>
              <div className="flex items-center">
                <span className="flex-1 text-[15px] font-bold text-white tabular-nums" data-testid="mobile-expiration-value">{fmtDur(duration)}</span>
                {mode === 'time' ? <Clock size={13} className="text-white/40" /> : <Timer size={13} className="text-white/40" />}
              </div>
            </button>
          </div>

          {/* Profit line */}
          <div className="flex items-center justify-between mt-1.5 px-0.5">
            <span className="text-[11px] font-semibold text-[#14b877]/85">Profit: <span className="tabular-nums">+{payoutLabel}</span></span>
            <span className="text-[11.5px] font-bold text-[#14b877] tabular-nums" data-testid="mobile-profit-amount">+${profit.toFixed(2)}</span>
          </div>

          {/* DOWN | UP */}
          <div className="flex gap-2 mt-1.5">
            {lowerBtn}
            {higherBtn}
          </div>
        </div>

        <AmountSheet open={sheet === 'amount'} onClose={() => setSheet(null)} amount={amount} balance={balance} onConfirm={(v) => setAmount(v)} />
        <DurationSheet open={sheet === 'duration'} onClose={() => setSheet(null)} duration={duration} setDuration={setDuration} mode={mode} setMode={setModeSafe} />
      </>
    );
  }

  const amountBox = (
    <Stepper label="Investment" onMinus={() => stepAmt(-1)} onPlus={() => stepAmt(1)} testId="trade-amount">
      <div className="flex items-center justify-center text-white font-bold leading-tight">
        <span className="text-[13px] text-[#14b877]/80 mr-0.5">$</span>
        <input type="number" min="1" value={amount} data-testid="trade-amount-input"
               onChange={(e) => setAmount(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
               className="w-14 bg-transparent text-center text-[16px] font-bold text-white focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
      </div>
    </Stepper>
  );

  return (
    <aside className="hidden lg:flex w-[300px] shrink-0 flex-col gap-3 border-l border-white/[0.07] bg-[#050f0a]/95 backdrop-blur-xl p-3.5 overflow-y-auto" data-testid="trade-panel-desktop">
      {instrument && (
        <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-transparent px-3 py-3">
          <AssetIcon icon={instrument.icon} size={28} />
          <span className="flex-1 min-w-0 leading-tight">
            <span className="block text-[14px] font-bold text-white truncate">{instrument.name}</span>
            <span className="block text-[10.5px] text-white/40 uppercase tracking-wider">OTC Market</span>
          </span>
          <span className="shrink-0 inline-flex items-center rounded-lg bg-[#14b877]/10 border border-[#14b877]/25 px-2 py-1 text-[12.5px] font-bold text-[#14b877] tabular-nums" data-testid="trade-panel-payout-chip">
            {payoutLabel}
          </span>
        </div>
      )}

      {amountBox}

      {/* Quick amount chips */}
      <div className="grid grid-cols-4 gap-1.5 -mt-1">
        {QUICK_AMOUNTS.map((v) => (
          <button key={v} onClick={() => setAmount(v)} data-testid={`quick-amount-${v}`}
                  className={`py-1.5 rounded-lg text-[11.5px] font-bold tabular-nums transition-colors ${Number(amount) === v ? 'bg-[#14b877]/15 text-[#14b877] border border-[#14b877]/30' : 'bg-white/[0.04] text-white/50 border border-transparent hover:text-white hover:bg-white/[0.08]'}`}>
            ${v}
          </button>
        ))}
      </div>

      <DurationPicker mode={mode} setMode={setModeSafe} duration={duration} setDuration={setDuration} />

      {/* UP / DOWN */}
      <div className="flex flex-col gap-3 mt-1">
        {higherBtn}
        {lowerBtn}
      </div>
    </aside>
  );
}
