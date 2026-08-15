import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from '@phosphor-icons/react';
import { challengePath } from '../lib/auth';

const CTA = () => {
  const navigate = useNavigate();
  return (
    <section className="py-20 sm:py-24" data-testid="cta-section">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[28px] px-6 sm:px-14 py-14 sm:py-18 text-center border border-[#14B877]/30"
             style={{ background: 'linear-gradient(140deg, rgba(20,184,119,0.18) 0%, #0D1E18 45%, #040D09 100%)' }}>
          <div className="absolute inset-0 lux-grid-bg pointer-events-none" />
          <div className="relative">
            <div className="lux-eyebrow">Ready to get funded?</div>
            <h2 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white max-w-2xl mx-auto leading-tight">
              Your funded Quotex account is <span className="lux-gradient-text">one challenge away</span>
            </h2>
            <p className="mt-5 text-base lux-muted max-w-xl mx-auto">
              Start from just $25. Pass your challenge and get real balance deposited — up to $3,000.
            </p>
            <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3.5">
              <button onClick={() => navigate(challengePath())} data-testid="cta-start-btn"
                      className="lux-btn-primary w-full sm:w-auto px-9 py-3.5 rounded-xl inline-flex items-center justify-center gap-2 text-[15px]">
                Start Your Challenge <ArrowRight size={17} weight="bold" />
              </button>
              <a href="#challenges" data-testid="cta-view-plans-btn"
                 className="lux-btn-ghost w-full sm:w-auto px-9 py-3.5 rounded-xl inline-flex items-center justify-center text-[15px]">
                View Plans
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTA;
