import React from 'react';
import BrandLogo from '../BrandLogo';

/**
 * TradeSkeleton — boot placeholder for <DemoTrade/>.
 * Mirrors the real UI 1:1 at every breakpoint so the transition to the loaded
 * terminal never shifts layout. Only elements that exist in the real UI are
 * represented — no extra decorations. The chart canvas is a flat dark rectangle
 * with static diagonal-line texture (no animated candles/blur), matching the
 * user-supplied reference.
 */

const Block = ({ className = '' }) => (
  <div className={`bfg-skel rounded-lg ${className}`} />
);

// Sidebar rows: 6 nav items + logout at the bottom (matches SIDE_ITEMS + logout).
const SIDE_ROWS = 6;

// Bottom mobile-nav rows: 5 items (matches DemoTrade mobile nav).
const MOBILE_NAV_COUNT = 5;

const TradeSkeleton = () => {
  return (
    <div
      className="h-[100dvh] flex flex-col text-white bg-[#040D09] overflow-hidden"
      data-testid="trade-skeleton"
    >
      {/* ------- Header (52px) ------- */}
      <header className="shrink-0 flex items-center gap-2 sm:gap-3 px-2.5 sm:px-4 h-[52px] border-b border-white/[0.07] bg-[#050f0a]/95">
        {/* Desktop brand */}
        <div className="hidden md:flex shrink-0 items-center gap-2">
          <BrandLogo className="h-7 w-auto object-contain opacity-90" />
        </div>

        {/* Mobile market button placeholder (mirrors mobile-market-button) */}
        <div className="md:hidden shrink-0 flex items-center gap-2">
          <BrandLogo className="h-6 w-auto object-contain opacity-90" />
        </div>
        <Block className="md:hidden h-8 w-[128px]" />

        {/* Desktop divider */}
        <div className="hidden md:block h-6 w-px bg-white/[0.08] shrink-0" />

        {/* Desktop asset-tabs strip: 4 tab pills + "+" add button */}
        <div className="hidden md:flex flex-1 items-center gap-1.5 min-w-0 py-1 overflow-hidden">
          <Block className="h-9 w-[124px] shrink-0" />
          <Block className="h-9 w-[124px] shrink-0" />
          <Block className="h-9 w-[124px] shrink-0" />
          <Block className="h-9 w-[124px] shrink-0" />
          <Block className="h-9 w-9 shrink-0 rounded-xl" />
        </div>
        <div className="flex-1 md:hidden" />

        {/* Right cluster: balance + deposit (sm+) + avatar (md+) */}
        <div className="shrink-0 flex items-center gap-2 sm:gap-2.5">
          <Block className="h-9 w-[92px] sm:w-[108px]" />
          <Block className="hidden sm:block h-9 w-[118px]" />
          <Block className="hidden md:block h-8 w-8 rounded-full" />
        </div>
      </header>

      {/* ------- Body ------- */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar — desktop only */}
        <aside className="hidden md:flex w-[64px] shrink-0 flex-col items-center gap-2 border-r border-white/[0.07] bg-[#050f0a]/95 py-3">
          {Array.from({ length: SIDE_ROWS }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 w-14 py-1">
              <Block className="h-5 w-5 rounded-md" />
              <Block className="h-[6px] w-9 rounded-full" />
            </div>
          ))}
          <div className="flex-1" />
          <div className="flex flex-col items-center gap-1.5 w-14 py-1">
            <Block className="h-5 w-5 rounded-md" />
            <Block className="h-[6px] w-9 rounded-full" />
          </div>
        </aside>

        {/* Chart canvas — flat dark rectangle + static diagonal stripes only */}
        <main className="flex-1 relative min-w-0 bfg-chart-skel" />

        {/* Right TradePanel — desktop (lg+) only, mirrors TradePanel structure */}
        <aside className="hidden lg:flex w-[300px] shrink-0 flex-col gap-3 border-l border-white/[0.07] bg-[#050f0a]/95 p-3.5">
          {/* Instrument card */}
          <Block className="h-[62px] w-full" />
          {/* Investment stepper */}
          <Block className="h-[54px] w-full" />
          {/* Quick amount chips (4) */}
          <div className="grid grid-cols-4 gap-1.5 -mt-1">
            <Block className="h-7 w-full" />
            <Block className="h-7 w-full" />
            <Block className="h-7 w-full" />
            <Block className="h-7 w-full" />
          </div>
          {/* Duration picker */}
          <Block className="h-[54px] w-full" />
          {/* Payout preview */}
          <Block className="h-[92px] w-full" />
          {/* UP / DOWN buttons */}
          <Block className="h-[54px] w-full mt-1" />
          <Block className="h-[54px] w-full" />
        </aside>
      </div>

      {/* ------- Mobile bottom TradePanel (lg:hidden) ------- */}
      <div className="lg:hidden shrink-0 border-t border-white/[0.07] bg-[#050f0a]/95 px-3 pt-2 pb-2">
        {/* Investments + Expiration */}
        <div className="flex gap-2">
          <Block className="flex-1 h-[46px]" />
          <Block className="flex-1 h-[46px]" />
        </div>
        {/* Profit line */}
        <div className="flex items-center justify-between mt-1.5 px-0.5">
          <Block className="h-3 w-24" />
          <Block className="h-3 w-16" />
        </div>
        {/* DOWN / UP buttons */}
        <div className="flex gap-2 mt-1.5">
          <Block className="flex-1 h-12" />
          <Block className="flex-1 h-12" />
        </div>
      </div>

      {/* ------- Mobile bottom nav (md:hidden) ------- */}
      <nav className="md:hidden shrink-0 flex items-stretch border-t border-white/[0.07] bg-[#040D09] pb-[env(safe-area-inset-bottom)]">
        {Array.from({ length: MOBILE_NAV_COUNT }).map((_, i) => (
          <div key={i} className="flex-1 py-2 flex flex-col items-center gap-1">
            <Block className="h-[19px] w-[19px] rounded-md" />
            <Block className="h-[7px] w-10 rounded-full" />
          </div>
        ))}
      </nav>
    </div>
  );
};

export default TradeSkeleton;
