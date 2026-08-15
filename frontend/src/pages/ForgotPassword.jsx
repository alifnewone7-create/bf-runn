import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Mail, ArrowRight, MailCheck, ArrowLeft, Loader2 } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';

import { API_BASE as API } from '../lib/apiBase';

const inputCls = 'w-full bg-white/[0.04] border border-white/12 rounded-xl pl-11 pr-4 py-3 text-[15px] text-white placeholder:text-white/35 focus:outline-none focus:border-[#14b877] focus:ring-2 focus:ring-[#14b877]/25 transition';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      await axios.post(`${API}/api/auth/forgot-password`, { email });
      setSent(true);
    } catch {
      // Backend always returns success to prevent enumeration; treat network errors gracefully
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout title="Password recovery">
        <div className="flex flex-col items-center text-center" data-testid="forgot-success">
          <div className="h-16 w-16 rounded-2xl bg-[#14b877]/12 border border-[#14b877]/30 flex items-center justify-center shadow-[0_10px_30px_-10px_rgba(20,184,119,0.5)]">
            <MailCheck size={28} className="text-[#14b877]" />
          </div>
          <p className="mt-5 text-[15px] text-white/85 font-medium break-all" data-testid="forgot-success-email">{email}</p>
          <div className="mt-5 w-full rounded-xl border border-[#14b877]/25 bg-[#14b877]/[0.06] px-4 py-4 text-[13.5px] text-white/75 leading-relaxed">
            A secure reset link is on its way to your inbox. Open it within 30 minutes to set a fresh password and jump back into your Binary Fund Global account.
          </div>
          <Link
            to="/login"
            data-testid="forgot-back-to-login"
            className="mt-6 inline-flex items-center gap-2 text-[13.5px] text-white/55 hover:text-white transition"
          >
            <ArrowLeft size={15} /> Back to Login
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Forgot password">
      <p className="text-center text-[13.5px] text-white/60 leading-relaxed -mt-1 mb-6">
        Type the email address linked to your account and we’ll ship a one-tap reset link straight to your inbox.
      </p>
      <form onSubmit={submit} className="space-y-4" data-testid="forgot-form">
        <div>
          <label className="block text-[13px] text-white/80 mb-2 font-medium">Email address</label>
          <div className="relative">
            <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              data-testid="forgot-email-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputCls}
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          data-testid="forgot-submit-button"
          className="bfg-btn-primary w-full py-3.5 rounded-xl inline-flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {loading ? <><Loader2 size={18} className="animate-spin" /> Sending…</> : <>Send reset link <ArrowRight size={18} /></>}
        </button>
        <div className="pt-1 text-center">
          <Link
            to="/login"
            data-testid="forgot-back-link"
            className="inline-flex items-center gap-2 text-[13.5px] text-white/55 hover:text-white transition"
          >
            <ArrowLeft size={15} /> Back to Login
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
};

export default ForgotPassword;
