import React from 'react';
import { Link } from 'react-router-dom';
import { BRAND, FOOTER_LINKS } from '../mock/mock';
import BrandLogo from './BrandLogo';

const Footer = () => (
  <footer className="border-t border-white/5 pt-14 pb-8" data-testid="footer">
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-10">
        <div className="md:col-span-2">
          <Link to="/" className="flex items-center gap-2.5" data-testid="footer-logo">
            <BrandLogo className="h-9 w-auto object-contain" />
            <span className="font-bold text-[16px] text-white">Binary Fund <span className="lux-green">Global</span></span>
          </Link>
          <p className="mt-4 text-sm lux-muted leading-relaxed max-w-sm">{BRAND.tagline}</p>
        </div>
        {Object.entries(FOOTER_LINKS).map(([group, links]) => (
          <div key={group}>
            <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-white/60">{group}</div>
            <ul className="mt-4 space-y-2.5">
              {links.map((l) => (
                <li key={l}>
                  <a href="#" className="text-sm lux-muted hover:text-white transition-colors" data-testid={`footer-link-${l.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>{l}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-12 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-xs lux-muted">© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</p>
        <p className="text-xs text-white/30">Trading involves risk. Only the challenge fee is at risk.</p>
      </div>
    </div>
  </footer>
);

export default Footer;
