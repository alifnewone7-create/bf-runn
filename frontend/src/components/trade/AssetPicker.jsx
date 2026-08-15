import React, { useState } from 'react';
import { X, MagnifyingGlass } from '@phosphor-icons/react';
import { AssetIcon } from './AssetIcon';

const CATS = [
  ['currencies', 'Currencies'],
  ['crypto', 'Crypto'],
  ['commodities', 'Commodities'],
  ['stocks', 'Stocks'],
];

export default function AssetPicker({ open, onClose, instruments, quotes, onSelect }) {
  const [cat, setCat] = useState('currencies');
  const [q, setQ] = useState('');
  if (!open) return null;

  const list = instruments.filter((i) =>
    (q ? i.name.toLowerCase().includes(q.toLowerCase()) : i.category === cat)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" data-testid="asset-picker-modal">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full h-[100dvh] sm:h-auto sm:w-[560px] sm:max-h-[72vh] flex flex-col rounded-none sm:rounded-2xl border-0 sm:border border-white/[0.09] bg-[#071410]/97 backdrop-blur-xl shadow-[0_32px_80px_rgba(0,0,0,0.7)] tp-fade-up">
        <div className="flex items-center justify-between px-4 pt-4 pb-1">
          <h2 className="text-[16px] font-bold text-white tracking-tight">Select trade pair</h2>
          <button onClick={onClose} data-testid="asset-picker-close" className="h-9 w-9 flex items-center justify-center rounded-lg bg-white/[0.05] text-white/60 hover:text-white hover:bg-white/[0.1] transition-colors">
            <X size={17} />
          </button>
        </div>
        <div className="flex items-center gap-3 px-4 pt-2 pb-3">
          <div className="relative flex-1">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search assets…" data-testid="asset-picker-search"
                   className="w-full bg-black/30 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-[14px] text-white placeholder:text-white/35 focus:outline-none focus:border-[#14b877]/60 focus:ring-2 focus:ring-[#14b877]/15 transition-colors" />
          </div>
        </div>
        <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto scrollbar-none">
          {CATS.map(([id, label]) => (
            <button key={id} onClick={() => { setCat(id); setQ(''); }} data-testid={`asset-cat-${id}`}
                    className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap transition-colors ${cat === id && !q ? 'bg-[#14b877] text-[#03150d]' : 'bg-white/[0.05] text-white/60 hover:text-white hover:bg-white/[0.09]'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3">
          {list.map((ins) => {
            const price = quotes[ins.symbol] ?? ins.price;
            return (
              <button key={ins.symbol} onClick={() => { onSelect(ins.symbol); onClose(); }} data-testid={`asset-row-${ins.symbol}`}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.05] transition-colors text-left">
                <AssetIcon icon={ins.icon} size={26} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-semibold text-white truncate">{ins.name} (OTC)</span>
                  <span className={`inline-flex items-center px-1.5 rounded text-[11px] font-semibold tabular-nums ${ins.change_pct >= 0 ? 'text-[#14b877] bg-[#14b877]/[0.08]' : 'text-[#f43f5e] bg-[#f43f5e]/[0.08]'}`}>
                    {ins.change_pct >= 0 ? '+' : ''}{ins.change_pct}%
                  </span>
                </span>
                <span className="text-[13px] text-white/70 tabular-nums">{price?.toFixed(ins.digits)}</span>
                <span className="text-[13.5px] font-bold text-[#14b877] w-12 text-right tabular-nums" data-testid={`asset-payout-${ins.symbol}`}>{Number(ins.payout) > 0 ? `${ins.payout}%` : '—'}</span>
              </button>
            );
          })}
          {!list.length && <p className="text-center text-white/40 text-[13px] py-8">No assets found</p>}
        </div>
      </div>
    </div>
  );
}
