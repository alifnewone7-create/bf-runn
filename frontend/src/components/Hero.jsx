import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Play } from '@phosphor-icons/react';
import { BRAND, HERO_STATS, IMAGES } from '../mock/mock';
import { challengePath } from '../lib/auth';

const Hero = () => {
  const navigate = useNavigate();
  return (
    <section className="relative overflow-hidden pt-24 sm:pt-28 pb-20 sm:pb-28" data-testid="hero-section">
      <div className="absolute inset-0 pointer-events-none">
        <img src={IMAGES.heroBg} alt="" className="w-full h-full object-cover opacity-[0.14]" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(4,13,9,0.4) 0%, rgba(4,13,9,0.85) 70%, #040D09 100%)' }} />
        <div className="absolute inset-0 lux-grid-bg" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.08] max-w-4xl mx-auto lux-fade-up" style={{ animationDelay: '0.08s' }}>
          Pass the Challenge.<br />
          <span className="lux-gradient-text">Trade Our Capital.</span>
        </h1>

        <p className="mt-6 text-base md:text-lg lux-muted max-w-2xl mx-auto leading-relaxed lux-fade-up" style={{ animationDelay: '0.16s' }}>
          {BRAND.name} funds disciplined traders with a real Quotex account.
          One-time fee, transparent rules, and real balance deposited when you pass — up to $3,000.
        </p>

        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3.5 lux-fade-up" style={{ animationDelay: '0.24s' }}>
          <button onClick={() => navigate(challengePath())} data-testid="hero-start-challenge-btn"
                  className="lux-btn-primary w-full sm:w-auto px-8 py-3.5 rounded-xl inline-flex items-center justify-center gap-2 text-[15px]">
            Start Your Challenge <ArrowRight size={17} weight="bold" />
          </button>
          <a href="#how-it-works" data-testid="hero-how-it-works-btn"
             className="lux-btn-ghost w-full sm:w-auto px-8 py-3.5 rounded-xl inline-flex items-center justify-center gap-2 text-[15px]">
            <Play size={15} weight="duotone" /> How It Works
          </a>
        </div>

        <div className="mt-16 sm:mt-20 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto lux-fade-up" style={{ animationDelay: '0.32s' }}>
          {HERO_STATS.map((s) => (
            <div key={s.label} className="lux-card px-4 py-5 sm:py-6" data-testid={`hero-stat-${s.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
              <div className="text-2xl sm:text-3xl font-bold lux-green font-display">{s.value}</div>
              <div className="mt-1 text-xs sm:text-[13px] lux-muted font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Hero;
