import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { CircleNotch, Flask, Atom, Crown, SketchLogo, Timer, ArrowRight, ArrowsLeftRight } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { Drawer, DrawerContent, DrawerTitle } from '../ui/drawer';
import { useToast } from '../../hooks/use-toast';

import { API_BASE as API } from '../../lib/apiBase';

const STYLES = {
  demo: {
    icon: Flask,
    wrap: 'bg-gradient-to-br from-amber-400 to-orange-500 text-[#1a1204] shadow-[0_3px_14px_rgba(251,191,36,0.3)]',
    text: 'text-amber-300',
    ring: 'border-amber-400/40',
  },
  basic: {
    icon: Atom,
    wrap: 'bg-gradient-to-br from-sky-400 to-blue-600 text-[#04121f] shadow-[0_3px_14px_rgba(56,189,248,0.3)]',
    text: 'text-sky-300',
    ring: 'border-sky-400/40',
  },
  standard: {
    icon: Crown,
    wrap: 'bg-gradient-to-br from-violet-400 to-purple-600 text-[#150726] shadow-[0_3px_14px_rgba(167,139,250,0.3)]',
    text: 'text-violet-300',
    ring: 'border-violet-400/40',
  },
  premium: {
    icon: SketchLogo,
    wrap: 'bg-gradient-to-br from-[#F4D67A] to-[#B8860B] text-[#1c1403] shadow-[0_3px_14px_rgba(212,175,55,0.35)]',
    text: 'text-[#F4D67A]',
    ring: 'border-[#D4AF37]/45',
  },
};

const money = (v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  useEffect(() => {
    const m = window.matchMedia('(min-width: 768px)');
    const h = (e) => setIsDesktop(e.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, []);
  return isDesktop;
}

function SwitcherBody({ accounts, loading, switching, onRowTap }) {
  const activeAcc = accounts.find((a) => a.is_active);
  const activeStyle = activeAcc ? (STYLES[activeAcc.key] || STYLES.demo) : STYLES.demo;

  if (loading) {
    return (
      <div className="h-[260px] flex items-center justify-center text-white/50">
        <CircleNotch size={30} className="animate-spin" />
      </div>
    );
  }

  const rows = accounts.filter((a) => !a.is_active);

  return (
    <div className="px-4 pb-5 sm:px-6 sm:pb-6">
      {/* Segmented account tabs */}
      <div className="mt-2 grid grid-cols-4 gap-1 rounded-2xl border border-white/[0.08] bg-black/30 p-1 md:hidden" data-testid="account-tabs">
        {accounts.map((a) => {
          const s = STYLES[a.key] || STYLES.demo;
          const act = a.is_active;
          return (
            <button
              key={a.key}
              data-testid={`account-tab-${a.key}`}
              disabled={!!switching}
              onClick={() => onRowTap(a)}
              className={`flex items-center justify-center gap-1 rounded-xl py-2 transition-colors ${
                act ? 'bg-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]' : 'hover:bg-white/[0.05] active:bg-white/[0.04]'
              }`}
            >
              <s.icon size={13} weight="fill" className={act ? s.text : 'text-white/35'} />
              <span className={`text-[10px] font-bold ${act ? 'text-white' : 'text-white/45'}`}>{a.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active account hero */}
      {activeAcc && (
        <div className="flex flex-col items-center py-5 sm:py-6" data-testid="active-account-hero">
          <span className={`grid place-items-center h-12 w-12 sm:h-14 sm:w-14 rounded-2xl ${activeStyle.wrap}`}>
            <activeStyle.icon className="h-6 w-6 sm:h-7 sm:w-7" weight="fill" />
          </span>
          <div className="mt-3 text-[26px] sm:text-[30px] font-extrabold tabular-nums leading-none" data-testid="active-account-balance">
            {money(activeAcc.balance)}
          </div>
          <div className={`mt-1.5 text-[10px] font-extrabold tracking-[0.22em] uppercase ${activeStyle.text}`}>
            {activeAcc.label} Account
          </div>
          {activeAcc.days_left !== null && activeAcc.days_left !== undefined && (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.05] px-2.5 py-1 text-[10px] font-bold text-white/75" data-testid="active-days-left">
              <Timer size={12} weight="bold" /> {activeAcc.days_left} days left
            </span>
          )}
        </div>
      )}

      {/* Account rows */}
      <div className="flex flex-col gap-2">
        {rows.map((a) => {
          const s = STYLES[a.key] || STYLES.demo;
          const isBusy = switching === a.key;
          return (
            <button
              key={a.key}
              data-testid={`account-card-${a.key}`}
              disabled={isBusy || !!switching}
              onClick={() => onRowTap(a)}
              className="w-full flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 sm:px-3.5 sm:py-3 text-left transition-colors hover:bg-white/[0.05] hover:border-white/[0.16] active:bg-white/[0.06] disabled:opacity-60"
            >
              <span className={`shrink-0 grid place-items-center h-9 w-9 rounded-xl ${a.unlocked ? s.wrap : 'bg-white/[0.06] text-white/40'}`}>
                <s.icon size={18} weight="fill" />
              </span>

              <span className="flex-1 min-w-0 flex flex-col gap-[3px] leading-none">
                <span className="flex items-center gap-1.5">
                  <span className="text-[13px] font-bold">{a.label} Account</span>
                  {a.unlocked && a.days_left !== null && a.days_left !== undefined && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-white/[0.06] border border-white/15 text-white/65 px-1.5 py-[2px] text-[8px] font-extrabold" data-testid={`days-left-${a.key}`}>
                      <Timer size={9} weight="bold" /> {a.days_left}d left
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-white/40 tabular-nums font-semibold">
                  {a.unlocked ? money(a.balance) : `Funded ${money(a.starting_balance).replace('.00', '')} account`}
                </span>
              </span>

              {a.unlocked ? (
                isBusy
                  ? <CircleNotch size={16} className="animate-spin text-white/60 shrink-0" />
                  : <span className="shrink-0 grid place-items-center h-8 w-8 rounded-xl bg-white/[0.05] border border-white/10 text-white/55"><ArrowsLeftRight size={14} weight="bold" /></span>
              ) : (
                <span
                  data-testid={`purchase-account-${a.key}`}
                  className="shrink-0 inline-flex items-center gap-1 rounded-full bg-gradient-to-b from-[#1ad48b] to-[#0fa066] text-[#03150d] text-[11px] font-extrabold pl-3.5 pr-2 py-1.5 shadow-[0_3px_12px_rgba(20,184,119,0.3)]"
                >
                  Purchase
                  <span className="rounded-full bg-black/20 px-1.5 py-[2px] text-[10px] tabular-nums">${a.price_usd}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function AccountSwitcher({ open, onClose, onSwitched }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(null);
  const [switched, setSwitched] = useState(null);

  const token = localStorage.getItem('bfg_token');
  const authH = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    axios.get(`${API}/api/accounts`, authH)
      .then(({ data }) => setAccounts(data))
      .catch(() => toast({ title: 'Failed to load accounts', variant: 'destructive' }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line
  }, [open]);

  const switchTo = async (key) => {
    setSwitching(key);
    try {
      const { data } = await axios.post(`${API}/api/accounts/switch`, { account: key }, authH);
      const from = accounts.find((a) => a.is_active);
      const to = accounts.find((a) => a.key === key);
      onSwitched?.({ active: data.active, balance: data.balance });
      onClose?.();
      setSwitched({
        from: { key: from?.key || 'demo', label: from?.label || 'Demo', balance: from?.balance ?? 0 },
        to: { key, label: to?.label || key, balance: data.balance },
      });
    } catch (err) {
      toast({ title: err?.response?.data?.detail || 'Cannot switch account', variant: 'destructive' });
    } finally {
      setSwitching(null);
    }
  };

  const onRowTap = (a) => {
    if (!a.unlocked) {
      onClose?.();
      navigate('/challenges');
      return;
    }
    if (!a.is_active) switchTo(a.key);
  };

  const body = <SwitcherBody accounts={accounts} loading={loading} switching={switching} onRowTap={onRowTap} />;

  const switchedModal = (
    <Dialog open={!!switched} onOpenChange={(v) => !v && setSwitched(null)}>
      <DialogContent
        data-testid="account-switched-dialog"
        className="max-w-[380px] w-[92vw] bg-gradient-to-b from-[#06130c] to-[#03170e] border border-white/10 text-white p-0 rounded-3xl shadow-[0_32px_80px_rgba(0,0,0,0.7)]"
      >
        {switched && (() => {
          const fs = STYLES[switched.from.key] || STYLES.demo;
          const ts = STYLES[switched.to.key] || STYLES.demo;
          return (
            <div className="px-5 pt-5 pb-5">
              <DialogTitle className="text-[17px] font-extrabold text-white">Account type changed</DialogTitle>
              <p className="mt-1 text-[12.5px] text-white/55">
                You are now trading on a <span className={`font-bold ${ts.text}`}>{switched.to.label} Account</span>
              </p>
              <div className="my-4 h-px bg-white/10" />

              <div className="flex items-center justify-center gap-4 sm:gap-6 py-2">
                <div className="flex flex-col items-center gap-2 min-w-[110px]" data-testid="switched-from">
                  <span className="grid place-items-center h-11 w-11 rounded-2xl bg-white/[0.05] border border-white/10 text-white/40">
                    <fs.icon size={20} weight="fill" />
                  </span>
                  <span className="text-[9px] font-extrabold tracking-[0.18em] uppercase text-white/45">{switched.from.label} Account</span>
                  <span className="text-[13px] font-bold tabular-nums text-white/60">{money(switched.from.balance)}</span>
                </div>
                <span className="grid place-items-center h-7 w-7 rounded-full bg-white/[0.06] border border-white/10 text-white/50 shrink-0">
                  <ArrowRight size={13} weight="bold" />
                </span>
                <div className="flex flex-col items-center gap-2 min-w-[110px]" data-testid="switched-to">
                  <span className={`grid place-items-center h-11 w-11 rounded-2xl ${ts.wrap}`}>
                    <ts.icon size={20} weight="fill" />
                  </span>
                  <span className={`text-[9px] font-extrabold tracking-[0.18em] uppercase ${ts.text}`}>{switched.to.label} Account</span>
                  <span className="text-[15px] font-extrabold tabular-nums">{money(switched.to.balance)}</span>
                </div>
              </div>

              <button
                onClick={() => setSwitched(null)}
                data-testid="switched-close-button"
                className="mt-4 w-full py-2.5 rounded-xl bg-gradient-to-b from-[#1ad48b] to-[#0fa066] text-[#03150d] text-[13px] font-extrabold shadow-[0_4px_18px_rgba(20,184,119,0.25)] hover:brightness-110 active:scale-[0.98] transition-[transform,filter]"
              >
                Close
              </button>
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>
  );

  if (isDesktop) {
    return (
      <>
        <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
          <DialogContent
            data-testid="account-switcher-dialog"
            className="max-w-[460px] w-[95vw] max-h-[88vh] overflow-y-auto bg-gradient-to-b from-[#06130c] to-[#03170e] border border-white/10 text-white p-0 pt-4 rounded-3xl shadow-[0_32px_80px_rgba(0,0,0,0.7)]"
          >
            <DialogTitle className="sr-only">Accounts</DialogTitle>
            {body}
          </DialogContent>
        </Dialog>
        {switchedModal}
      </>
    );
  }

  return (
    <>
      <Drawer open={open} onOpenChange={(v) => !v && onClose?.()}>
        <DrawerContent
          data-testid="account-switcher-drawer"
          className="bg-gradient-to-b from-[#06130c] to-[#03170e] border-white/10 text-white rounded-t-3xl max-h-[86dvh] overflow-y-auto"
        >
          <DrawerTitle className="sr-only">Accounts</DrawerTitle>
          <SwitcherBody accounts={accounts} loading={loading} switching={switching} onRowTap={onRowTap} mobile />
        </DrawerContent>
      </Drawer>
      {switchedModal}
    </>
  );
}
