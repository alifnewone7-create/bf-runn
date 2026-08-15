import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ShieldCheck, Lock, Mail, Loader2, LogOut, Search, Users, TrendingUp,
  Wallet as WalletIcon, Activity, RefreshCw, X, ChevronLeft, ChevronRight,
  BarChart3, Check, AlertCircle,
} from 'lucide-react';
import adminApi from '../lib/adminApi';

const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = (s) => (s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const errText = (e) => {
  if (e?.code === 'ERR_NETWORK' || !e?.response) return 'Cannot reach the server. Check your connection and try again.';
  const d = e?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(' ');
  return e?.message || 'Request failed';
};

/* ---------------- Login ---------------- */
function AdminLogin({ onDone }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const { data } = await adminApi.post('/api/admin/login', {
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      localStorage.setItem('bfg_admin_token', data.token);
      onDone(data);
    } catch (ex) {
      setErr(errText(ex));
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-[#04120c] flex items-center justify-center px-5"
         style={{ backgroundImage: 'radial-gradient(900px 500px at 15% -10%, rgba(20,184,119,0.16), transparent 60%)' }}>
      <form onSubmit={submit} data-testid="admin-login-form"
            className="w-full max-w-[420px] rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-8 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
        <div className="flex items-center gap-2.5 mb-1">
          <span className="grid place-items-center h-9 w-9 rounded-xl bg-[#14b877]/15 text-[#14b877]"><ShieldCheck size={18} /></span>
          <span className="text-[13px] tracking-[0.22em] uppercase text-[#14b877] font-bold">Control Center</span>
        </div>
        <h1 className="text-[26px] font-extrabold text-white mb-1.5" style={{ fontFamily: 'Manrope, sans-serif' }}>Admin access</h1>
        <p className="text-[13.5px] text-white/45 mb-7">Restricted area — authorised personnel only.</p>

        {err && (
          <div data-testid="admin-login-error" className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-300">{err}</div>
        )}

        <label className="block text-[12px] font-semibold text-white/60 mb-1.5">Admin email</label>
        <div className="relative mb-4">
          <Mail size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
          <input data-testid="admin-email-input" type="email" required value={form.email}
                 onChange={(e) => setForm({ ...form, email: e.target.value })}
                 placeholder="admin@binaryfundglobal.com"
                 className="w-full bg-white/[0.04] border border-white/12 rounded-xl pl-11 pr-4 py-3 text-[14.5px] text-white placeholder:text-white/30 focus:outline-none focus:border-[#14b877] focus:ring-2 focus:ring-[#14b877]/25 transition-colors" />
        </div>

        <label className="block text-[12px] font-semibold text-white/60 mb-1.5">Password</label>
        <div className="relative mb-6">
          <Lock size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
          <input data-testid="admin-password-input" type="password" required value={form.password}
                 onChange={(e) => setForm({ ...form, password: e.target.value })}
                 placeholder="••••••••"
                 className="w-full bg-white/[0.04] border border-white/12 rounded-xl pl-11 pr-4 py-3 text-[14.5px] text-white placeholder:text-white/30 focus:outline-none focus:border-[#14b877] focus:ring-2 focus:ring-[#14b877]/25 transition-colors" />
        </div>

        <button data-testid="admin-login-submit" type="submit" disabled={busy}
                className="w-full h-12 rounded-xl bg-[#14b877] text-[#03150d] font-extrabold text-[15px] grid place-items-center hover:bg-[#17cf86] active:scale-[0.99] transition-[background-color,transform] disabled:opacity-60">
          {busy ? <Loader2 size={19} className="animate-spin" /> : 'Enter Control Center'}
        </button>
      </form>
    </div>
  );
}

/* ---------------- Markets (payout admin) ---------------- */
function MarketsPanel() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [cat, setCat] = useState('all');
  const [drafts, setDrafts] = useState({}); // symbol → in-progress payout string
  const [saving, setSaving] = useState({}); // symbol → boolean
  const [flash, setFlash] = useState({});   // symbol → 'ok' | 'err'

  const load = useCallback(async () => {
    setBusy(true); setErr('');
    try {
      const { data } = await adminApi.get('/api/admin/markets');
      setItems(data.items || []);
    } catch (e) { setErr(errText(e)); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const cats = useMemo(() => {
    const s = new Set(items.map((i) => i.category));
    return ['all', ...Array.from(s)];
  }, [items]);

  const filtered = cat === 'all' ? items : items.filter((i) => i.category === cat);

  const save = async (sym) => {
    const raw = drafts[sym];
    const pct = Number(raw);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setFlash((f) => ({ ...f, [sym]: 'err' }));
      setTimeout(() => setFlash((f) => { const { [sym]: _, ...rest } = f; return rest; }), 1600);
      return;
    }
    setSaving((s) => ({ ...s, [sym]: true }));
    try {
      const { data } = await adminApi.patch(`/api/admin/markets/${sym}`, { payout: pct });
      setItems((list) => list.map((it) => (it.symbol === sym ? { ...it, payout: data.payout } : it)));
      setDrafts((d) => { const { [sym]: _, ...rest } = d; return rest; });
      setFlash((f) => ({ ...f, [sym]: 'ok' }));
      setTimeout(() => setFlash((f) => { const { [sym]: _, ...rest } = f; return rest; }), 1600);
    } catch (e) {
      setErr(errText(e));
      setFlash((f) => ({ ...f, [sym]: 'err' }));
      setTimeout(() => setFlash((f) => { const { [sym]: _, ...rest } = f; return rest; }), 1600);
    } finally {
      setSaving((s) => { const { [sym]: _, ...rest } = s; return rest; });
    }
  };

  return (
    <div data-testid="admin-markets-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[19px] font-extrabold" style={{ fontFamily: 'Manrope, sans-serif' }}>OTC Markets — Payouts</h2>
          <p className="text-[12.5px] text-white/40 mt-0.5">Set the payout % per instrument. Changes go live instantly across every connected trader.</p>
        </div>
        <button data-testid="admin-markets-refresh" onClick={load}
                className="h-9 px-3.5 rounded-xl border border-white/12 bg-white/[0.04] text-[12.5px] font-semibold text-white/80 hover:bg-white/[0.1] transition-colors inline-flex items-center gap-2">
          <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {err && (
        <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-[13.5px] text-red-300 inline-flex items-center gap-2">
          <AlertCircle size={15} /> {err}
        </div>
      )}

      <div className="mb-4 flex gap-1.5 flex-wrap">
        {cats.map((c) => (
          <button key={c} data-testid={`admin-markets-cat-${c}`} onClick={() => setCat(c)}
                  className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold capitalize transition-colors ${cat === c ? 'bg-[#14b877] text-[#03150d]' : 'bg-white/[0.05] text-white/60 hover:bg-white/[0.1]'}`}>
            {c}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
        <table className="w-full min-w-[720px] text-[13px]" data-testid="admin-markets-table">
          <thead className="bg-white/[0.04] text-white/45">
            <tr>
              {['Symbol', 'Name', 'Category', 'Current payout', 'New payout %', 'Save'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {busy && items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-white/40"><Loader2 size={18} className="animate-spin inline mr-2" />Loading markets…</td></tr>
            )}
            {!busy && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-white/40">No instruments</td></tr>
            )}
            {filtered.map((m) => {
              const draft = drafts[m.symbol];
              const dirty = draft !== undefined && String(draft) !== String(m.payout);
              const state = flash[m.symbol];
              return (
                <tr key={m.symbol} data-testid={`admin-market-row-${m.symbol}`}
                    className={`border-t border-white/6 transition-colors ${state === 'ok' ? 'bg-[#14b877]/[0.09]' : state === 'err' ? 'bg-red-500/[0.09]' : ''}`}>
                  <td className="px-4 py-3 font-semibold text-white/90 tabular-nums">{m.symbol}</td>
                  <td className="px-4 py-3 text-white/75">{m.name}</td>
                  <td className="px-4 py-3 text-white/55 capitalize">{m.category}</td>
                  <td className="px-4 py-3 tabular-nums text-[#14b877] font-extrabold" data-testid={`admin-market-current-${m.symbol}`}>{m.payout}%</td>
                  <td className="px-4 py-3">
                    <input data-testid={`admin-market-input-${m.symbol}`}
                           type="number" min={0} max={100} step="0.01"
                           value={draft ?? m.payout}
                           onChange={(e) => setDrafts((d) => ({ ...d, [m.symbol]: e.target.value }))}
                           onKeyDown={(e) => e.key === 'Enter' && dirty && save(m.symbol)}
                           className="w-24 bg-white/[0.04] border border-white/12 rounded-lg px-3 py-1.5 text-[13.5px] text-white tabular-nums focus:outline-none focus:border-[#14b877] focus:ring-2 focus:ring-[#14b877]/25 transition-colors" />
                  </td>
                  <td className="px-4 py-3">
                    <button data-testid={`admin-market-save-${m.symbol}`}
                            onClick={() => save(m.symbol)} disabled={!dirty || !!saving[m.symbol]}
                            className={`h-8 px-3.5 rounded-lg text-[12.5px] font-bold inline-flex items-center gap-1.5 transition-colors ${
                              !dirty ? 'bg-white/[0.05] text-white/35 cursor-not-allowed'
                              : 'bg-[#14b877] text-[#03150d] hover:bg-[#17cf86]'}`}>
                      {saving[m.symbol] ? <Loader2 size={13} className="animate-spin" />
                        : state === 'ok' ? <Check size={13} />
                        : 'Save'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Challenge purchases ---------------- */
function PurchasesPanel() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setBusy(true); setErr('');
    try {
      const { data } = await adminApi.get('/api/admin/purchases', { params: { limit: 100, offset: 0 } });
      setItems(data.items || []); setTotal(data.total || 0);
    } catch (e) { setErr(errText(e)); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div data-testid="admin-purchases-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[19px] font-extrabold" style={{ fontFamily: 'Manrope, sans-serif' }}>Challenge Purchases</h2>
          <p className="text-[12.5px] text-white/40 mt-0.5">{total} verified Binance Pay purchase{total === 1 ? '' : 's'}.</p>
        </div>
        <button data-testid="admin-purchases-refresh" onClick={load}
                className="h-9 px-3.5 rounded-xl border border-white/12 bg-white/[0.04] text-[12.5px] font-semibold text-white/80 hover:bg-white/[0.1] transition-colors inline-flex items-center gap-2">
          <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {err && (
        <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-[13.5px] text-red-300 inline-flex items-center gap-2">
          <AlertCircle size={15} /> {err}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
        <table className="w-full min-w-[1100px] text-[13px]" data-testid="admin-purchases-table">
          <thead className="bg-white/[0.04] text-white/45">
            <tr>
              {['User', 'Plan', 'Amount', 'Currency', 'Order ID', 'Type', 'Payer Binance ID', 'Payer name', 'Receiver ID', 'Account size', 'Paid at', 'Status'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {busy && items.length === 0 && (
              <tr><td colSpan={12} className="px-4 py-10 text-center text-white/40"><Loader2 size={18} className="animate-spin inline mr-2" />Loading purchases…</td></tr>
            )}
            {!busy && items.length === 0 && (
              <tr><td colSpan={12} className="px-4 py-10 text-center text-white/40">No purchases yet</td></tr>
            )}
            {items.map((p) => (
              <tr key={p.id} data-testid={`admin-purchase-row-${p.order_id}`}
                  onClick={() => setOpen(p)}
                  className="border-t border-white/6 hover:bg-white/[0.04] cursor-pointer transition-colors">
                <td className="px-4 py-3">
                  <div className="text-white/90 font-semibold">{p.user_name || '—'}</div>
                  <div className="text-white/40 text-[12px]">{p.user_email}</div>
                </td>
                <td className="px-4 py-3 capitalize font-semibold text-[#14b877]">{p.plan}</td>
                <td className="px-4 py-3 tabular-nums text-white/85">{money(p.amount_usd)}</td>
                <td className="px-4 py-3 text-white/60">{p.currency}</td>
                <td className="px-4 py-3 tabular-nums text-white/75">{p.order_id}</td>
                <td className="px-4 py-3 text-white/60">{p.order_type}</td>
                <td className="px-4 py-3 tabular-nums text-white/75">{p.payer_binance_id || '—'}</td>
                <td className="px-4 py-3 text-white/70">{p.payer_name || '—'}</td>
                <td className="px-4 py-3 tabular-nums text-white/60">{p.receiver_binance_id || '—'}</td>
                <td className="px-4 py-3 tabular-nums text-white/85">{money(p.account_size)}</td>
                <td className="px-4 py-3 text-white/55 whitespace-nowrap">{dt(p.paid_at || p.created_at)}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 rounded-full bg-[#14b877]/12 border border-[#14b877]/30 text-[#14b877] text-[11.5px] font-bold capitalize">{p.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center px-4 py-8"
             onClick={() => setOpen(null)} data-testid="admin-purchase-detail">
          <div onClick={(e) => e.stopPropagation()}
               className="w-full max-w-[560px] max-h-[85vh] overflow-y-auto rounded-2xl border border-white/12 bg-[#04120c] p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.2em] text-[#14b877] font-bold">Purchase detail</div>
                <div className="text-[19px] font-extrabold mt-1">{open.user_email}</div>
              </div>
              <button onClick={() => setOpen(null)} className="h-9 w-9 grid place-items-center rounded-full border border-white/12 text-white/60 hover:text-white"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              {[
                ['Plan', open.plan], ['Amount', `${open.amount_usd} ${open.currency}`],
                ['Order ID', open.order_id], ['Order type', open.order_type],
                ['Payer Binance ID', open.payer_binance_id || '—'], ['Payer name', open.payer_name || '—'],
                ['Receiver Binance ID', open.receiver_binance_id || '—'], ['Receiver name', open.receiver_name || '—'],
                ['Account size', money(open.account_size)], ['Status', open.status],
                ['Paid at', dt(open.paid_at)], ['Recorded at', dt(open.created_at)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5">
                  <div className="text-[11px] text-white/40 uppercase tracking-wide">{k}</div>
                  <div className="font-semibold text-white/90 break-all capitalize">{String(v)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Stat card ---------------- */
const StatCard = ({ icon: Icon, label, value, sub, testid }) => (
  <div data-testid={testid} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 hover:border-[#14b877]/40 transition-colors">
    <div className="flex items-center gap-2 text-white/45 text-[11.5px] font-semibold uppercase tracking-[0.14em]">
      <Icon size={14} className="text-[#14b877]" />{label}
    </div>
    <div className="mt-2.5 text-[27px] font-extrabold text-white tabular-nums" style={{ fontFamily: 'Manrope, sans-serif' }}>{value}</div>
    {sub && <div className="mt-1 text-[12.5px] text-white/40">{sub}</div>}
  </div>
);

/* ---------------- User detail drawer ---------------- */
function UserDrawer({ userId, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!userId) return;
    setData(null); setErr('');
    adminApi.get(`/api/admin/users/${userId}`).then((r) => setData(r.data)).catch((e) => setErr(errText(e)));
  }, [userId]);

  if (!userId) return null;
  const u = data?.user;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-testid="admin-user-drawer">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative h-full w-full max-w-[620px] overflow-y-auto border-l border-white/10 bg-[#061a12] p-7">
        <button data-testid="admin-drawer-close" onClick={onClose}
                className="absolute right-5 top-5 h-9 w-9 grid place-items-center rounded-lg bg-white/[0.06] text-white/70 hover:bg-white/[0.12] transition-colors"><X size={17} /></button>

        {err && <div className="text-red-300 text-[13px]">{err}</div>}
        {!data && !err && <div className="flex items-center gap-2 text-white/50 text-[14px]"><Loader2 size={16} className="animate-spin" /> Loading…</div>}

        {u && (
          <>
            <div className="text-[11px] uppercase tracking-[0.2em] text-[#14b877] font-bold mb-1">User profile</div>
            <h2 className="text-[23px] font-extrabold text-white break-all" style={{ fontFamily: 'Manrope, sans-serif' }}>{u.email}</h2>
            <div className="mt-1 text-[13px] text-white/45">{u.full_name || '—'} · {u.nickname || '—'} · {u.country || '—'}</div>

            <div className="mt-5 grid grid-cols-2 gap-3 text-[13px]">
              {[
                ['Auth provider', u.auth_provider], ['Role', u.role],
                ['Verified', u.is_verified ? 'Yes' : 'No'], ['Active', u.is_active ? 'Yes' : 'No'],
                ['Active account', u.active_account], ['KYC', u.kyc_status],
                ['Phone', u.phone || '—'], ['DOB', u.dob || '—'],
                ['Joined', dt(u.created_at)], ['Last login', dt(u.last_login_at)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-2.5">
                  <div className="text-[11px] uppercase tracking-wider text-white/35">{k}</div>
                  <div className="text-white/85 font-semibold mt-0.5 capitalize">{String(v)}</div>
                </div>
              ))}
            </div>

            <h3 className="mt-7 mb-3 text-[13px] font-bold uppercase tracking-[0.16em] text-white/55">Wallets</h3>
            <div className="grid grid-cols-2 gap-3">
              {(data.wallets || []).length === 0 && <div className="text-white/40 text-[13px]">No wallets</div>}
              {(data.wallets || []).map((w) => (
                <div key={w.type} className="rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-3">
                  <div className="text-[11px] uppercase tracking-wider text-white/35">{w.type}</div>
                  <div className="text-[18px] font-extrabold text-[#14b877] tabular-nums">{money(w.balance)}</div>
                </div>
              ))}
            </div>

            <h3 className="mt-7 mb-3 text-[13px] font-bold uppercase tracking-[0.16em] text-white/55">Recent trades ({data.trades?.length || 0})</h3>
            <div className="overflow-hidden rounded-xl border border-white/8">
              <table className="w-full text-[12.5px]">
                <thead className="bg-white/[0.04] text-white/45">
                  <tr>{['Symbol', 'Dir', 'Amount', 'P&L', 'Status', 'Time'].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {(data.trades || []).length === 0 && <tr><td colSpan={6} className="px-3 py-5 text-center text-white/35">No trades yet</td></tr>}
                  {(data.trades || []).map((t) => (
                    <tr key={t.id} className="border-t border-white/6">
                      <td className="px-3 py-2 text-white/80">{t.symbol}</td>
                      <td className={`px-3 py-2 font-semibold ${t.direction === 'higher' ? 'text-[#14b877]' : 'text-[#f43f5e]'}`}>{t.direction}</td>
                      <td className="px-3 py-2 text-white/75 tabular-nums">{money(t.amount)}</td>
                      <td className={`px-3 py-2 tabular-nums font-semibold ${(t.pnl || 0) > 0 ? 'text-[#14b877]' : (t.pnl || 0) < 0 ? 'text-[#f43f5e]' : 'text-white/50'}`}>{t.pnl === null ? '—' : money(t.pnl)}</td>
                      <td className="px-3 py-2 text-white/60 capitalize">{t.status}</td>
                      <td className="px-3 py-2 text-white/45">{dt(t.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */
function AdminDashboard({ onLogout }) {
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState({ items: [], total: 0 });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [openUser, setOpenUser] = useState(null);
  const limit = 25;

  const load = useCallback(async () => {
    if (tab !== 'overview') return;
    setBusy(true); setErr('');
    try {
      const [s, u] = await Promise.all([
        adminApi.get('/api/admin/stats'),
        adminApi.get('/api/admin/users', { params: { search, limit, offset } }),
      ]);
      setStats(s.data); setUsers(u.data);
    } catch (e) {
      if (e?.response?.status === 401 || e?.response?.status === 403) onLogout();
      else setErr(errText(e));
    } finally { setBusy(false); }
  }, [tab, search, offset, onLogout]);

  useEffect(() => {
    const t = setTimeout(() => { setOffset(0); setSearch(searchInput.trim()); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { load(); }, [load]);

  const pageInfo = useMemo(() => {
    const from = users.total === 0 ? 0 : offset + 1;
    const to = Math.min(offset + limit, users.total);
    return `${from}–${to} of ${users.total}`;
  }, [users.total, offset]);

  return (
    <div className="min-h-screen bg-[#04120c] text-white"
         style={{ backgroundImage: 'radial-gradient(1100px 600px at 90% -15%, rgba(20,184,119,0.10), transparent 60%)' }}>
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#04120c]/85 backdrop-blur-xl">
        <div className="mx-auto max-w-[1500px] px-6 h-[68px] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center h-9 w-9 rounded-xl bg-[#14b877]/15 text-[#14b877]"><ShieldCheck size={18} /></span>
            <div>
              <div className="text-[15px] font-extrabold leading-none whitespace-nowrap" style={{ fontFamily: 'Manrope, sans-serif' }}>Control Center</div>
              <div className="text-[11px] text-white/40 mt-0.5">Binary Fund Global · Admin</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button data-testid="admin-refresh-btn" onClick={load}
                    className="h-10 px-4 rounded-xl border border-white/12 bg-white/[0.04] text-[13.5px] font-semibold text-white/80 hover:bg-white/[0.1] transition-colors inline-flex items-center gap-2">
              <RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> <span className="hidden sm:inline">Refresh</span>
            </button>
            <button data-testid="admin-logout-btn" onClick={onLogout}
                    className="h-10 px-4 rounded-xl bg-white/[0.06] text-[13.5px] font-semibold text-white/70 hover:bg-red-500/15 hover:text-red-300 transition-colors inline-flex items-center gap-2">
              <LogOut size={15} /> <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-6 py-8">
        {/* Section tabs */}
        <div className="mb-7 inline-flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
          {[
            ['overview', 'Overview', Users],
            ['markets', 'Markets', BarChart3],
            ['purchases', 'Purchases', WalletIcon],
          ].map(([id, label, Icon]) => (
            <button key={id} data-testid={`admin-tab-${id}`} onClick={() => setTab(id)}
                    className={`inline-flex items-center gap-2 px-4 h-10 rounded-xl text-[13.5px] font-bold transition-colors ${
                      tab === id ? 'bg-[#14b877] text-[#03150d]' : 'text-white/60 hover:text-white hover:bg-white/[0.06]'}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {tab === 'markets' && <MarketsPanel />}
        {tab === 'purchases' && <PurchasesPanel />}

        {tab === 'overview' && (
        <div>
        {err && <div data-testid="admin-error" className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-[13.5px] text-red-300">{err}</div>}

        <div data-testid="admin-stats-grid" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard testid="stat-total-users" icon={Users} label="Total users" value={stats?.total_users ?? '—'}
                    sub={stats ? `${stats.google_users} Google · ${stats.password_users} password` : ''} />
          <StatCard testid="stat-total-trades" icon={Activity} label="Total trades" value={stats?.total_trades ?? '—'}
                    sub={stats ? `${stats.open_trades} open · ${stats.trades_24h} in 24h` : ''} />
          <StatCard testid="stat-total-volume" icon={TrendingUp} label="Total volume" value={stats ? money(stats.total_volume) : '—'}
                    sub={stats ? `Win rate ${stats.win_rate}%` : ''} />
          <StatCard testid="stat-total-pnl" icon={WalletIcon} label="Trader P&L" value={stats ? money(stats.total_pnl) : '—'}
                    sub={stats ? `Balances held ${money(stats.total_balance)}` : ''} />
        </div>

        <div className="mt-9 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[19px] font-extrabold" style={{ fontFamily: 'Manrope, sans-serif' }}>Users</h2>
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
            <input data-testid="admin-user-search" value={searchInput}
                   onChange={(e) => setSearchInput(e.target.value)}
                   placeholder="Search email, name, nickname, country"
                   className="w-[340px] max-w-full bg-white/[0.04] border border-white/12 rounded-xl pl-10 pr-4 py-2.5 text-[13.5px] text-white placeholder:text-white/30 focus:outline-none focus:border-[#14b877] focus:ring-2 focus:ring-[#14b877]/20 transition-colors" />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
          <table className="w-full min-w-[1050px] text-[13px]" data-testid="admin-users-table">
            <thead className="bg-white/[0.04] text-white/45">
              <tr>
                {['User', 'Nickname', 'Country', 'Login', 'Verified', 'Demo', 'Live balances', 'Trades', 'P&L', 'Joined'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {busy && users.items.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-white/40"><Loader2 size={18} className="animate-spin inline mr-2" />Loading users…</td></tr>
              )}
              {!busy && users.items.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-white/40">No users found</td></tr>
              )}
              {users.items.map((u) => {
                const live = Object.entries(u.balances || {}).filter(([k]) => k !== 'demo');
                return (
                  <tr key={u.id} data-testid={`admin-user-row-${u.id}`} onClick={() => setOpenUser(u.id)}
                      className="border-t border-white/6 hover:bg-[#14b877]/[0.06] cursor-pointer transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white/90">{u.email}</div>
                      <div className="text-white/40 text-[12px]">{u.full_name || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-white/70">{u.nickname || '—'}</td>
                    <td className="px-4 py-3 text-white/70">{u.country || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-[3px] rounded-md text-[11.5px] font-bold ${u.auth_provider === 'google' ? 'bg-[#4285F4]/15 text-[#8ab4f8]' : 'bg-white/8 text-white/60'}`}>
                        {u.auth_provider}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-[3px] rounded-md text-[11.5px] font-bold ${u.is_verified ? 'bg-[#14b877]/15 text-[#14b877]' : 'bg-white/8 text-white/50'}`}>
                        {u.is_verified ? 'yes' : 'no'}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-white/80">{money(u.balances?.demo || 0)}</td>
                    <td className="px-4 py-3 text-white/70 tabular-nums">
                      {live.length === 0 ? '—' : live.map(([k, v]) => <span key={k} className="mr-2.5">{k}: {money(v)}</span>)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-white/80">{u.stats?.trades ?? 0}</td>
                    <td className={`px-4 py-3 tabular-nums font-semibold ${(u.stats?.pnl || 0) > 0 ? 'text-[#14b877]' : (u.stats?.pnl || 0) < 0 ? 'text-[#f43f5e]' : 'text-white/50'}`}>
                      {money(u.stats?.pnl || 0)}
                    </td>
                    <td className="px-4 py-3 text-white/45 whitespace-nowrap">{dt(u.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-[13px] text-white/45">
          <span data-testid="admin-page-info">{pageInfo}</span>
          <div className="flex gap-2">
            <button data-testid="admin-prev-page" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}
                    className="h-9 px-3 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.1] disabled:opacity-35 transition-colors inline-flex items-center gap-1"><ChevronLeft size={15} /> Prev</button>
            <button data-testid="admin-next-page" disabled={offset + limit >= users.total} onClick={() => setOffset(offset + limit)}
                    className="h-9 px-3 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.1] disabled:opacity-35 transition-colors inline-flex items-center gap-1">Next <ChevronRight size={15} /></button>
          </div>
        </div>
        </div>
        )}
      </main>

      <UserDrawer userId={openUser} onClose={() => setOpenUser(null)} />
    </div>
  );
}

/* ---------------- Page ---------------- */
export default function AdminPortal() {
  const [authed, setAuthed] = useState(!!localStorage.getItem('bfg_admin_token'));
  const logout = useCallback(() => {
    localStorage.removeItem('bfg_admin_token');
    setAuthed(false);
  }, []);
  return authed ? <AdminDashboard onLogout={logout} /> : <AdminLogin onDone={() => setAuthed(true)} />;
}
