import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle2, XCircle, Loader2, ArrowRight } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { API_BASE as API } from '../lib/apiBase';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const [state, setState] = useState('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = params.get('token');
    const status = params.get('status');

    if (status === 'success') { setState('success'); setMessage('Your email address has been verified.'); return; }
    if (status === 'error') { setState('error'); setMessage('This verification link is invalid or has expired.'); return; }
    if (!token) { setState('error'); setMessage('Verification token is missing from the link.'); return; }

    axios.post(`${API}/api/auth/verify-email`, { token })
      .then(({ data }) => { setState('success'); setMessage(data.message || 'Your email address has been verified.'); })
      .catch((e) => { setState('error'); setMessage(e?.response?.data?.detail || 'This verification link is invalid or has expired.'); });
  }, [params]);

  return (
    <div className="min-h-screen bg-[#04120c] flex items-center justify-center px-5"
         style={{ backgroundImage: 'radial-gradient(900px 500px at 20% -10%, rgba(20,184,119,0.16), transparent 60%)' }}>
      <div data-testid="verify-email-card"
           className="w-full max-w-[460px] rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-9 text-center">
        <div className="flex justify-center mb-7"><BrandLogo className="h-8" /></div>

        {state === 'loading' && (
          <div data-testid="verify-loading">
            <Loader2 size={38} className="mx-auto text-[#14b877] animate-spin" />
            <p className="mt-5 text-[15px] text-white/60">Verifying your email…</p>
          </div>
        )}

        {state === 'success' && (
          <div data-testid="verify-success">
            <CheckCircle2 size={54} className="mx-auto text-[#14b877]" />
            <h1 className="mt-5 text-[24px] font-extrabold text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>Email verified</h1>
            <p className="mt-2 text-[14.5px] text-white/55">{message}</p>
            <Link to="/dashboard" data-testid="verify-go-dashboard"
                  className="mt-7 inline-flex items-center justify-center gap-2 h-12 w-full rounded-xl bg-[#14b877] text-[#03150d] font-extrabold text-[15px] hover:bg-[#17cf86] transition-colors">
              Go to dashboard <ArrowRight size={17} />
            </Link>
          </div>
        )}

        {state === 'error' && (
          <div data-testid="verify-error">
            <XCircle size={54} className="mx-auto text-[#f43f5e]" />
            <h1 className="mt-5 text-[24px] font-extrabold text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>Verification failed</h1>
            <p className="mt-2 text-[14.5px] text-white/55">{message}</p>
            <p className="mt-3 text-[13px] text-white/40">Open your profile and use “Resend verification email” to get a fresh link.</p>
            <Link to="/profile" data-testid="verify-go-profile"
                  className="mt-7 inline-flex items-center justify-center gap-2 h-12 w-full rounded-xl border border-white/14 bg-white/[0.04] text-white font-bold text-[15px] hover:bg-white/[0.1] transition-colors">
              Go to profile
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
