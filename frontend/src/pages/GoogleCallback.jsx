import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { CircleNotch, WarningCircle, Copy, Check } from '@phosphor-icons/react';
import api from '../lib/api';

export default function GoogleCallback() {
  const navigate = useNavigate();
  const ran = useRef(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const redirectUri = window.location.origin + '/auth/google';
  const jsOrigin = window.location.origin;

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const googleError = params.get('error');
    if (googleError) {
      setError(googleError === 'redirect_uri_mismatch' ? 'redirect_uri_mismatch' : googleError);
      return;
    }
    if (!code) { setError('No authorization code received from Google.'); return; }
    const plan = localStorage.getItem('bfg_selected_plan') || null;
    api.post(`/api/auth/google`, {
      code,
      redirect_uri: redirectUri,
      plan,
    }).then(({ data }) => {
      localStorage.setItem('bfg_token', data.token);
      localStorage.setItem('bfg_user', JSON.stringify(data.user));
      localStorage.removeItem('bfg_selected_plan');
      navigate('/demo-trade', { replace: true });
    }).catch((err) => {
      const detail = err?.response?.data?.detail || '';
      if (typeof detail === 'string' && detail.toLowerCase().includes('redirect_uri_mismatch')) {
        setError('redirect_uri_mismatch');
      } else {
        setError('Google sign-in failed. Please try again.');
      }
    });
  }, [navigate, redirectUri]);

  const copy = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  const isMismatch = error === 'redirect_uri_mismatch';

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10" style={{ background: 'radial-gradient(800px 500px at 50% 0%, rgba(20,184,119,0.14), transparent 60%), #040D09' }}>
      <div className="w-full max-w-xl text-center" data-testid="google-callback-status">
        {!error && (
          <>
            <CircleNotch size={44} className="mx-auto text-[#14b877] animate-spin" />
            <p className="mt-4 text-white/80 text-[15px]">Signing you in with Google…</p>
          </>
        )}

        {error && !isMismatch && (
          <>
            <WarningCircle size={44} weight="duotone" className="mx-auto text-red-400" />
            <p className="mt-4 text-white font-semibold text-lg">{error}</p>
            <Link to="/login" className="inline-block mt-6 bfg-btn-primary px-8 py-3 rounded-xl" data-testid="callback-back-to-login">Back to Login</Link>
          </>
        )}

        {isMismatch && (
          <div className="text-left" data-testid="callback-redirect-mismatch">
            <div className="flex items-center gap-3 justify-center text-center">
              <WarningCircle size={40} weight="duotone" className="text-amber-400" />
              <div>
                <h2 className="text-white font-display font-bold text-[22px] leading-tight">redirect_uri_mismatch</h2>
                <p className="text-white/60 text-[13.5px]">Google Cloud Console e ei URL 2 ta add korte hobe.</p>
              </div>
            </div>

            <div className="mt-7 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[11px] uppercase tracking-widest text-white/45 font-semibold">Authorized redirect URI</div>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 text-[13px] text-white bg-black/40 rounded-lg px-3 py-2.5 border border-white/10 break-all" data-testid="callback-redirect-uri">{redirectUri}</code>
                  <button onClick={() => copy(redirectUri)} data-testid="copy-redirect-uri"
                          className="h-10 w-10 flex items-center justify-center rounded-lg bg-[#14b877]/15 border border-[#14b877]/30 text-[#14b877] hover:bg-[#14b877]/25 transition-colors">
                    {copied ? <Check size={16} weight="bold" /> : <Copy size={16} weight="bold" />}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[11px] uppercase tracking-widest text-white/45 font-semibold">Authorized JavaScript origin</div>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 text-[13px] text-white bg-black/40 rounded-lg px-3 py-2.5 border border-white/10 break-all" data-testid="callback-js-origin">{jsOrigin}</code>
                  <button onClick={() => copy(jsOrigin)} data-testid="copy-js-origin"
                          className="h-10 w-10 flex items-center justify-center rounded-lg bg-[#14b877]/15 border border-[#14b877]/30 text-[#14b877] hover:bg-[#14b877]/25 transition-colors">
                    <Copy size={16} weight="bold" />
                  </button>
                </div>
              </div>
            </div>

            <ol className="mt-6 text-[13.5px] text-white/70 space-y-1.5 list-decimal list-inside">
              <li>Google Cloud Console → APIs & Services → Credentials khulun</li>
              <li>Apnar OAuth 2.0 Client ID te click korun</li>
              <li>Upor er 2 ta URL respective section e add koren, Save chapun</li>
              <li>2-3 minute wait koren, tarpor abar try koren</li>
            </ol>

            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer"
                 className="bfg-btn-primary px-6 py-3 rounded-xl inline-flex items-center justify-center gap-2" data-testid="open-google-console">
                Open Google Console
              </a>
              <Link to="/login" className="bfg-btn-outline px-6 py-3 rounded-xl inline-flex items-center justify-center" data-testid="callback-back-to-login">
                Back to Login
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
