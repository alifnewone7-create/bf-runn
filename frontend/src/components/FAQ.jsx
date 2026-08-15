import React, { useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import { FAQS } from '../mock/mock';

const FAQ = () => {
  const [openIdx, setOpenIdx] = useState(0);
  return (
    <section id="faq" className="py-20 sm:py-28" data-testid="faq-section">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="lux-eyebrow">FAQ</div>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-white">Frequently asked questions</h2>
        </div>

        <div className="mt-12 lux-card divide-y divide-white/5 overflow-hidden">
          {FAQS.map((f, i) => (
            <div key={f.q}>
              <button onClick={() => setOpenIdx(openIdx === i ? -1 : i)}
                      data-testid={`faq-question-${i}`}
                      className="w-full flex items-center justify-between gap-4 text-left px-6 sm:px-8 py-5 hover:bg-white/[0.02] transition-colors">
                <span className="text-[15px] font-semibold text-white">{f.q}</span>
                <CaretDown size={18} weight="bold" color="#14B877"
                           className={`shrink-0 transition-transform duration-300 ${openIdx === i ? 'rotate-180' : ''}`} />
              </button>
              <div className={`grid transition-all duration-300 ${openIdx === i ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden">
                  <p className="px-6 sm:px-8 pb-6 text-sm lux-muted leading-relaxed" data-testid={`faq-answer-${i}`}>{f.a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQ;
