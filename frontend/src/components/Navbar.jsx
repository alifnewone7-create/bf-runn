import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, X, ArrowRight } from 'lucide-react';
import { NAV_LINKS } from '../mock/mock';
import BrandLogo from './BrandLogo';
import { challengePath } from '../lib/auth';

const Logo = ({ onClick }) => (
  <Link to="/" onClick={onClick} className="flex items-center gap-2.5 shrink-0">
    <BrandLogo className="h-8 w-auto lg:h-9 object-contain" />
    <span className="font-bold text-[16px] lg:text-[17px] tracking-tight text-white leading-none">
      Binary Fund <span className="bfg-green-text">Global</span>
    </span>
  </Link>
);

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <header className="fixed top-0 inset-x-0 z-50 px-3 sm:px-6 lg:px-8 pt-3 sm:pt-4">
      <nav className={`max-w-6xl mx-auto pl-4 pr-3 sm:pl-6 sm:pr-3.5 h-[58px] lg:h-[68px] flex items-center justify-between rounded-2xl backdrop-blur-xl transition-all duration-300`}
           style={{
             background: scrolled
               ? 'linear-gradient(180deg, rgba(18,44,33,0.94) 0%, rgba(4,13,9,0.94) 100%)'
               : 'linear-gradient(180deg, rgba(18,44,33,0.72) 0%, rgba(6,16,12,0.62) 100%)',
             border: '1px solid rgba(20,184,119,0.14)',
             boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)'
           }}>
        <Logo />

        {/* Center links */}
        <div className="hidden lg:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href}
               className="text-[14.5px] text-white/70 hover:text-white font-medium px-4 py-2.5 rounded-lg hover:bg-white/[0.07] transition-colors">
              {l.label}
            </a>
          ))}
        </div>

        {/* Right actions */}
        <div className="hidden lg:flex items-center gap-2">
          <button onClick={() => navigate(challengePath())}
                  className="bfg-btn-primary text-[14.5px] px-6 py-3 rounded-xl inline-flex items-center gap-1.5">
            Start Challenge <ArrowRight size={16} />
          </button>
        </div>

        {/* Mobile toggle */}
        <button className="lg:hidden h-10 w-10 -mr-1 flex items-center justify-center rounded-lg text-white hover:bg-white/[0.07] transition-colors"
                onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {/* Mobile menu */}
      <div className={`lg:hidden fixed inset-0 top-0 z-40 transition-opacity duration-300 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
        <div className={`absolute top-20 inset-x-3 sm:inset-x-6 rounded-3xl bg-[#0c1613] border border-white/12 shadow-2xl p-5 transition-all duration-300 ${open ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'}`}>
          <div className="space-y-1">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)}
                 className="flex items-center justify-between px-4 py-3.5 rounded-2xl text-white/85 text-[15px] font-medium hover:bg-white/[0.06] transition-colors">
                {l.label}
                <ArrowRight size={16} className="text-white/30" />
              </a>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-1 gap-2.5">
            <button onClick={() => { setOpen(false); navigate(challengePath()); }}
                    className="bfg-btn-primary w-full py-3 rounded-xl inline-flex items-center justify-center gap-2">
              Start Challenge <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
