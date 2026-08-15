import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShieldCheck, Bank, TrendUp } from '@phosphor-icons/react';
import BrandLogo from './BrandLogo';
import AuthBackdrop from './AuthBackdrop';

const AuthTabs = () => {
  const { pathname } = useLocation();
  const tabs = [
    { to: '/login', label: 'Login' },
    { to: '/registration', label: 'Registration' },
  ];
  return (
    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/[0.05] border border-white/10 mb-7" data-testid="auth-tabs">
      {tabs.map((t) => (
        <Link key={t.to} to={t.to} data-testid={`auth-tab-${t.label.toLowerCase()}`}
              className={`text-center py-2.5 rounded-lg text-[14px] font-semibold transition-colors ${pathname === t.to ? 'bg-[#14b877]/15 text-[#14b877] border border-[#14b877]/35' : 'text-white/55 hover:text-white'}`}>
          {t.label}
        </Link>
      ))}
    </div>
  );
};

const AuthLayout = ({ title, children }) => (
  <div className="relative min-h-screen flex flex-col overflow-hidden"
       style={{ background: 'radial-gradient(900px 600px at 15% 0%, rgba(20,184,119,0.16), transparent 60%), radial-gradient(700px 500px at 95% 100%, rgba(20,184,119,0.10), transparent 55%), #040D09' }}>

    <AuthBackdrop />

    {/* Mobile top-left logo bar */}
    <div className="lg:hidden px-4 pt-4 relative z-10">
      <Link to="/" className="inline-flex items-center gap-2" data-testid="auth-logo-link-mobile">
        <BrandLogo className="h-8 w-auto object-contain" />
        <span className="font-display font-bold text-[15px] text-white leading-none">Binary Fund <span className="bfg-green-text">Global</span></span>
      </Link>
    </div>

    <div className="relative z-10 flex-1 flex items-start lg:items-center justify-center px-4 py-6 sm:px-6 sm:py-10">
      <div className="w-full max-w-[980px] rounded-[26px] overflow-hidden border border-white/10 grid lg:grid-cols-[1fr_1.05fr] shadow-[0_40px_100px_-30px_rgba(0,0,0,0.8)] backdrop-blur-[10px]"
           style={{ background: 'linear-gradient(150deg, rgba(13,30,24,0.9) 0%, rgba(7,21,16,0.92) 55%, rgba(4,13,9,0.94) 100%)' }}>

        {/* Left brand panel — desktop only */}
        <div className="relative hidden lg:flex flex-col justify-between p-10 xl:p-12 border-r border-white/[0.07]"
             style={{ background: 'linear-gradient(160deg, rgba(20,184,119,0.14) 0%, rgba(20,184,119,0.04) 45%, transparent 100%)' }}>
          <Link to="/" className="flex items-center gap-2.5" data-testid="auth-logo-link">
            <BrandLogo className="h-10 w-auto object-contain" />
            <span className="font-display font-bold text-[17px] text-white">Binary Fund <span className="bfg-green-text">Global</span></span>
          </Link>
          <div>
            <h2 className="font-display font-bold text-white text-[32px] xl:text-[36px] leading-[1.12]">Pass the challenge.<br /><span className="bfg-green-text">Get funded on Quotex.</span></h2>
            <p className="mt-4 text-white/55 text-[14.5px] max-w-sm leading-relaxed">Join 10,000+ traders. Complete a one-time challenge and we deposit real balance into a live Quotex account for you.</p>
            <div className="mt-8 space-y-3">
              {[[ShieldCheck, 'Only the one-time fee is ever at risk'], [Bank, 'Up to $3,000 real Quotex balance'], [TrendUp, 'Trade our capital and keep the profit']].map(([Icon, t], i) => (
                <div key={i} className="flex items-center gap-3 text-white/85 text-[14px]">
                  <span className="h-9 w-9 rounded-xl flex items-center justify-center border border-[#14b877]/25 bg-[#14b877]/10"><Icon size={17} weight="duotone" className="text-[#14b877]" /></span>{t}
                </div>
              ))}
            </div>
          </div>
          <p className="text-white/35 text-[12px]">© {new Date().getFullYear()} Binary Fund Global</p>
        </div>

        {/* Right form panel */}
        <div className="px-5 py-8 sm:px-10 sm:py-11">
          <AuthTabs />
          <div className="text-center">
            <h1 className="font-display font-bold text-white text-[26px] sm:text-[29px]">{title}</h1>
            <div className="mx-auto mt-3 h-[3px] w-16 rounded-full bg-gradient-to-r from-transparent via-[#14B877] to-transparent" aria-hidden="true" />
          </div>
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </div>
  </div>
);

export default AuthLayout;
