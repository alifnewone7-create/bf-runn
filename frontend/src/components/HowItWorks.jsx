import React from 'react';
import { HOW_IT_WORKS } from '../mock/mock';

const HowItWorks = () => (
  <section id="how-it-works" className="pt-20 pb-10 sm:pt-28 sm:pb-14 border-t border-white/10" data-testid="how-it-works-section">
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl">
        <div className="lux-eyebrow">The Process</div>
        <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-white">Funded in three simple steps</h2>
        <p className="mt-4 text-base lux-muted leading-relaxed">
          No subscriptions, no hidden conditions. Prove your skill once and trade real capital on Quotex.
        </p>
      </div>

      <div className="mt-12 relative grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-7">
        <div className="hidden md:block absolute top-[52px] left-[18%] right-[18%] border-t border-dashed border-[#1A2F24]" />
        {HOW_IT_WORKS.map((s) => (
          <div key={s.step} className="lux-card relative p-7 lg:p-8" data-testid={`how-step-${s.step}`}>
            <div className="flex items-start justify-between">
              <div className="lux-icon-orb h-14 w-14">
                <s.icon size={28} weight="duotone" color="#14B877" />
              </div>
              <span className="text-[44px] leading-none font-extrabold font-display text-white/[0.07] select-none">0{s.step}</span>
            </div>
            <h3 className="mt-6 text-lg font-bold text-white">{s.title}</h3>
            <p className="mt-2.5 text-sm lux-muted leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default HowItWorks;
