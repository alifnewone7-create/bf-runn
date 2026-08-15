import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, ArrowRight, CheckCircle, Atom, Crown, SketchLogo, Copy,
  CircleNotch, ShieldCheck, X, CurrencyCircleDollar, SealCheck, Warning,
} from '@phosphor-icons/react';
import { API_BASE as API } from '../lib/apiBase';
import { isLoggedIn } from '../lib/auth';
import { useToast } from '../hooks/use-toast';

const ICONS = { basic: Atom, standard: Crown, premium: SketchLogo };
const RULE_ROWS = [
  ['daily_profit_pct', 'Daily Profit'],
  ['daily_loss_pct', 'Daily Loss'],
  ['max_loss_pct', 'Maximum Loss'],
  ['profit_target_pct', 'Profit Target'],
  ['duration_days', 'Challenge Duration'],
  ['per_trade_pct', 'Per Trade Amount'],
];
const ruleValue = (k, v) => {
  if (v === null || v === undefined) return 'No Limit';
  return k === 'duration_days' ? `${v} days` : `${v}%`;
};
const money = (n) => `$${Number(n || 0).toLocaleString('en-US')}`;

/* ───────────────────────── Purchase overlay ───────────────────────── */
function PurchaseOverlay({ plan, payment, onClose, onDone }) {
  const { toast } = useToast();
  const [step, setStep] = useState('method'); // method | pay
  const [orderId, setOrderId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  const submit = async () => {
    setErr('');
    if (orderId.trim().length < 6) return setErr('Enter the full Order ID from your Binance payment.');
    setBusy(true);
    try {
      const token = localStorage.getItem('bfg_token');
      const { data } = await axios.post(
        `${API}/api/challenges/purchase`,
        { plan: plan.key, order_id: orderId.trim() },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      toast({ title: `${plan.label} challenge unlocked`, description: `${money(data.balance)} credited to your ${plan.label} account.` });
      onDone?.(data);
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Verification failed. Please check the Order ID.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-start sm:items-center justify-center px-4 py-8 overflow-y-auto"
         data-testid="purchase-overlay"
         style={{ background: 'rgba(2,10,7,0.82)', backdropFilter: 'blur(10px)' }}>
      <div className="relative w-full max-w-[520px] rounded-3xl border border-[#14B877]/25 bg-[#04120c]/95 p-6 sm:p-8 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]">
        <button onClick={onClose} data-testid="purchase-close-btn"
                className="absolute right-4 top-4 h-9 w-9 grid place-items-center rounded-full border border-white/12 text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors">
          <X size={16} weight="bold" />
        </button>

        <div className="text-[11px] uppercase tracking-[0.22em] font-bold text-[#14B877]">Purchase Challenge</div>
        <h2 className="mt-2 text-[24px] font-extrabold text-white leading-tight" data-testid="purchase-title">
          {plan.label} — {money(plan.price_usd)}
        </h2>
        <p className="mt-1.5 text-[13px] text-white/50">
          {money(plan.funded_usd)} challenge account · pay in USDT
        </p>

        {step === 'method' && (
          <div className="mt-7">
            <div className="text-[12px] font-semibold text-white/45 uppercase tracking-[0.14em]">Payment method</div>
            <button onClick={() => setStep('pay')} data-testid="binance-pay-option"
                    className="mt-3 w-full flex items-center gap-4 rounded-2xl border border-[#F0B90B]/35 bg-[#F0B90B]/[0.07] px-4 py-4 text-left hover:bg-[#F0B90B]/[0.13] hover:border-[#F0B90B]/60 transition-colors">
              <span className="grid place-items-center h-11 w-11 rounded-xl bg-[#F0B90B]/15 text-[#F0B90B]">
                <CurrencyCircleDollar size={24} weight="duotone" />
              </span>
              <span className="flex-1">
                <span className="block text-[15px] font-bold text-white">Binance Pay</span>
                <span className="block text-[12px] text-white/45">USDT · C2C transfer · instant verification</span>
              </span>
              <ArrowRight size={17} weight="bold" className="text-[#F0B90B]" />
            </button>
            <div className="mt-5 flex items-start gap-2.5 text-[12px] text-white/40 leading-relaxed">
              <ShieldCheck size={16} className="text-[#14B877] shrink-0 mt-0.5" />
              Every payment is verified on our server against your Binance Order ID — amount, currency and receiver must match exactly.
            </div>
          </div>
        )}

        {step === 'pay' && (
          <div className="mt-6">
            <div className="rounded-2xl border border-[#14B877]/25 px-4 py-4"
                 style={{ background: 'linear-gradient(120deg, rgba(20,184,119,0.12), rgba(240,185,11,0.06))' }}>
              <div className="text-[11px] uppercase tracking-[0.16em] font-bold text-white/45">Send exactly</div>
              <div className="mt-0.5 text-[30px] font-extrabold text-white tabular-nums" data-testid="pay-amount">
                {plan.price_usd} <span className="text-[15px] font-bold text-[#14B877]">USDT</span>
              </div>
            </div>

            <div className="mt-4 space-y-2.5">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <div>
                  <div className="text-[11px] text-white/40 uppercase tracking-[0.14em] font-semibold">Binance ID</div>
                  <div className="text-[16px] font-bold text-white tabular-nums" data-testid="binance-id-value">{payment.binance_id}</div>
                </div>
                <button onClick={() => copy(payment.binance_id, 'Binance ID')} data-testid="copy-binance-id-btn"
                        className="h-9 px-3 rounded-lg border border-[#14B877]/40 bg-[#14B877]/10 text-[#14B877] text-[12.5px] font-bold inline-flex items-center gap-1.5 hover:bg-[#14B877]/20 transition-colors">
                  <Copy size={14} weight="bold" /> Copy
                </button>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="text-[11px] text-white/40 uppercase tracking-[0.14em] font-semibold">Name</div>
                <div className="text-[15px] font-bold text-white" data-testid="binance-name-value">{payment.account_name}</div>
              </div>
            </div>

            <label className="mt-5 block text-[12.5px] font-semibold text-white/60">Enter Order ID</label>
            <input value={orderId} inputMode="numeric" data-testid="order-id-input"
                   onChange={(e) => setOrderId(e.target.value.replace(/[^0-9]/g, ''))}
                   onKeyDown={(e) => e.key === 'Enter' && !busy && submit()}
                   placeholder="e.g. 264928374018273645"
                   className="mt-1.5 w-full bg-white/[0.04] border border-white/12 rounded-xl px-4 py-3 text-[15px] text-white tabular-nums placeholder:text-white/25 focus:outline-none focus:border-[#14B877] focus:ring-2 focus:ring-[#14B877]/25 transition-colors" />
            <div className="mt-1.5 text-[11.5px] text-white/35">Numbers only — copy the Order ID from your Binance Pay receipt.</div>

            {err && (
              <div data-testid="purchase-error" className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-3 text-[13px] text-red-300 flex items-start gap-2">
                <Warning size={16} className="shrink-0 mt-0.5" /> {err}
              </div>
            )}

            <button onClick={submit} disabled={busy} data-testid="verify-payment-btn"
                    className="mt-5 w-full h-12 rounded-xl bg-[#14B877] text-[#03150d] font-extrabold text-[15px] grid place-items-center hover:bg-[#17cf86] active:scale-[0.99] transition-[background-color,transform] disabled:opacity-60">
              {busy ? <CircleNotch size={20} className="animate-spin" /> : 'Verify payment & unlock'}
            </button>
            <button onClick={() => setStep('method')} disabled={busy}
                    className="mt-2.5 w-full h-10 rounded-xl text-[13px] font-semibold text-white/45 hover:text-white/80 transition-colors">
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Page ───────────────────────── */
export default function ChallengesPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [buying, setBuying] = useState(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const token = localStorage.getItem('bfg_token');
      const res = await axios.get(`${API}/api/challenges/plans`, { headers: { Authorization: `Bearer ${token}` } });
      setData(res.data);
    } catch (e) {
      if (e?.response?.status === 401) {
        // Stale token — clear it, otherwise Login redirects straight back.
        localStorage.removeItem('bfg_token');
        localStorage.removeItem('bfg_user');
        navigate('/login?next=/challenges');
      }
    } finally { setBusy(false); }
  }, [navigate]);

  useEffect(() => {
    if (!isLoggedIn()) { navigate('/login?next=/challenges'); return; }
    load();
  }, [load, navigate]);

  return (
    <div className="min-h-screen bg-[#04120c] text-white"
         style={{ backgroundImage: 'radial-gradient(1000px 560px at 12% -12%, rgba(20,184,119,0.16), transparent 62%), radial-gradient(900px 480px at 95% 8%, rgba(212,175,55,0.08), transparent 60%)' }}
         data-testid="challenges-page">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#04120c]/85 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-[64px] flex items-center justify-between">
          <button onClick={() => navigate('/demo-trade')} data-testid="challenges-back-btn"
                  className="h-10 px-3.5 rounded-xl border border-white/12 bg-white/[0.04] text-[13px] font-semibold text-white/75 hover:bg-white/[0.1] transition-colors inline-flex items-center gap-2">
            <ArrowLeft size={16} weight="bold" /> Terminal
          </button>
          <div className="text-[13px] font-bold tracking-[0.2em] uppercase text-[#14B877]">Challenges</div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
        <div className="max-w-2xl">
          <h1 className="text-[32px] sm:text-[42px] font-extrabold leading-[1.08]" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Choose your <span className="text-[#14B877]">funding level</span>
          </h1>
          <p className="mt-4 text-[15px] text-white/50 leading-relaxed">
            One-time fee, no subscription. Pass the rules and we deposit real balance into a live Quotex account for you.
          </p>
        </div>

        {busy && (
          <div className="mt-16 flex items-center justify-center text-white/45" data-testid="challenges-loading">
            <CircleNotch size={30} className="animate-spin" />
          </div>
        )}

        {!busy && data && (
          <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {data.plans.map((p) => {
              const Icon = ICONS[p.key] || Atom;
              return (
                <div key={p.key} data-testid={`challenge-plan-${p.key}`}
                     className={`relative flex flex-col rounded-3xl border p-6 sm:p-7 transition-[transform,border-color] duration-300 hover:-translate-y-1 ${
                       p.popular ? 'border-[#D4AF37]/45 bg-white/[0.045]' : 'border-white/10 bg-white/[0.025] hover:border-[#14B877]/45'}`}
                     style={p.popular ? { boxShadow: '0 30px 90px -40px rgba(212,175,55,0.45)' } : undefined}>
                  {p.popular && (
                    <span className="absolute -top-3 left-6 px-3 py-1 rounded-full text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[#04150d]"
                          style={{ background: 'linear-gradient(120deg,#14B877,#6FE0B0 35%,#F4D67A 70%,#D4AF37)' }}>
                      Most Popular
                    </span>
                  )}
                  <div className="flex items-center gap-3">
                    <span className="grid place-items-center h-11 w-11 rounded-2xl bg-[#14B877]/12 border border-[#14B877]/25">
                      <Icon size={22} weight="duotone" color={p.popular ? '#D4AF37' : '#14B877'} />
                    </span>
                    <div>
                      <div className="text-[17px] font-bold leading-tight">{p.label}</div>
                      <div className="text-[12px] text-white/45">{p.tagline}</div>
                    </div>
                  </div>

                  <div className="mt-6 flex items-end gap-2">
                    <span className="text-[38px] font-extrabold leading-none" style={{ fontFamily: 'Manrope, sans-serif' }}>{money(p.funded_usd)}</span>
                    <span className="text-[12.5px] text-white/45 pb-1.5">funded account</span>
                  </div>
                  <div className="mt-1.5 text-[13px]">
                    <span className="text-white/45">One-time fee </span>
                    <span className="font-bold text-[#14B877]" data-testid={`plan-price-${p.key}`}>{money(p.price_usd)}</span>
                  </div>

                  <div className="mt-5 rounded-2xl border border-[#14B877]/22 px-4 py-3.5"
                       style={{ background: 'linear-gradient(120deg, rgba(20,184,119,0.12), rgba(212,175,55,0.05))' }}>
                    <div className="text-[10.5px] uppercase tracking-[0.16em] font-bold text-white/45">On passing you get</div>
                    <div className="mt-0.5 text-[19px] font-bold">{money(p.quotex_usd)} <span className="text-[12.5px] font-semibold text-[#14B877]">real Quotex balance</span></div>
                  </div>

                  <ul className="mt-5 space-y-2.5">
                    {RULE_ROWS.filter(([k]) => p.rules[k] !== undefined).map(([k, label]) => (
                      <li key={k} className="flex items-center justify-between text-[13px]">
                        <span className="text-white/50">{label}</span>
                        <span className="font-semibold tabular-nums">{ruleValue(k, p.rules[k])}</span>
                      </li>
                    ))}
                  </ul>

                  <ul className="mt-5 space-y-2 flex-1">
                    {(p.perks || []).map((perk) => (
                      <li key={perk} className="flex items-start gap-2 text-[12.5px] text-white/60">
                        <CheckCircle size={16} weight="duotone" color="#14B877" className="shrink-0 mt-0.5" /> {perk}
                      </li>
                    ))}
                  </ul>

                  {p.owned ? (
                    <div data-testid={`plan-owned-${p.key}`}
                         className="mt-6 w-full h-12 rounded-xl border border-[#14B877]/45 bg-[#14B877]/12 text-[#14B877] font-bold text-[14px] inline-flex items-center justify-center gap-2">
                      <SealCheck size={17} weight="fill" /> Active — unlocked
                    </div>
                  ) : (
                    <button onClick={() => setBuying(p)} data-testid={`purchase-btn-${p.key}`}
                            className={`mt-6 w-full h-12 rounded-xl font-extrabold text-[14.5px] inline-flex items-center justify-center gap-2 transition-[background-color,transform] active:scale-[0.99] ${
                              p.popular ? 'bg-[#14B877] text-[#03150d] hover:bg-[#17cf86]'
                                        : 'border border-[#14B877]/45 text-[#14B877] hover:bg-[#14B877]/12'}`}>
                      Purchase — {money(p.price_usd)} <ArrowRight size={16} weight="bold" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {buying && data && (
        <PurchaseOverlay
          plan={buying}
          payment={data.payment}
          onClose={() => setBuying(null)}
          onDone={() => { setBuying(null); load(); }}
        />
      )}
    </div>
  );
}
