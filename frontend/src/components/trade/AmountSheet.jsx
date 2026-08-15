import React, { useEffect, useState } from 'react';
import { Backspace, ArrowsLeftRight } from '@phosphor-icons/react';

const KEYS = [
  ['1', '2', '3', 'back'],
  ['4', '5', '6', '+1'],
  ['7', '8', '9', '-1'],
  ['0', '.'],
];

export default function AmountSheet({ open, onClose, amount, balance, onConfirm }) {
  const [val, setVal] = useState('1');
  const [mode, setMode] = useState('usd');

  useEffect(() => {
    if (open) { setVal(String(amount || 1)); setMode('usd'); }
  }, [open]); // eslint-disable-line

  if (!open) return null;

  const press = (k) => setVal((v) => {
    if (k === 'back') return v.length > 1 ? v.slice(0, -1) : '0';
    if (k === '+1') return String(+(((parseFloat(v) || 0) + 1).toFixed(2)));
    if (k === '-1') return String(Math.max(0, +(((parseFloat(v) || 0) - 1).toFixed(2))));
    if (k === '.') return v.includes('.') ? v : v + '.';
    if (v.length >= 9) return v;
    return v === '0' ? k : v + k;
  });

  const switchMode = () => {
    const n = parseFloat(val) || 0;
    if (mode === 'usd') {
      setMode('pct');
      setVal(String(Math.max(0.1, Math.min(100, +((n / (balance || 1)) * 100).toFixed(2)))));
    } else {
      setMode('usd');
      setVal(String(Math.max(1, +(((n / 100) * (balance || 0)).toFixed(2)))));
    }
  };

  const confirm = () => {
    let n = parseFloat(val) || 0;
    if (mode === 'pct') n = +(((n / 100) * (balance || 0)).toFixed(2));
    onConfirm(Math.max(1, n));
    onClose();
  };

  const keyLabel = (k) => {
    if (k === 'back') return <Backspace size={20} weight="bold" />;
    return k;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden" data-testid="amount-sheet">
      <div className="flex-1 bg-black/50 backdrop-blur-[3px]" onClick={onClose} data-testid="amount-sheet-backdrop" />
      <div className="bg-gradient-to-b from-[#071410] to-[#040D09] border-t border-white/[0.09] pb-[calc(0.75rem+env(safe-area-inset-bottom))] tp-fade-up">
        {/* Keypad */}
        <div className="grid grid-cols-4 gap-2 p-3">
          {KEYS.flat().map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              data-testid={`keypad-${k === '.' ? 'dot' : k === '+1' ? 'plus1' : k === '-1' ? 'minus1' : k}`}
              className={`h-12 rounded-xl border text-[17px] font-bold tabular-nums flex items-center justify-center transition-colors active:scale-[0.96] ${k === '+1' || k === '-1'
                ? 'border-[#14b877]/25 bg-[#14b877]/[0.07] text-[#14b877]'
                : 'border-white/[0.08] bg-white/[0.04] text-white hover:bg-white/[0.08]'} ${k === '0' || k === '.' ? 'col-span-2' : ''}`}
            >
              {keyLabel(k)}
            </button>
          ))}
        </div>

        {/* Value box + switch */}
        <div className="px-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-[0.16em] text-white/40 font-semibold">Investments</span>
            <button onClick={switchMode} data-testid="amount-switch-mode"
                    className="flex items-center gap-1 text-[10.5px] font-bold text-[#14b877] uppercase tracking-wider">
              <ArrowsLeftRight size={12} weight="bold" /> Switch to {mode === 'usd' ? '%' : '$'}
            </button>
          </div>
          <div className="flex items-center rounded-xl border border-white/[0.1] bg-black/40 px-3.5 py-3" data-testid="amount-sheet-value">
            <span className="flex-1 text-[18px] font-bold text-white tabular-nums">{val}</span>
            <span className="text-[15px] font-bold text-white/45">{mode === 'usd' ? '$' : '%'}</span>
          </div>
          {mode === 'pct' && (
            <div className="mt-1 text-[11px] text-white/40 tabular-nums">
              ≈ ${(((parseFloat(val) || 0) / 100) * (balance || 0)).toFixed(2)} of ${Number(balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          )}
          <button onClick={confirm} data-testid="amount-sheet-confirm"
                  className="mt-2.5 w-full h-12 rounded-xl bg-gradient-to-b from-[#1ad48b] to-[#0fa066] text-[#03150d] text-[15px] font-bold shadow-[0_6px_24px_rgba(20,184,119,0.25)] active:scale-[0.98] transition-transform">
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
