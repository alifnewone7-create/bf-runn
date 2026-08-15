import React, { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { LockKey, Eye, EyeSlash, ArrowLeft, ArrowRight, CheckCircle, CircleNotch, WarningCircle, ClockCountdown } from '@phosphor-icons/react';
import BrandLogo from '../components/BrandLogo';

import { API_BASE as API } from '../lib/apiBase';

const inputCls = 'w-full bg-white/[0.04] border border-white/12 rounded-xl pl-11 pr-11 py-3 text-[15px] text-white placeholder:text-white/35 focus:outline-none focus:border-[#14b877] focus:ring-2 focus:ring-[#14b877]/25 transition';


const Shell = ({ title, children }) => (
  <div className="min-h-screen flex flex-col"
       style={{ background: 'radial-gradient(900px 600px at 15% 0%, rgba(20,184,119,0.16), transparent 60%), radial-gradient(700px 500px at 95% 100%, rgba(20,184,119,0.10), transparent 55%), #040D09' }}>
    <div className="px-4 pt-5 sm:px-8 sm:pt-7">
      <Link to="/" className="inline-flex items-center gap-2" data-testid="reset-logo-link">
        <BrandLogo className="h-8 w-auto object-contain" />
        <span className="font-display font-bold text-[15px] text-white leading-none">Binary Fund <span className="bfg-green-text">Global</span></span>
      </Link>
    </div>

    <div className="flex-1 flex items-start sm:items-center justify-center px-4 py-8 sm:py-10">
      <div className="w-full max-w-[440px] rounded-[24px] border border-white/10 px-5 py-8 sm:px-9 sm:py-10 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.8)]"
           style={{ background: 'linear-gradient(150deg, #0D1E18 0%, #071510 55%, #040D09 100%)' }}>
        <div className="text-center">
          <h1 className="font-display font-bold text-white text-[25px] sm:text-[28px] leading-tight">{title}</h1>
          <div className="mx-auto mt-3 h-[3px] w-16 rounded-full bg-gradient-to-r from-transparent via-[#14B877] to-transparent" aria-hidden="true" />
        </div>
        <div className="mt-7">{children}</div>
      </div>
    </div>
  </div>
);

const PasswordField = ({ label, value, onChange, show, setShow, testid, placeholder }) => (
  <div>
    <label className="block text-[13px] text-white/80 mb-2 font-medium">{label}</label>
    <div className="relative">
      <LockKey size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
      <input
        data-testid={testid}
        type={show ? 'text' : 'password'}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="new-password"
        className={inputCls}
      />
      <button type="button" onClick={() => setShow(!show)} data-testid={`${testid}-toggle`}
              aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors">
        {show ? <EyeSlash size={18} /> : <Eye size={18} />}
      </button>
    </div>
  </div>
);

const ResetPassword = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';

  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [linkState, setLinkState] = useState('checking');

  useEffect(() => {
    if (!token) { setLinkState('invalid'); return; }
    axios.get(`${API}/api/auth/reset-password/status`, { params: { token } })
      .then(({ data }) => setLinkState(data.status || 'valid'))
      .catch(() => setLinkState('valid'));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (pw.length < 8) { setErr('Password must be at least 8 characters long.'); return; }
    if (pw !== pw2) { setErr('Both passwords must match.'); return; }
    if (!token) { setErr('This reset link is invalid. Please request a new one.'); return; }

    setLoading(true);
    try {
      await axios.post(`${API}/api/auth/reset-password`, { token, new_password: pw });
      setDone(true);
    } catch (ex) {
      setErr(ex?.response?.data?.detail || 'This reset link is invalid or has expired.');
      try {
        const { data } = await axios.get(`${API}/api/auth/reset-password/status`, { params: { token } });
        if (data.status && data.status !== 'valid') setLinkState(data.status);
      } catch { /* status endpoint unavailable, keep the inline error */ }
    } finally {
      setLoading(false);
    }
  };

  if (linkState === 'checking') {
    return (
      <Shell title="Reset your password">
        <div className="flex flex-col items-center py-4" data-testid="reset-checking">
          <CircleNotch size={30} className="animate-spin text-[#14b877]" />
          <p className="mt-4 text-[13.5px] text-white/55">Checking your reset link…</p>
        </div>
      </Shell>
    );
  }

  if (linkState === 'used' || linkState === 'expired' || linkState === 'invalid') {
    const copy = {
      used: {
        title: 'Link already used',
        icon: <CheckCircle size={30} weight="duotone" className="text-[#14b877]" />,
        text: 'You have already used this link to change your password. Please sign in with your new password, or request a new reset link if you need to change it again.',
      },
      expired: {
        title: 'Link expired',
        icon: <ClockCountdown size={30} weight="duotone" className="text-amber-300" />,
        text: 'Your reset link has expired. Reset links stay valid for 30 minutes only, so please request a new one from the forgot password page.',
      },
      invalid: {
        title: 'Link not valid',
        icon: <WarningCircle size={30} weight="duotone" className="text-red-300" />,
        text: 'This reset link is not valid. It may have been broken by your email app. Please request a new one from the forgot password page.',
      },
    }[linkState];

    return (
      <Shell title={copy.title}>
        <div className="flex flex-col items-center text-center" data-testid={`reset-link-${linkState}`}>
          <div className="h-16 w-16 rounded-2xl bg-white/[0.05] border border-white/12 flex items-center justify-center">{copy.icon}</div>
          <div className="mt-5 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4 text-[13.5px] text-white/75 leading-relaxed">
            {copy.text}
          </div>
          <button onClick={() => navigate('/login')} data-testid="reset-go-signin"
                  className="bfg-btn-primary w-full mt-5 py-3.5 rounded-xl inline-flex items-center justify-center gap-2">
            Back to Sign In <ArrowRight size={18} />
          </button>
          {linkState !== 'used' && (
            <Link to="/forgot-password" data-testid="reset-request-new"
                  className="mt-4 inline-flex items-center gap-2 text-[13.5px] text-white/55 hover:text-white transition">
              Request a new link
            </Link>
          )}
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell title="Password reset successfully">
        <div className="flex flex-col items-center text-center" data-testid="reset-success">
          <div className="h-16 w-16 rounded-2xl bg-[#14b877]/12 border border-[#14b877]/30 flex items-center justify-center shadow-[0_10px_30px_-10px_rgba(20,184,119,0.5)]">
            <CheckCircle size={30} weight="duotone" className="text-[#14b877]" />
          </div>
          <div className="mt-5 w-full rounded-xl border border-[#14b877]/25 bg-[#14b877]/[0.06] px-4 py-4 text-[13.5px] text-white/75 leading-relaxed">
            Your password has been updated. You can now sign in with your new password and get straight back to trading.
          </div>
          <button
            onClick={() => navigate('/login')}
            data-testid="reset-go-signin"
            className="bfg-btn-primary w-full mt-5 py-3.5 rounded-xl inline-flex items-center justify-center gap-2"
          >
            Go to Sign In <ArrowRight size={18} />
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Reset your password">
      <p className="text-center text-[13.5px] text-white/60 leading-relaxed -mt-1 mb-6">
        Choose a new password for your account. Make it at least 8 characters long and keep it private.
      </p>

      <form onSubmit={submit} className="space-y-4" data-testid="reset-password-form">
        {err && (
          <div data-testid="reset-error"
               className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">
            {err}
          </div>
        )}

        <PasswordField label="New password" value={pw} onChange={setPw} show={showPw} setShow={setShowPw}
                       testid="new-password-input" placeholder="Enter your new password" />
        <PasswordField label="Confirm new password" value={pw2} onChange={setPw2} show={showPw2} setShow={setShowPw2}
                       testid="confirm-password-input" placeholder="Confirm your new password" />

        <button
          type="submit"
          disabled={loading}
          data-testid="reset-submit"
          className="bfg-btn-primary w-full py-3.5 rounded-xl inline-flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {loading ? <><CircleNotch size={18} className="animate-spin" /> Updating…</> : <>Reset Password <ArrowRight size={18} /></>}
        </button>

        <div className="pt-1 text-center">
          <Link to="/login" data-testid="reset-back-signin"
                className="inline-flex items-center gap-2 text-[13.5px] text-white/55 hover:text-white transition">
            <ArrowLeft size={15} /> Back to Sign In
          </Link>
        </div>
      </form>
    </Shell>
  );
};

export default ResetPassword;
