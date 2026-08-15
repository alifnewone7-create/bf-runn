import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import GoogleButton from '../components/GoogleButton';
import TwoStepVerify from '../components/TwoStepVerify';
import { useToast } from '../hooks/use-toast';
import api from '../lib/api';
import { isLoggedIn } from '../lib/auth';

const inputCls = 'w-full bg-white/[0.04] border border-white/12 rounded-xl pl-11 pr-4 py-3 text-[15px] text-white placeholder:text-white/35 focus:outline-none focus:border-[#14b877] focus:ring-2 focus:ring-[#14b877]/25 transition';
const inputErrCls = 'w-full bg-white/[0.04] border border-red-500/70 rounded-xl pl-11 pr-4 py-3 text-[15px] text-white placeholder:text-white/35 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/25 transition';

const Field = ({ icon: Icon, children }) => (
  <div className="relative">
    <Icon size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
    {children}
  </div>
);

function formatError(detail) {
  if (!detail) return 'Something went wrong. Please try again.';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((e) => (e && typeof e.msg === 'string' ? e.msg : JSON.stringify(e))).join(' ');
  if (detail && typeof detail.msg === 'string') return detail.msg;
  return String(detail);
}

const Login = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({ email: '', password: '' });
  const [pending, setPending] = useState(null); // { token, email } — two-step verification stage
  const [twofaLoading, setTwofaLoading] = useState(false);
  const [twofaError, setTwofaError] = useState('');

  // Already signed in? Skip the auth screens entirely and go to the terminal.
  useEffect(() => {
    if (isLoggedIn()) navigate('/demo-trade', { replace: true });
  }, [navigate]);

  const setField = (name, value) => {
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((e) => ({ ...e, [name]: '', form: '' }));
  };

  const finishLogin = (data) => {
    localStorage.setItem('bfg_token', data.token);
    localStorage.setItem('bfg_user', JSON.stringify(data.user));
    toast({ title: 'Welcome back!', description: `Signed in as ${data.user.email}` });
    navigate('/demo-trade', { replace: true });
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/api/auth/login', form);
      if (data.requires_2fa) {
        setTwofaError('');
        setPending({ token: data.pending_token, email: data.email });
        return;
      }
      finishLogin(data);
    } catch (err) {
      const status = err?.response?.status;
      const msg = formatError(err?.response?.data?.detail) || err.message;
      if (status === 401) {
        setErrors({ email: '', password: '', form: 'Invalid email or password.' });
      } else {
        toast({ title: 'Login failed', description: msg, variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (code) => {
    setTwofaLoading(true);
    setTwofaError('');
    try {
      const { data } = await api.post('/api/auth/2fa/verify', { pending_token: pending.token, code });
      finishLogin(data);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401) {
        setPending(null);
        toast({ title: 'Session expired', description: 'Please log in again to get a new code.', variant: 'destructive' });
      } else {
        setTwofaError(formatError(err?.response?.data?.detail) || 'Invalid authentication code.');
      }
    } finally {
      setTwofaLoading(false);
    }
  };

  const resendCode = async () => {
    try {
      await api.post('/api/auth/2fa/resend', { pending_token: pending.token });
      toast({ title: 'Code sent', description: 'A new code has been sent to your email.' });
    } catch (err) {
      toast({ title: 'Could not resend', description: formatError(err?.response?.data?.detail) || 'Please try again.', variant: 'destructive' });
    }
  };

  if (pending) {
    return (
      <TwoStepVerify
        email={pending.email}
        onVerify={verifyCode}
        onResend={resendCode}
        onBack={() => { setPending(null); setTwofaError(''); }}
        loading={twofaLoading}
        error={twofaError}
        onCodeChange={() => setTwofaError('')}
      />
    );
  }

  return (
    <AuthLayout title="Welcome back">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label className="block text-[13px] text-white/80 mb-2 font-medium">Email address</label>
          <Field icon={Mail}><input data-testid="login-email-input" type="email" required value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="you@example.com" className={errors.form ? inputErrCls : inputCls} /></Field>
        </div>
        <div>
          <label className="block text-[13px] text-white/80 mb-2 font-medium">Password</label>
          <Field icon={Lock}>
            <input data-testid="login-password-input" type={show ? 'text' : 'password'} required value={form.password} onChange={(e) => setField('password', e.target.value)} placeholder="Your password" className={(errors.form ? inputErrCls : inputCls) + ' pr-11'} />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </Field>
          {errors.form && (
            <p data-testid="login-form-error" className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-red-400 leading-snug">
              <AlertCircle size={14} className="mt-[1px] flex-shrink-0" />
              <span>{errors.form}</span>
            </p>
          )}
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-[14px] text-white/60 select-none cursor-pointer">
            <input type="checkbox" className="h-4 w-4 rounded border-white/20 bg-transparent accent-[#0e8f5e]" /> Remember Me
          </label>
          <Link to="/forgot-password" data-testid="login-forgot-link" className="text-[13px] bfg-green-text hover:underline">Forgot password?</Link>
        </div>
        <button type="submit" disabled={loading} data-testid="login-submit-button" className="bfg-btn-primary w-full py-3.5 rounded-xl inline-flex items-center justify-center gap-2 disabled:opacity-60">
          {loading ? <><Loader2 size={18} className="animate-spin" /> Signing in…</> : <>Log In <ArrowRight size={18} /></>}
        </button>
      </form>
      <div className="flex items-center gap-3 my-6"><div className="h-px flex-1 bg-white/10" /><span className="text-[13px] text-white/40">or continue with</span><div className="h-px flex-1 bg-white/10" /></div>
      <GoogleButton testId="login-google-button" />
    </AuthLayout>
  );
};

export default Login;
