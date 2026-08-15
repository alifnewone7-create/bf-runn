import React, { useRef } from 'react';

const TwoFACodeInput = ({ value, onChange, disabled, hasError, testPrefix = 'twofa' }) => {
  const refs = useRef([]);

  const handleKey = (e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = value.slice(0, -1);
      onChange(next);
      refs.current[Math.max(0, next.length)]?.focus();
    }
  };

  const handleChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (!raw) return;
    const next = (value + raw).slice(0, 6);
    onChange(next);
    refs.current[Math.min(5, next.length)]?.focus();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const raw = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (raw) {
      onChange(raw);
      refs.current[Math.min(5, raw.length)]?.focus();
    }
  };

  const base = 'h-12 w-10 sm:h-14 sm:w-12 text-center text-[20px] sm:text-[22px] font-bold rounded-xl bg-white/[0.04] text-white caret-transparent focus:outline-none transition';
  const ok = ' border border-white/12 focus:border-[#14b877] focus:ring-2 focus:ring-[#14b877]/25';
  const err = ' border border-red-500/70 focus:border-red-500 focus:ring-2 focus:ring-red-500/25';

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-2.5" onPaste={handlePaste} data-testid={`${testPrefix}-code-boxes`}>
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          value={value[i] || ''}
          onChange={handleChange}
          onKeyDown={handleKey}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          autoComplete="one-time-code"
          disabled={disabled}
          data-testid={`${testPrefix}-code-input-${i}`}
          className={base + (hasError ? err : ok)}
        />
      ))}
    </div>
  );
};

export default TwoFACodeInput;
