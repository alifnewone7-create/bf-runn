import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from '@phosphor-icons/react';
import { QUOTEX_STEPS, IMAGES } from '../mock/mock';
import { challengePath } from '../lib/auth';

const QuotexSection = () => {
  const navigate = useNavigate();
  return (
    <section id="quotex" className="py-20 sm:py-28 border-y border-white/5 bg-white/[0.015]" data-testid="quotex-section">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div>
          <div className="lux-eyebrow">Quotex Payout</div>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-white">Real money. Real Quotex account.</h2>
          <p className="mt-4 text-base lux-muted leading-relaxed">
            Unlike demo-based prop firms, we deposit real balance into a live Quotex account that belongs to you.
            Trade it and withdraw your profits directly.
          </p>

          <div className="mt-9 space-y-0">
            {QUOTEX_STEPS.map((s, i) => (
              <div key={s.title} className="flex gap-4" data-testid={`quotex-step-${i + 1}`}>
                <div className="flex flex-col items-center">
                  <div className="lux-icon-orb h-11 w-11 rounded-xl shrink-0">
                    <s.icon size={22} weight="duotone" color="#14B877" />
                  </div>
                  {i < QUOTEX_STEPS.length - 1 && <div className="w-px flex-1 my-1.5 bg-gradient-to-b from-[#14B877]/35 to-transparent" />}
                </div>
                <div className="pb-8">
                  <div className="text-[15px] font-bold text-white pt-2">{s.title}</div>
                  <p className="mt-1 text-sm lux-muted leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <button onClick={() => navigate(challengePath())} data-testid="quotex-cta-btn"
                  className="lux-btn-primary px-7 py-3 rounded-xl inline-flex items-center gap-2 text-[14.5px]">
            Get Funded Now <ArrowRight size={16} weight="bold" />
          </button>
        </div>

        <div className="relative">
          <div className="lux-card p-2.5 overflow-hidden lux-float">
            <img src={IMAGES.tradingDesk} alt="Live trading desk" className="rounded-2xl w-full h-[340px] sm:h-[420px] object-cover" />
            <div className="absolute inset-2.5 rounded-2xl" style={{ background: 'linear-gradient(180deg, transparent 45%, rgba(4,13,9,0.9) 100%)' }} />
            <div className="absolute bottom-8 left-8 right-8">
              <div className="text-[11px] uppercase tracking-[0.18em] font-bold lux-green">Live funded account</div>
              <div className="mt-1 text-3xl font-extrabold font-display text-white">$3,000.00</div>
              <div className="mt-0.5 text-sm lux-muted">Deposited on Quotex · Premium plan</div>
            </div>
          </div>
          <div className="absolute -top-4 -right-3 sm:-right-5 lux-glass rounded-2xl px-5 py-3.5 border border-[#14B877]/30" data-testid="quotex-payout-chip">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] lux-muted">Payout rate</div>
            <div className="text-xl font-extrabold lux-green">98%</div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default QuotexSection;
