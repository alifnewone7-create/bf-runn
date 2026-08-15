import React from 'react';
import {
  Vault, LockKey, Lightning, GlobeHemisphereWest, DeviceMobile, Timer,
  ArrowUpRight, CheckCircle
} from '@phosphor-icons/react';

const CHIPS = ['Up to $5,000 funding', 'Funded in <24h', 'Real withdrawals'];

const BARS = [34, 48, 42, 62, 55, 74, 68, 92];

const COMPACT = [
  { icon: LockKey, num: '01', title: 'Fixed, capped risk', desc: 'Max loss per trade is always capped at the amount you place — never more.' },
  { icon: Lightning, num: '02', title: 'Instant settlement', desc: 'Trades settle at expiry and credit your balance in under a second.' },
  { icon: GlobeHemisphereWest, num: '03', title: '40+ live & OTC markets', desc: 'Forex in session hours, plus OTC crypto, commodities & indices 24/7.' },
  { icon: DeviceMobile, num: '04', title: 'Trade from anywhere', desc: 'Fully responsive and lag-free on every device — no app install needed.' },
];

const Features = () => (
  <section id="features" className="py-16 sm:py-24" data-testid="features-section">
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Split header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="max-w-xl">
          <div className="lux-eyebrow">Platform Features</div>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-white">Built for serious binary traders</h2>
        </div>
        <p className="text-base lux-muted leading-relaxed max-w-md lg:text-right">
          Everything you need to pass your challenge and trade your funded account with confidence.
        </p>
      </div>

      {/* Bento row 1 */}
      <div className="mt-10 grid grid-cols-1 lg:grid-cols-6 gap-5">
        {/* Featured card */}
        <div className="lux-card relative overflow-hidden p-7 sm:p-9 lg:col-span-4" data-testid="feature-funded-account">
          <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[#14B877]/10 blur-3xl pointer-events-none" />
          <div className="flex items-start justify-between">
            <div className="lux-icon-orb h-14 w-14 rounded-2xl">
              <Vault size={28} weight="duotone" color="#14B877" />
            </div>
            <span className="lux-pill px-3 py-1 text-xs">
              <Timer size={14} weight="bold" /> Funded in under 24h
            </span>
          </div>
          <h3 className="mt-6 text-xl sm:text-2xl font-bold text-white">A real funded Quotex account — not a simulation</h3>
          <p className="mt-3 text-sm sm:text-base lux-muted leading-relaxed max-w-lg">
            Pass your challenge and we deposit real capital into a live Quotex account under your control. Trade it, grow it, and withdraw your profits on demand.
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            {CHIPS.map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs sm:text-sm text-white/85">
                <CheckCircle size={15} weight="fill" color="#14B877" /> {c}
              </span>
            ))}
          </div>
        </div>

        {/* Payout stat card */}
        <div className="lux-card-active relative overflow-hidden p-7 sm:p-8 lg:col-span-2 flex flex-col justify-between" data-testid="feature-high-payouts">
          <div>
            <div className="flex items-center justify-between">
              <span className="lux-eyebrow">High payouts</span>
              <ArrowUpRight size={18} weight="bold" color="#D4AF37" />
            </div>
            <div className="mt-4 text-5xl sm:text-6xl font-bold lux-gradient-text leading-none">95%</div>
            <p className="mt-3 text-sm lux-muted leading-relaxed">
              Trade high-payout binary markets and keep the profits from your funded account.
            </p>
          </div>
          <div className="mt-6 flex items-end gap-1.5 h-16" aria-hidden="true">
            {BARS.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-md bg-gradient-to-t from-[#0f9a63]/30 to-[#14B877]"
                style={{ height: `${h}%`, opacity: 0.45 + (i / BARS.length) * 0.55 }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Bento row 2 — compact cards */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {COMPACT.map((f) => (
          <div key={f.title} className="lux-card group p-6" data-testid={`feature-${f.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
            <div className="flex items-center justify-between">
              <div className="lux-icon-orb h-11 w-11 rounded-xl">
                <f.icon size={22} weight="duotone" color="#14B877" />
              </div>
              <span className="text-xs font-bold tracking-widest text-white/20 group-hover:text-[#14B877]/60 transition-colors">{f.num}</span>
            </div>
            <h4 className="mt-4 text-[15px] font-bold text-white">{f.title}</h4>
            <p className="mt-1.5 text-sm lux-muted leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default Features;
