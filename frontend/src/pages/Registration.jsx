import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import GoogleButton from '../components/GoogleButton';
import CountrySelect from '../components/CountrySelect';
import { useToast } from '../hooks/use-toast';
import api from '../lib/api';
import { isLoggedIn } from '../lib/auth';

const inputCls =
  'w-full bg-white/[0.04] border border-white/12 rounded-xl pl-11 pr-4 py-3 text-[15px] text-white placeholder:text-white/35 focus:outline-none focus:border-[#14b877] focus:ring-2 focus:ring-[#14b877]/25 transition';
const inputErrCls =
  'w-full bg-white/[0.04] border border-red-500/70 rounded-xl pl-11 pr-4 py-3 text-[15px] text-white placeholder:text-white/35 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/25 transition';

const Field = ({ icon: Icon, children }) => (
  <div className="relative">
    <Icon size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
    {children}
  </div>
);

const ErrorLine = ({ children, testId }) => (
  <p data-testid={testId} className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-red-400 leading-snug">
    <AlertCircle size={14} className="mt-[1px] flex-shrink-0" />
    <span>{children}</span>
  </p>
);

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function serverDetailToString(detail) {
  if (!detail) return '';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((e) => (e && typeof e.msg === 'string' ? e.msg : JSON.stringify(e))).join(' ');
  }
  if (detail && typeof detail.msg === 'string') return detail.msg;
  return String(detail);
}

const Registration = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [plan] = useState(params.get('plan') || 'standard');
  const [form, setForm] = useState({ email: '', password: '' });
  const [country, setCountry] = useState('');
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState({ email: '', password: '' });

  // Already signed in? Skip the auth screens entirely and go to the terminal.
  useEffect(() => {
    if (isLoggedIn()) navigate('/demo-trade', { replace: true });
  }, [navigate]);

  const setField = (name, value) => {
    setForm((f) => ({ ...f, [name]: value }));
    // Clear the field-level error the moment the user edits it.
    setErrors((e) => ({ ...e, [name]: '' }));
  };

  const validate = () => {
    const next = { email: '', password: '' };
    if (!form.email || !emailRe.test(form.email)) {
      next.email = 'Please enter a valid email address.';
    }
    if (form.password.length < 6) {
      next.password = 'The Password field must be at least 6 characters in length';
    }
    setErrors(next);
    return !next.email && !next.password;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    if (!country) {
      toast({ title: 'Select your country', description: 'Please choose your country / region of residence.' });
      return;
    }
    if (!agree) {
      toast({ title: 'Please accept the terms', description: 'You must agree to the Terms to continue.' });
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/api/auth/register', {
        email: form.email,
        password: form.password,
        country,
      });
      localStorage.setItem('bfg_token', data.token);
      localStorage.setItem('bfg_user', JSON.stringify(data.user));
      if (plan) localStorage.setItem('bfg_selected_plan', plan);
      toast({ title: 'Account created!', description: `Welcome, ${data.user.email}` });
      navigate('/demo-trade', { replace: true });
    } catch (err) {
      const status = err?.response?.status;
      const msg = serverDetailToString(err?.response?.data?.detail) || err.message;
      if (status === 409 || /email/i.test(msg) && /reuse|already|exists/i.test(msg)) {
        setErrors((prev) => ({
          ...prev,
          email: 'The email address cannot be reused. Please specify a different one.',
        }));
      } else if (status === 400 && /password/i.test(msg)) {
        setErrors((prev) => ({ ...prev, password: msg }));
      } else {
        toast({ title: 'Registration failed', description: msg, variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Create your account">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label className="block text-[13px] text-white/80 mb-2 font-medium">Country / Region of residence</label>
          <CountrySelect value={country} onChange={setCountry} />
        </div>

        <div>
          <label className="block text-[13px] text-white/80 mb-2 font-medium">Email address</label>
          <Field icon={Mail}>
            <input
              data-testid="register-email-input"
              type="email"
              required
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              placeholder="you@example.com"
              className={errors.email ? inputErrCls : inputCls}
              aria-invalid={!!errors.email}
            />
          </Field>
          {errors.email && <ErrorLine testId="register-email-error">{errors.email}</ErrorLine>}
        </div>

        <div>
          <label className="block text-[13px] text-white/80 mb-2 font-medium">Password</label>
          <Field icon={Lock}>
            <input
              data-testid="register-password-input"
              type={show ? 'text' : 'password'}
              required
              value={form.password}
              onChange={(e) => setField('password', e.target.value)}
              placeholder="Please use a password of at least 8 characters"
              className={(errors.password ? inputErrCls : inputCls) + ' pr-11'}
              aria-invalid={!!errors.password}
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </Field>
          {errors.password ? (
            <ErrorLine testId="register-password-error">{errors.password}</ErrorLine>
          ) : (
            <p data-testid="register-password-hint" className="mt-1.5 text-[12.5px] text-white/45 leading-snug">
              Please use a password of at least 8 characters.
            </p>
          )}
        </div>

        <label className="flex items-start gap-2.5 text-[13px] text-white/60 select-none cursor-pointer">
          <input
            data-testid="register-terms-checkbox"
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="h-4 w-4 mt-0.5 rounded border-white/20 bg-transparent accent-[#0e8f5e]"
          />
          <span>
            I agree to the <a href="#" className="bfg-green-text">Terms of Service</a> and{' '}
            <a href="#" className="bfg-green-text">Risk Disclosure</a>.
          </span>
        </label>

        <button
          type="submit"
          disabled={loading}
          data-testid="register-submit-button"
          className="bfg-btn-primary w-full py-3.5 rounded-xl inline-flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" /> Creating account…
            </>
          ) : (
            <>
              Create Account <ArrowRight size={18} />
            </>
          )}
        </button>
      </form>

      <div className="flex items-center gap-3 my-6">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-[13px] text-white/40">or continue with</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>
      <GoogleButton plan={plan} testId="register-google-button" />
    </AuthLayout>
  );
};

export default Registration;
