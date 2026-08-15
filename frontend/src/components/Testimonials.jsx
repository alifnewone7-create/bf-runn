import React from 'react';
import { Star, Quotes } from '@phosphor-icons/react';
import { TESTIMONIALS } from '../mock/mock';

const Testimonials = () => (
  <section className="py-20 sm:py-28 border-y border-white/5 bg-white/[0.015]" data-testid="testimonials-section">
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-2xl mx-auto">
        <div className="lux-eyebrow">Funded Traders</div>
        <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-white">Traders we've already funded</h2>
      </div>

      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        {TESTIMONIALS.map((t) => (
          <div key={t.name} className="lux-card p-7 flex flex-col" data-testid={`testimonial-${t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
            <Quotes size={28} weight="duotone" color="#14B877" />
            <p className="mt-4 text-[14.5px] text-white/85 leading-relaxed flex-1">"{t.quote}"</p>
            <div className="mt-6 flex items-center gap-0.5">
              {[...Array(5)].map((_, i) => <Star key={i} size={15} weight="fill" color="#D4AF37" />)}
            </div>
            <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-3">
              <img src={t.avatar} alt={t.name} className="h-11 w-11 rounded-full object-cover border border-[#14B877]/30" />
              <div>
                <div className="text-[14px] font-bold text-white">{t.name} <span className="text-xs font-medium lux-muted">· {t.country}</span></div>
                <div className="text-xs lux-green font-semibold">{t.role}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default Testimonials;
