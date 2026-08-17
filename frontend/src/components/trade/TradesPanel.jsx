import React, { useEffect, useState } from 'react';
import { CaretUp, CaretDown, TrendUp, TrendDown, Pulse, Briefcase, ChartLineUp, Receipt, Tray, X } from '@phosphor-icons/react';
import { AssetIcon } from './AssetIcon';
import { fmtDur } from './TradePanel';

export default function TradesPanel({ openTrades, history, instMap }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('open');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!open && !openTrades.length) return;
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, [open, openTrades.length]);

  const remain = (t) => Math.max(0, Math.round((new Date(t.expiry_time).getTime() - now) / 1000));

  const emptyState = (msg) => (
    <div className="flex flex-col items-center justify-center py-8 px-6 text-center" data-testid="trades-empty-state">
      <div className="h-16 w-16 rounded-full bg-white/[0.06] border border-white/[0.07] flex items-center justify-center mb-3.5">
        <Tray size={28} weight="duotone" className="text-white/50" />
      </div>
      <p className="text-[13px] leading-relaxed text-white/45 max-w-[240px]">{msg}</p>
    </div>
  );

  const openRows = (
    <>
      {openTrades.length === 0 && emptyState('You don\u2019t have any open trades yet. You can open a trade using the form above.')}
      {openTrades.map((t) => (
        <div key={t.id} className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-white/[0.04] transition-colors" data-testid={`open-trade-${t.id}`}>
          <AssetIcon icon={instMap[t.symbol]?.icon} size={22} />
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] font-semibold text-white truncate">{t.name} (OTC)</span>
            <span className="block text-[11px] text-white/45 tabular-nums">@ {t.entry_price}</span>
          </span>
          {t.direction === 'higher'
            ? <TrendUp size={16} weight="bold" className="text-[#14b877]" />
            : <TrendDown size={16} weight="bold" className="text-[#f43f5e]" />}
          <span className="text-[13px] text-white/85 font-semibold tabular-nums">${t.amount}</span>
          <span className="text-[11.5px] font-bold text-amber-300 tabular-nums px-1.5 py-0.5 rounded-md bg-amber-300/10 border border-amber-300/20 min-w-[48px] text-center">{fmtDur(remain(t))}</span>
        </div>
      ))}
    </>
  );

  const historyRows = (
    <>
      {history.length === 0 && emptyState('You don\u2019t have a trade history yet. You can open a trade using the form above.')}
      {history.slice(0, 10).map((t) => (
        <div key={t.id} className="flex items-center gap-2.5 px-2 py-2 rounded-xl" data-testid={`closed-trade-${t.id}`}>
          <AssetIcon icon={instMap[t.symbol]?.icon} size={22} />
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] font-semibold text-white truncate">{t.name} (OTC)</span>
            <span className="block text-[11px] text-white/45 capitalize">${t.amount} · {t.direction}</span>
          </span>
          <span className={`text-[13px] font-bold tabular-nums ${t.status === 'won' ? 'text-[#14b877]' : t.status === 'tie' ? 'text-white/60' : 'text-[#f43f5e]'}`}>
            {t.status === 'won' ? `+$${t.profit?.toFixed(2)}` : t.status === 'tie' ? '$0.00' : `-$${t.amount.toFixed(2)}`}
          </span>
        </div>
      ))}
    </>
  );

  return (
    <>
      {/* Desktop — floating pill bottom-left */}
      <div className="hidden md:block absolute bottom-3 left-3 z-20" data-testid="trades-panel">
        {open && (
          <div className="mb-2 w-[300px] sm:w-[350px] max-h-[46vh] overflow-y-auto rounded-2xl border border-white/[0.09] bg-[#050f0a]/92 backdrop-blur-xl shadow-[0_24px_60px_rgba(0,0,0,0.6)] p-2 tp-fade-up">
            <div className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] uppercase tracking-[0.16em] text-white/40 font-semibold">
              <Pulse size={12} weight="bold" className="text-[#14b877]" /> Open trades
            </div>
            {openRows}
            <div className="px-2 py-1.5 mt-1 text-[10px] uppercase tracking-[0.16em] text-white/40 font-semibold border-t border-white/[0.07] pt-2.5">Recent results</div>
            {historyRows}
          </div>
        )}
        <button onClick={() => setOpen(!open)} data-testid="open-trades-toggle"
                className="flex items-center gap-2 rounded-xl border border-white/[0.09] bg-[#050f0a]/85 backdrop-blur-xl px-4 py-2.5 text-[13px] font-semibold text-white hover:border-[#14b877]/30 hover:bg-white/[0.04] transition-colors shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
          Trades
          <span className={`min-w-[20px] h-5 px-1 inline-flex items-center justify-center rounded-full text-[11px] font-bold tabular-nums ${openTrades.length ? 'bg-[#14b877] text-[#03150d]' : 'bg-white/10 text-white/60'}`} data-testid="open-trades-count">
            {openTrades.length}
          </span>
          {open ? <CaretDown size={13} /> : <CaretUp size={13} />}
        </button>
      </div>

      {/* Mobile — briefcase button under the chart tool rail */}
      <button onClick={() => setOpen(true)} data-testid="mobile-trades-button"
              className="md:hidden absolute top-[56px] left-2 z-10 h-10 w-10 rounded-xl bg-[#050f0a]/85 backdrop-blur-md border border-white/[0.09] flex items-center justify-center text-white/70 active:bg-white/[0.08] transition-colors shadow-[0_6px_20px_rgba(0,0,0,0.3)]">
        <Briefcase size={18} weight="duotone" />
        <span className={`absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] px-0.5 inline-flex items-center justify-center rounded-full text-[10px] font-bold tabular-nums border border-[#040D09] ${openTrades.length ? 'bg-[#14b877] text-[#03150d]' : 'bg-white/15 text-white/70'}`} data-testid="mobile-trades-count">
          {openTrades.length}
        </span>
      </button>

      {/* Mobile — bottom sheet */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end" data-testid="mobile-trades-sheet">
          <div className="flex-1 bg-black/50 backdrop-blur-[3px]" onClick={() => setOpen(false)} />
          <div className="bg-gradient-to-b from-[#071410] to-[#040D09] border-t border-white/[0.09] rounded-t-2xl max-h-[70vh] flex flex-col pb-[env(safe-area-inset-bottom)] tp-fade-up">
            <div className="flex items-center gap-1.5 px-2.5 pt-2.5 pb-1.5 border-b border-white/[0.07]">
              {[
                { key: 'open', label: 'Open trades', Icon: ChartLineUp, count: openTrades.length },
                { key: 'history', label: 'Recent trades', Icon: Receipt, count: history.length },
              ].map(({ key, label, Icon, count }) => {
                const active = tab === key;
                return (
                  <button key={key} onClick={() => setTab(key)} data-testid={`mobile-trades-tab-${key}`}
                          className={`flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl transition-colors ${active ? 'bg-[#14b877]/12 text-white' : 'text-white/45 active:bg-white/[0.05]'}`}>
                    <Icon size={18} weight="duotone" className={active ? 'text-[#14b877]' : ''} />
                    {active && <span className="text-[13px] font-bold tracking-tight">{label}</span>}
                    <span className={`min-w-[19px] h-[19px] px-1 inline-flex items-center justify-center rounded-full text-[10.5px] font-bold tabular-nums ${active && count ? 'bg-[#14b877] text-[#03150d]' : 'bg-white/10 text-white/60'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
              <button onClick={() => setOpen(false)} data-testid="mobile-trades-close"
                      className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg bg-white/[0.05] text-white/60 active:bg-white/[0.1]">
                <X size={15} />
              </button>
            </div>
            <div className="overflow-y-auto px-2 py-2.5 min-h-[240px]">
              {tab === 'open' ? openRows : historyRows}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
