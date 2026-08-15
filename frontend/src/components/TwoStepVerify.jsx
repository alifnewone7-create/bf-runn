import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowRight, CircleNotch } from '@phosphor-icons/react';
import { AlertCircle } from 'lucide-react';
import BrandLogo from './BrandLogo';
import AuthBackdrop from './AuthBackdrop';
import TwoFACodeInput from './TwoFACodeInput';

const TwoStepVerify = ({ email, onVerify, onResend, onBack, loading, error, onCodeChange }) => {
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(30);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (error) setCode('');
  }, [error]);

  const changeCode = (v) => {
    setCode(v);
    onCodeChange?.();
  };

  const submit = (e) => {
    e.preventDefault();
    if (code.length === 6 && !loading) onVerify(code);
  };

  const resend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    try {
      await onResend();
      setCode('');
      setCooldown(30);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden"
         style={{ background: 'radial-gradient(900px 600px at 15% 0%, rgba(20,184,119,0.16), transparent 60%), radial-gradient(700px 500px at 95% 100%, rgba(20,184,119,0.10), transparent 55%), #040D09' }}
         data-testid="twofa-page">
      <AuthBackdrop />

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-10">
        <Link to="/" className="inline-flex items-center gap-2.5 mb-7" data-testid="twofa-logo-link">
          <BrandLogo className="h-9 w-auto object-contain" />
          <span className="font-display font-bold text-[17px] text-white">Binary Fund <span className="bfg-green-text">Global</span></span>
        </Link>

        <div className="w-full max-w-[430px] rounded-[26px] border border-white/10 backdrop-blur-[10px] shadow-[0_40px_100px_-30px_rgba(0,0,0,0.8)] px-6 py-9 sm:px-10 sm:py-11"
             style={{ background: 'linear-gradient(150deg, rgba(13,30,24,0.9) 0%, rgba(7,21,16,0.92) 55%, rgba(4,13,9,0.94) 100%)' }}>
          <div className="mx-auto mb-5 h-14 w-14 rounded-2xl flex items-center justify-center border border-[#14b877]/25 bg-[#14b877]/10">
            <ShieldCheck size={28} weight="duotone" className="text-[#14b877]" />
          </div>

          <div className="text-center">
            <h1 className="font-display font-bold text-white text-[25px] sm:text-[28px]">Welcome back!</h1>
            <p className="mt-3 text-white/60 text-[14px] leading-relaxed">
              Please enter the 6 digit code we have just sent to<br />
              <span className="text-white/90 font-semibold" data-testid="twofa-email-hint">{email}</span>
            </p>
          </div>

          <form onSubmit={submit} className="mt-7" noValidate>
            <TwoFACodeInput value={code} onChange={changeCode} disabled={loading} hasError={!!error} testPrefix="twofa" />

            {error && (
              <p data-testid="twofa-error" className="mt-3 flex items-start justify-center gap-1.5 text-[12.5px] text-red-400 leading-snug">
                <AlertCircle size={14} className="mt-[1px] flex-shrink-0" />
                <span>{error}</span>
              </p>
            )}

            <div className="text-center mt-4">
              <button type="button" onClick={resend} disabled={cooldown > 0 || resending} data-testid="twofa-resend-button"
                      className="text-[13px] font-semibold bfg-green-text hover:underline disabled:opacity-45 disabled:no-underline disabled:cursor-not-allowed">
                {resending ? 'Sending…' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </button>
            </div>

            <button type="submit" disabled={loading || code.length < 6} data-testid="twofa-submit-button"
                    className="bfg-btn-primary w-full py-3.5 rounded-xl inline-flex items-center justify-center gap-2 mt-5 disabled:opacity-60">
              {loading ? <><CircleNotch size={18} className="animate-spin" /> Verifying…</> : <>Sign in <ArrowRight size={18} /></>}
            </button>
          </form>

          <div className="text-center mt-5">
            <button type="button" onClick={onBack} data-testid="twofa-goback-button"
                    className="text-[13.5px] text-white/55 hover:text-white transition-colors">
              Go back
            </button>
          </div>
        </div>

        <p className="mt-7 text-white/30 text-[12px]">© {new Date().getFullYear()} Binary Fund Global. All rights reserved.</p>
      </div>
    </div>
  );
};

export default TwoStepVerify;
