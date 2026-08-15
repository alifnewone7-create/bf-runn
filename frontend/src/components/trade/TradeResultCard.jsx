import React from 'react';
import { X } from '@phosphor-icons/react';

/**
 * TradeResultCard — minimal "RESULT (P/L)" bubble shown on the chart the moment
 * a trade settles.
 *
 * Deliberately tiny: just the label and the P/L amount, a dismiss button and a
 * small arrow that points back at the candle the trade closed on.
 */
const THEME = {
  won: {
    fill: 'linear-gradient(135deg,#2fd98f 0%,#17b077 55%,#0e8f5f 100%)',
    edge: '#17b077',
    ring: 'rgba(23,176,119,0.45)',
    glow: '0 8px 22px -8px rgba(15,143,95,0.85)',
  },
  lost: {
    fill: 'linear-gradient(135deg,#ff8091 0%,#f4576b 55%,#dd3a52 100%)',
    edge: '#f4576b',
    ring: 'rgba(244,87,107,0.45)',
    glow: '0 8px 22px -8px rgba(221,58,82,0.85)',
  },
  tie: {
    fill: 'linear-gradient(135deg,#a8b4c4 0%,#8994a5 55%,#6c7686 100%)',
    edge: '#8994a5',
    ring: 'rgba(137,148,165,0.45)',
    glow: '0 8px 22px -8px rgba(108,118,134,0.8)',
  },
};

const money = (v) => {
  const n = Number(v) || 0;
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
};

const TradeResultCard = React.forwardRef(({ trade, onClose, ttl = 9000 }, ref) => {
  const status = THEME[trade.status] ? trade.status : 'tie';
  const t = THEME[status];

  return (
    <div
      ref={ref}
      data-testid={`trade-result-${trade.id}`}
      data-status={status}
      className="absolute z-[30] pointer-events-auto select-none"
      style={{ left: 0, top: 0, visibility: 'hidden', transform: 'translateY(-50%)' }}
    >
      <div className="relative bfg-result-pop">
        <div
          className="relative overflow-hidden rounded-[9px] pl-2.5 pr-6 py-[5px] sm:pl-3 sm:pr-7 sm:py-1.5"
          style={{ background: t.fill, boxShadow: `${t.glow}, inset 0 1px 0 rgba(255,255,255,0.28)` }}
        >
          <div className="text-[7.5px] sm:text-[8.5px] font-bold tracking-[0.16em] text-white/75 leading-none">
            RESULT&nbsp;(P/L)
          </div>
          <div
            className="mt-[3px] text-[12.5px] sm:text-[14.5px] font-extrabold tabular-nums tracking-tight text-white leading-none"
            data-testid={`trade-result-amount-${trade.id}`}
          >
            {money(trade.profit)}
          </div>

          <button
            type="button"
            onClick={() => onClose(trade.id)}
            data-testid={`trade-result-close-${trade.id}`}
            aria-label="Dismiss result"
            className="absolute top-[3px] right-[3px] h-[16px] w-[16px] flex items-center justify-center rounded-[5px] text-white/70 hover:text-white hover:bg-black/20 active:scale-95 transition-[color,background-color,transform] duration-150"
          >
            <X size={10} weight="bold" />
          </button>

          {/* auto-dismiss countdown hairline */}
          <span
            className="absolute bottom-0 left-0 h-[2px] bg-black/25 bfg-result-timer"
            style={{ animationDuration: `${ttl}ms` }}
          />
        </div>

        {/* little arrow pointing back at the candle */}
        <span
          className="absolute top-1/2 -right-[5px] h-0 w-0"
          style={{
            transform: 'translateY(-50%)',
            borderTop: '5px solid transparent',
            borderBottom: '5px solid transparent',
            borderLeft: `6px solid ${t.edge}`,
          }}
        />
      </div>
    </div>
  );
});

TradeResultCard.displayName = 'TradeResultCard';

export default TradeResultCard;
