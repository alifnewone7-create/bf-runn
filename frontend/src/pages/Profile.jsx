import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, User as UserIcon, FloppyDisk, CircleNotch, Pencil, SealCheck, Warning } from '@phosphor-icons/react';
import { useToast } from '../hooks/use-toast';
import CountrySelect from '../components/CountrySelect';
import BrandLogo from '../components/BrandLogo';
import TwoFASection from '../components/TwoFASection';

import { API_BASE as API } from '../lib/apiBase';

const Field = ({ label, testId, children }) => (
  <label className="block">
    <span className="block text-[11px] uppercase tracking-wider text-white/45 font-semibold mb-1.5">{label}</span>
    <div data-testid={testId}>{children}</div>
  </label>
);

const inputCls =
  'w-full bg-white/[0.04] border border-white/12 rounded-xl px-4 py-3 text-[15px] text-white placeholder:text-white/35 focus:outline-none focus:border-[#14b877] focus:ring-2 focus:ring-[#14b877]/25 transition';

export default function Profile() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingNick, setEditingNick] = useState(false);
  const [resending, setResending] = useState(false);
  const [form, setForm] = useState({
    nickname: '',
    first_name: '',
    last_name: '',
    dob: '',
    country: '',
    address: '',
  });

  const token = localStorage.getItem('bfg_token');
  const authH = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => {
    if (!token) { navigate('/login', { replace: true }); return; }
    axios.get(`${API}/api/auth/me`, authH).then(({ data }) => {
      setUser(data);
      setForm({
        nickname: data.nickname || '',
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        dob: data.dob || '',
        country: data.country || '',
        address: data.address || '',
      });
    }).catch(() => {
      localStorage.removeItem('bfg_token');
      navigate('/login', { replace: true });
    }).finally(() => setLoading(false));
    // eslint-disable-next-line
  }, []);

  const resendVerification = async () => {
    setResending(true);
    try {
      const { data } = await axios.post(`${API}/api/auth/resend-verification`, {}, authH);
      toast({ title: 'Email sent', description: data.message });
    } catch (e) {
      toast({ title: 'Could not send', description: e?.response?.data?.detail || 'Please try again later.', variant: 'destructive' });
    } finally { setResending(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await axios.patch(`${API}/api/auth/profile`, form, authH);
      setUser(data);
      setEditingNick(false);
      toast({ title: 'Profile saved' });
    } catch (err) {
      toast({ title: err?.response?.data?.detail || 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#040D09]">
        <CircleNotch size={40} className="text-[#14b877] animate-spin" />
      </div>
    );
  }

  const initial = (user.nickname || user.full_name || user.email || 'B')[user.nickname ? 1 : 0]?.toUpperCase() || 'B';

  return (
    <div className="min-h-screen text-white bg-[#040D09]"
         style={{ background: 'radial-gradient(1200px 700px at 50% -10%, rgba(20,184,119,0.10), transparent 60%), linear-gradient(180deg, #04100b 0%, #030d09 100%)' }}
         data-testid="profile-page">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 sm:px-8 h-14 border-b border-white/10 bg-[#06120d]/60 backdrop-blur">
        <Link to="/" data-testid="profile-logo"><BrandLogo className="h-7 w-auto" /></Link>
        <div className="flex-1" />
        <button onClick={() => navigate('/demo-trade')} data-testid="profile-back-trade"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 border border-white/10 hover:bg-white/[0.06] transition-colors text-[12px] font-semibold">
          <ArrowLeft size={14} weight="bold" /> Back to trading
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Identity card */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 mb-5">
          <div className="flex items-center gap-4">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" referrerPolicy="no-referrer"
                   className="h-16 w-16 rounded-full object-cover border border-white/10" />
            ) : (
              <div className="h-16 w-16 rounded-full bg-[#14b877] text-black flex items-center justify-center text-[22px] font-extrabold">
                {initial}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {editingNick ? (
                  <input
                    value={form.nickname}
                    onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
                    data-testid="nickname-input"
                    autoFocus
                    className="bg-transparent border-b border-[#14b877] text-[20px] font-bold outline-none text-white w-[220px]"
                  />
                ) : (
                  <span className="text-[20px] font-bold text-white truncate" data-testid="nickname-display">
                    {form.nickname || 'Set a nickname'}
                  </span>
                )}
                <button
                  onClick={() => setEditingNick((v) => !v)}
                  data-testid="edit-nickname-toggle"
                  className="h-7 w-7 flex items-center justify-center rounded-md text-white/60 hover:text-white hover:bg-white/[0.06]"
                >
                  <Pencil size={13} weight="bold" />
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                <span className="text-[12px] text-white/50 truncate" data-testid="profile-email">{user.email}</span>
                {user.is_verified ? (
                  <span data-testid="email-verified-badge"
                        className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full bg-[#14b877]/15 text-[#14b877] text-[10px] font-bold uppercase tracking-wider">
                    <SealCheck size={11} weight="fill" /> Verified
                  </span>
                ) : (
                  <>
                    <span data-testid="email-unverified-badge"
                          className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full bg-amber-400/15 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                      <Warning size={11} weight="fill" /> Not verified
                    </span>
                    <button data-testid="resend-verification-btn" onClick={resendVerification} disabled={resending}
                            className="text-[11px] font-semibold text-[#14b877] hover:text-[#17cf86] underline underline-offset-2 disabled:opacity-50 transition-colors">
                      {resending ? 'Sending…' : 'Resend verification email'}
                    </button>
                  </>
                )}
              </div>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-white/15 bg-white/[0.04] text-[10px] font-bold uppercase tracking-wider text-white/70">
              <UserIcon size={11} weight="bold" /> {(user.role || 'trader').toUpperCase()}
            </span>
          </div>
        </section>

        {/* Details form */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <h2 className="text-[16px] font-bold mb-4">Personal details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="First name" testId="field-first-name">
              <input value={form.first_name}
                     onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                     placeholder="Alif"
                     data-testid="first-name-input"
                     className={inputCls} />
            </Field>
            <Field label="Last name" testId="field-last-name">
              <input value={form.last_name}
                     onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                     placeholder="Rahman"
                     data-testid="last-name-input"
                     className={inputCls} />
            </Field>
            <Field label="Date of birth" testId="field-dob">
              <input type="date" value={form.dob}
                     onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))}
                     data-testid="dob-input"
                     className={`${inputCls} [color-scheme:dark]`} />
            </Field>
            <Field label="Country" testId="field-country">
              <CountrySelect value={form.country} onChange={(c) => setForm((f) => ({ ...f, country: c }))} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Address" testId="field-address">
                <textarea rows={3} value={form.address}
                          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                          placeholder="Street, City, Postcode…"
                          data-testid="address-input"
                          className={`${inputCls} resize-none`} />
              </Field>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              data-testid="profile-save-button"
              className="inline-flex items-center gap-2 rounded-xl bg-[#14b877] text-black font-bold px-5 py-2.5 text-[14px] hover:bg-[#17cf86] disabled:opacity-50"
            >
              {saving ? <CircleNotch size={16} className="animate-spin" /> : <FloppyDisk size={16} weight="bold" />}
              Save changes
            </button>
            <button
              onClick={() => navigate('/demo-trade')}
              data-testid="profile-cancel-button"
              className="rounded-xl border border-white/10 px-5 py-2.5 text-[14px] font-semibold text-white/70 hover:bg-white/[0.05]"
            >
              Cancel
            </button>
          </div>
        </section>

        {/* Security */}
        <TwoFASection user={user} onUpdate={setUser} />
      </main>
    </div>
  );
}
