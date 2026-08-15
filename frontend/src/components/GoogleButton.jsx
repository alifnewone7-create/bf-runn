import React from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useAppConfig } from '../context/ConfigContext';

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH

const GoogleIcon = () => (
  <svg width="19" height="19" viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
  </svg>
);

const buttonClass =
  "w-full py-3.5 rounded-xl inline-flex items-center justify-center gap-3 bg-white text-[#0b1512] font-semibold text-[15px] transition-all duration-200 hover:bg-white/90 hover:-translate-y-[1px] shadow-[0_10px_28px_-12px_rgba(255,255,255,0.35)]";

const GoogleButtonActive = ({ plan, testId }) => {
  const login = useGoogleLogin({
    flow: 'auth-code',
    ux_mode: 'redirect',
    redirect_uri: window.location.origin + '/auth/google',
  });

  const handleClick = () => {
    if (plan) localStorage.setItem('bfg_selected_plan', plan);
    else localStorage.removeItem('bfg_selected_plan');
    login();
  };

  return (
    <button type="button" data-testid={testId} onClick={handleClick} className={buttonClass}>
      <GoogleIcon /> Google
    </button>
  );
};

const GoogleButtonDisabled = ({ testId }) => (
  <button
    type="button"
    data-testid={testId}
    disabled
    title="Google login is not configured"
    className={buttonClass + " opacity-50 cursor-not-allowed"}
  >
    <GoogleIcon /> Google
  </button>
);

export const GoogleButton = ({ plan, testId = 'google-login-button' }) => {
  const { googleClientId } = useAppConfig();
  if (!googleClientId) return <GoogleButtonDisabled testId={testId} />;
  return <GoogleButtonActive plan={plan} testId={testId} />;
};

export default GoogleButton;
