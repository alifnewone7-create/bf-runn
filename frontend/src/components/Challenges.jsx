import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, ArrowRight } from '@phosphor-icons/react';
import { CHALLENGES, CHALLENGE_HIGHLIGHTS } from '../mock/mock';
import { isLoggedIn } from '../lib/auth';

const ChallengeCard = ({ c }) => {
  const navigate = useNavigate();
  return (
    <div className={`relative p-7 lg:p-8 flex flex-col ${c.popular ? 'lux-card-active lg:scale-[1.04] lg:-my-2' : 'lux-card'}`}
         data-testid={`challenge-card-${c.id}`}>
      {c.popular && (
        <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] text-[#04150d] border border-[#F4D67A]/40"
              style={{
                background: 'linear-gradient(120deg, #14B877 0%, #6FE0B0 30%, #F4D67A 62%, #D4AF37 100%)',
                boxShadow: '0 8px 22px -8px rgba(212,175,55,0.55), 0 0 0 1px rgba(212,175,55,0.25) inset'
              }} data-testid="most-popular-badge">
          Most Popular
        </span>
      )}
      <div className="flex items-center gap-3">
        <div className="lux-icon-orb h-11 w-11 rounded-xl">
          <c.icon size={22} weight="duotone" color={c.popular ? '#D4AF37' : '#14B877'} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white leading-tight">{c.name}</h3>
          <p className="text-xs lux-muted">{c.tagline}</p>
        </div>
      </div>

      <div className="mt-6 flex items-end gap-2">
        <span className="text-4xl font-extrabold font-display text-white">{c.funded}</span>
        <span className="text-sm lux-muted pb-1.5">funded account</span>
      </div>
      <div className="mt-2 text-sm">
        <span className="lux-muted">One-time fee </span>
        <span className="font-bold lux-green">{c.fee}</span>
      </div>

      <div className="mt-5 rounded-2xl px-4 py-3.5 border border-[#14B877]/25"
           style={{ background: 'linear-gradient(120deg, rgba(20,184,119,0.12), rgba(212,175,55,0.06))' }}>
        <div className="text-[11px] uppercase tracking-[0.16em] font-bold lux-muted">On passing you get</div>
        <div className="mt-0.5 text-xl font-bold text-white">{c.quotex} <span className="text-sm font-semibold lux-green">real Quotex balance</span></div>
      </div>

      <ul className="mt-6 space-y-3 flex-1">
        {c.rules.map((r) => (
          <li key={r.label} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2.5 lux-muted">
              <CheckCircle size={17} weight="duotone" color="#14B877" /> {r.label}
            </span>
            <span className="font-semibold text-white">{r.value}</span>
          </li>
        ))}
      </ul>

      <button onClick={() => navigate(isLoggedIn() ? '/challenges' : `/registration?plan=${c.id}`)}
              data-testid={`challenge-buy-btn-${c.id}`}
              className={`mt-7 w-full py-3.5 rounded-xl inline-flex items-center justify-center gap-2 text-[14.5px] ${c.popular ? 'lux-btn-primary' : 'lux-btn-ghost'}`}>
        Get {c.name} — {c.fee} <ArrowRight size={16} weight="bold" />
      </button>
    </div>
  );
};

const Challenges = () => (
  <section id="challenges" className="pt-10 pb-20 sm:pt-14 sm:pb-28 relative" data-testid="challenges-section">
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-2xl mx-auto">
        <div className="lux-eyebrow">Challenge Plans</div>
        <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-white">Choose your funding level</h2>
        <p className="mt-4 text-base lux-muted leading-relaxed">
          Every plan is a one-time fee. Pass the rules, and we deposit real balance into your live Quotex account.
        </p>
      </div>

      <div className="mt-14 grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-7 items-stretch">
        {CHALLENGES.map((c) => <ChallengeCard key={c.id} c={c} />)}
      </div>

      <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {CHALLENGE_HIGHLIGHTS.map((h) => (
          <div key={h.title} className="lux-card p-5 flex items-start gap-3.5" data-testid={`highlight-${h.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
            <div className="lux-icon-orb h-10 w-10 rounded-xl shrink-0">
              <h.icon size={20} weight="duotone" color="#14B877" />
            </div>
            <div>
              <div className="text-[14px] font-bold text-white">{h.title}</div>
              <p className="mt-1 text-[12.5px] lux-muted leading-relaxed">{h.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default Challenges;
