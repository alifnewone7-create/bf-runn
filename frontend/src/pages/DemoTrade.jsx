import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import { Unpackr } from 'msgpackr';
import { Plus, X, SignOut, ChartPieSlice, ClockCounterClockwise, Question, GearSix, Download, User as UserIcon, CaretDown, ChartLineUp, Flask, Atom, Crown, SketchLogo, Trophy } from '@phosphor-icons/react';
import { useToast } from '../hooks/use-toast';
import { AssetIcon } from '../components/trade/AssetIcon';
import AssetPicker from '../components/trade/AssetPicker';
import TradeChart from '../components/trade/TradeChart';
import TradePanel from '../components/trade/TradePanel';
import TradesPanel from '../components/trade/TradesPanel';
import AccountSwitcher from '../components/trade/AccountSwitcher';
import TradeSkeleton from '../components/trade/TradeSkeleton';
import BrandLogo from '../components/BrandLogo';

import { API_BASE as API } from '../lib/apiBase';
import sfx from '../lib/sfx';
const unpackr = new Unpackr({ mapsAsObjects: true });
const DEFAULT_TABS = ['EURUSD_OTC', 'GBPUSD_OTC', 'USDJPY_OTC', 'EURAUD_OTC'];

const SIDE_ITEMS = [
  [ChartPieSlice, 'Portfolio', '/dashboard'],
  [Trophy, 'Challenges', '/challenges'],
  [UserIcon, 'Profile', '/profile'],
  [Question, 'Help', null],
  [GearSix, 'Settings', null],
];

const ACCOUNT_BADGES = {
  demo: {
    label: 'DEMO', icon: Flask,
    ring: 'border-amber-400/25 hover:border-amber-400/50',
    wrap: 'bg-gradient-to-br from-amber-400 to-orange-500 text-[#1a1204] shadow-[0_2px_10px_rgba(251,191,36,0.35)]',
    text: 'text-amber-300/90',
  },
  basic: {
    label: 'BASIC', icon: Atom,
    ring: 'border-sky-400/25 hover:border-sky-400/50',
    wrap: 'bg-gradient-to-br from-sky-400 to-blue-600 text-[#04121f] shadow-[0_2px_10px_rgba(56,189,248,0.35)]',
    text: 'text-sky-300/90',
  },
  standard: {
    label: 'STANDARD', icon: Crown,
    ring: 'border-violet-400/25 hover:border-violet-400/50',
    wrap: 'bg-gradient-to-br from-violet-400 to-purple-600 text-[#150726] shadow-[0_2px_10px_rgba(167,139,250,0.35)]',
    text: 'text-violet-300/90',
  },
  premium: {
    label: 'PREMIUM', icon: SketchLogo,
    ring: 'border-[#D4AF37]/30 hover:border-[#D4AF37]/60',
    wrap: 'bg-gradient-to-br from-[#F4D67A] to-[#B8860B] text-[#1c1403] shadow-[0_2px_10px_rgba(212,175,55,0.4)]',
    text: 'text-[#F4D67A]/90',
  },
};

export default function DemoTrade() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [instruments, setInstruments] = useState([]);
  // Admin payout table kept SEPARATE from the instruments list. Merging it into
  // `instruments` raced with the HTTP /instruments response (socket table could
  // land first and be thrown away), which is what showed 0%. Last known table is
  // cached so a returning user sees the real payout instantly.
  const [payouts, setPayouts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bfg_payouts') || '{}'); } catch { return {}; }
  });
  const [tabs, setTabs] = useState(() => JSON.parse(localStorage.getItem('bfg_trade_tabs') || 'null') || DEFAULT_TABS);
  const [active, setActive] = useState(() => localStorage.getItem('bfg_trade_active') || DEFAULT_TABS[0]);
  const [balance, setBalance] = useState(null);
  const [accountKey, setAccountKey] = useState('demo');
  const [quotes, setQuotes] = useState({});
  const [lastTick, setLastTick] = useState(null);
  const [openTrades, setOpenTrades] = useState([]);
  const [history, setHistory] = useState([]);
  const [amount, setAmount] = useState(1);
  const [duration, setDuration] = useState(60);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [hoverDir, setHoverDir] = useState(null);
  // Settled trades waiting to be shown as a RESULT (P/L) card on the chart.
  const [results, setResults] = useState([]);
  const wsRef = useRef(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  const token = localStorage.getItem('bfg_token');
  const authH = { headers: { Authorization: `Bearer ${token}` } };

  const RESULT_TTL = 9000; // how long a result card stays on the chart

  // Ids already surfaced as a result card — stops the WS event and the polling
  // fallback from showing the same settlement twice.
  const shownResultsRef = useRef(new Set());
  const historyBootedRef = useRef(false);

  const pushResult = useCallback((trade) => {
    if (!trade || !trade.id || shownResultsRef.current.has(trade.id)) return;
    shownResultsRef.current.add(trade.id);
    // Desktop-only outcome cue (no-op on phones/tablets).
    if (trade.status === 'won') sfx.win();
    else if (trade.status === 'lost') sfx.lose();
    setResults((r) => [...r, { ...trade, shownAt: Date.now() }].slice(-4));
  }, []);
  const dismissResult = useCallback((id) => setResults((r) => r.filter((x) => x.id !== id)), []);

  // Auto-dismiss expired result cards.
  useEffect(() => {
    if (!results.length) return undefined;
    const i = setInterval(() => {
      const now = Date.now();
      setResults((r) => r.filter((x) => now - x.shownAt < RESULT_TTL));
    }, 500);
    return () => clearInterval(i);
  }, [results.length]);

  // Browsers gate Web Audio behind a gesture — unlock on the first interaction.
  useEffect(() => {
    const on = () => sfx.unlockAudio();
    window.addEventListener('pointerdown', on, { once: true });
    window.addEventListener('keydown', on, { once: true });
    return () => {
      window.removeEventListener('pointerdown', on);
      window.removeEventListener('keydown', on);
    };
  }, []);

  useEffect(() => { localStorage.setItem('bfg_trade_tabs', JSON.stringify(tabs)); }, [tabs]);
  useEffect(() => { localStorage.setItem('bfg_trade_active', active); }, [active]);

  // Lock the whole page against pull-to-refresh / rubber-band overscroll on mobile,
  // so pulling the chart area down doesn't reveal a strip of body/browser below.
  useEffect(() => {
    const prevBodyOverscroll = document.body.style.overscrollBehavior;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overscrollBehavior = prevBodyOverscroll;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, []);

  const refreshTrades = useCallback(() => {
    axios.get(`${API}/api/trade/open`, authH).then(({ data }) => setOpenTrades(data)).catch(() => {});
    axios.get(`${API}/api/trade/history`, authH).then(({ data }) => {
      setHistory(data);
      // Fallback for a missed socket close event: surface freshly settled trades.
      if (!historyBootedRef.current) {
        historyBootedRef.current = true;
        (data || []).forEach((t) => shownResultsRef.current.add(t.id));
        return;
      }
      const now = Date.now();
      (data || []).forEach((t) => {
        const at = new Date(t.closed_at || t.expiry_time || 0).getTime();
        if (now - at < 20000) pushResult(t);
      });
    }).catch(() => {});
  }, [pushResult]); // eslint-disable-line

  useEffect(() => {
    if (!token) { navigate('/login', { replace: true }); return; }
    axios.get(`${API}/api/auth/me`, authH).then(({ data }) => {
      setUser(data);
      setAccountKey(data.active_account || 'demo');
    }).catch(() => { localStorage.removeItem('bfg_token'); navigate('/login', { replace: true }); });
    axios.get(`${API}/api/market/instruments`).then(({ data }) => setInstruments(data));
    axios.get(`${API}/api/wallet`, authH).then(({ data }) => {
      setBalance(data.balance);
      if (data.type) setAccountKey(data.type);
    }).catch(() => {});
    refreshTrades();
  }, []); // eslint-disable-line

  // Socket.IO realtime feed — Quotex-style protocol with binary msgpack payloads.
  // Re-authenticating the socket is needed because the access token is short
  // lived: after a reconnect with an expired token the server leaves the
  // connection unauthenticated, which made "trade/place" answer
  // "Not authenticated" until the page was refreshed.
  const authInFlightRef = useRef(null);
  const ensureAuthed = useCallback(async () => {
    if (authInFlightRef.current) return authInFlightRef.current;
    const run = async () => {
      const ws = wsRef.current;
      if (!ws) return false;
      const tryAuth = (tk) => new Promise((resolve) => {
        if (!tk) return resolve(false);
        let settled = false;
        ws.emit('auth', tk, (ack) => { settled = true; resolve(!!(ack && ack.ok)); });
        setTimeout(() => { if (!settled) resolve(false); }, 2500);
      });
      if (await tryAuth(localStorage.getItem('bfg_token'))) return true;
      try {
        const { data } = await axios.post(`${API}/api/auth/refresh`, {}, { withCredentials: true });
        if (data && data.token) {
          localStorage.setItem('bfg_token', data.token);
          if (await tryAuth(data.token)) return true;
          // Last resort — full handshake again, this time with the fresh token.
          ws.disconnect();
          ws.connect();
        }
      } catch { /* refresh cookie gone — user must log in again */ }
      return false;
    };
    authInFlightRef.current = run().finally(() => { authInFlightRef.current = null; });
    return authInFlightRef.current;
  }, []);

  useEffect(() => {
    if (!token) return;
    const socket = io(API, {
      path: '/api/socket.io/',
      transports: ['websocket'],
      // Read the token at every (re)connect instead of freezing the one from
      // mount — a stale token here is what left the socket unauthenticated.
      auth: (cb) => cb({ token: localStorage.getItem('bfg_token') }),
      reconnection: true,
      reconnectionDelay: 1500,
    });
    wsRef.current = socket;

    socket.on('connect', () => {
      const tk = localStorage.getItem('bfg_token');
      if (tk) socket.emit('auth', tk, (ack) => { if (!ack || !ack.ok) ensureAuthed(); });
      socket.emit('subscribe', activeRef.current);
    });

    // "quotes/stream" — per-symbol live tick (binary msgpack).
    socket.on('quotes/stream', (buf) => {
      const m = unpackr.unpack(buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf);
      setLastTick(m);
      setQuotes((q) => ({ ...q, [m.symbol]: m.price }));
    });

    // "markets/payouts" — admin-controlled per-symbol payout table (binary
    // msgpack). Delivered via socket so the plain HTTP /instruments payload
    // never contains the payout value. Stored in its own state (+localStorage)
    // so TradePanel/AssetPicker always have a value and update the instant an
    // admin changes a payout.
    socket.on('markets/payouts', (buf) => {
      const m = unpackr.unpack(buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf);
      const table = m?.payouts || {};
      setPayouts((prev) => {
        const next = { ...prev, ...table };
        try { localStorage.setItem('bfg_payouts', JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
    });

    // "depth/change" — order book snapshot (binary msgpack, all symbols).
    socket.on('depth/change', (buf) => {
      const m = unpackr.unpack(buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf);
      if (!m?.book) return;
      const flat = {};
      for (const [sym, row] of Object.entries(m.book)) {
        flat[sym] = (row.bid + row.ask) / 2;
      }
      setQuotes((q) => ({ ...q, ...flat }));
    });

    // "s_orders/open" — server-verified open echo (Quotex-style protocol).
    socket.on('s_orders/open', ({ trade, balance: bal, requestId }) => {
      if (bal !== undefined && bal !== null) setBalance(bal);
      setOpenTrades((t) => {
        // Strip the matching optimistic placeholder so the real trade takes over
        // in the SAME state update (never both at once — two badges on the same
        // spot get fanned apart, which looked like the entry dot jumping).
        const cleaned = t.filter((x) => !(x._optimistic
          && (x._requestId === requestId
            || (x.symbol === trade.symbol
              && x.direction === trade.direction
              && Number(x.amount) === Number(trade.amount)))));
        return cleaned.some((x) => x.id === trade.id) ? cleaned : [trade, ...cleaned];
      });
    });

    // "s_orders/close" — server-verified close (Quotex-style protocol).
    socket.on('s_orders/close', ({ trade, balance: bal }) => {
      setBalance(bal);
      setOpenTrades((t) => t.filter((x) => x.id !== trade.id));
      // Dedupe — the legacy `trade_closed` event can arrive for the same trade,
      // which used to push a second history row with a duplicate React key.
      setHistory((h) => (h.some((x) => x.id === trade.id) ? h : [trade, ...h]).slice(0, 50));
      pushResult(trade);
    });

    // Legacy JSON event kept for backward compatibility with older backend.
    socket.on('trade_closed', ({ trade, balance: bal }) => {
      setBalance(bal);
      setOpenTrades((t) => t.filter((x) => x.id !== trade.id));
      setHistory((h) => (h.some((x) => x.id === trade.id) ? h : [trade, ...h]).slice(0, 50));
      // No toast — the on-chart RESULT (P/L) card is the single settlement notice.
      pushResult(trade);
    });

    return () => { try { socket.disconnect(); } catch { /* ignore */ } };
  }, []); // eslint-disable-line

  useEffect(() => {
    const s = wsRef.current;
    if (s && s.connected) s.emit('subscribe', active);
  }, [active]);

  // Reconcile fallback — if a settled trade's close event was missed (WS reconnect),
  // refetch open trades + wallet once any open trade is >3s past its expiry.
  useEffect(() => {
    if (!openTrades.length) return;
    const i = setInterval(() => {
      const stale = openTrades.some((t) => Date.now() - new Date(t.expiry_time).getTime() > 1200);
      if (stale) {
        refreshTrades();
        axios.get(`${API}/api/wallet`, authH).then(({ data }) => setBalance(data.balance)).catch(() => {});
      }
    }, 700);
    return () => clearInterval(i);
  }, [openTrades]); // eslint-disable-line

  const instrumentList = instruments.map((i) => (
    payouts[i.symbol] !== undefined ? { ...i, payout: payouts[i.symbol] } : i
  ));
  const instMap = Object.fromEntries(instrumentList.map((i) => [i.symbol, i]));
  const activeIns = instMap[active];

  // Pairs are freely switchable even with trades running — running trades keep
  // settling on the server and reappear on their own chart when you come back.
  const requestSwitchActive = (sym) => {
    if (sym === active) return;
    setActive(sym);
  };

  const openTab = (sym) => {
    setTabs((t) => (t.includes(sym) ? t : [...t, sym]));
    requestSwitchActive(sym);
  };
  const closeTab = (sym, e) => {
    e.stopPropagation();
    // Do not allow closing a tab that still has open trades — trades would
    // become orphaned from the chart. Force user to wait for settlement.
    if (openTrades.some((t) => t.symbol === sym)) {
      toast({
        title: 'Trade running',
        description: `Wait for your ${instMap[sym]?.name || sym} trades to settle before removing this tab.`,
        variant: 'destructive',
      });
      return;
    }
    setTabs((t) => {
      const next = t.filter((s) => s !== sym);
      if (sym === active && next.length) setActive(next[next.length - 1]);
      return next.length ? next : t;
    });
  };

  const placeTrade = (direction) => {
    // Buttons stay clickable at all times — the user wants rapid back-to-back
    // trades, so we no longer block on `placing`. Optimistic UI + server
    // reconciliation handle the concurrency.
    if (!activeIns) return;
    const amt = Number(amount) || 0;
    if (amt < 1) { toast({ title: 'Minimum investment is $1', variant: 'destructive' }); return; }
    if (balance !== null && amt > balance) { toast({ title: 'Insufficient balance', variant: 'destructive' }); return; }

    // --- INSTANT UX (fires before the network round-trip) ---
    // 1) Desktop-only direction cue — plays the moment the button is pressed.
    if (direction === 'higher') sfx.up(); else sfx.down();

    // 2) Optimistic trade — drop a badge on the chart instantly using the last
    //    live tick as the entry price. The real server trade replaces it as
    //    soon as `s_orders/open` (or the HTTP response) arrives.
    const liveTick = (lastTick && lastTick.symbol === active && lastTick.price) ? lastTick : null;
    const entryPrice = (liveTick && liveTick.price) || quotes[active] || 0;
    const nowMs = Date.now();
    const tempId = `optimistic-${nowMs}`;
    const requestId = Math.floor(Math.random() * 2_147_483_647);
    const optimistic = {
      id: tempId,
      _optimistic: true,
      symbol: active,
      direction,
      amount: amt,
      entry_price: entryPrice,
      entry_time: new Date(nowMs).toISOString(),
      expiry_time: new Date(nowMs + duration * 1000).toISOString(),
      account: accountKey,
      status: 'open',
      _requestId: requestId,
    };
    setOpenTrades((t) => [optimistic, ...t]);
    // Optimistic balance debit so the header updates instantly (server value
    // rewrites this once the response returns).
    if (balance !== null) setBalance((b) => (b === null ? b : Math.max(0, b - amt)));

    setPlacing(true);
    const ws = wsRef.current;
    const placePayload = {
      symbol: active,
      direction,
      amount: amt,
      duration,
      optionType: 100,        // Quotex-style: 100 = binary option
      isDemo: accountKey === 'demo' ? 1 : 0,
      requestId,
      account: accountKey,
      // Lets the server bind this socket to the user inline if the handshake auth
      // hasn't finished yet (fast first click) — no more "Not authenticated".
      token: localStorage.getItem('bfg_token') || undefined,
      // Timestamp of the tick this entry price came from — the server re-reads
      // its own tick history at that instant, so the confirmed entry price is
      // identical to the optimistic one and the chart's entry dot never shifts.
      clientTickT: liveTick ? liveTick.t : undefined,
    };
    const onSuccess = (data) => {
      setBalance(data.balance);
      // Swap the optimistic badge for the server-confirmed trade.
      setOpenTrades((t) => {
        const filtered = t.filter((x) => x.id !== tempId);
        return filtered.some((x) => x.id === data.trade.id) ? filtered : [data.trade, ...filtered];
      });
    };
    const onFail = (msg) => {
      // Roll back the optimistic trade + balance on failure.
      setOpenTrades((t) => t.filter((x) => x.id !== tempId));
      if (balance !== null) setBalance((b) => (b === null ? b : b + amt));
      toast({ title: msg || 'Trade failed', variant: 'destructive' });
    };
    // Trade placement over Socket.IO — no plain HTTP POST is used so nothing
    // shows up in the browser Network tab for /api/trade/place.
    const emitPlace = (isRetry) => {
      ws.emit('trade/place', placePayload, async (ack) => {
        // The socket can be unauthenticated right after connect / after a
        // reconnect with an expired token — re-auth transparently and retry once.
        if (!isRetry && ack && /not authenticated/i.test(ack.error || '')) {
          if (await ensureAuthed()) return emitPlace(true);
        }
        setPlacing(false);
        if (!ack || ack.error) return onFail(ack?.error);
        onSuccess(ack);
      });
    };
    if (ws && ws.connected) {
      emitPlace(false);
    } else if (ws) {
      // Clicked before the socket finished connecting — wait briefly instead of
      // failing outright.
      const t = setTimeout(() => {
        ws.off('connect', onReady);
        onFail('Not connected to trading server');
        setPlacing(false);
      }, 900);
      function onReady() {
        clearTimeout(t);
        emitPlace(false);
      }
      ws.once('connect', onReady);
    } else {
      onFail('Not connected to trading server');
      setPlacing(false);
    }
  };

  const onAccountSwitched = ({ active: newKey, balance: newBal }) => {
    setAccountKey(newKey);
    setBalance(newBal);
    setUser((u) => (u ? { ...u, active_account: newKey } : u));
    refreshTrades();
  };

  const logout = () => {
    localStorage.removeItem('bfg_token');
    localStorage.removeItem('bfg_user');
    navigate('/');
  };

  if (!user || !instruments.length) {
    return <TradeSkeleton />;
  }

  const badge = ACCOUNT_BADGES[accountKey] || ACCOUNT_BADGES.demo;

  const renderTab = (sym) => {
    const ins = instMap[sym];
    if (!ins) return null;
    const isActive = sym === active;
    const tabHasOpenTrades = openTrades.some((t) => t.symbol === sym);
    return (
      <div key={sym} onClick={() => requestSwitchActive(sym)} data-testid={`asset-tab-${sym}`}
           className={`group relative shrink-0 flex items-center rounded-xl cursor-pointer border transition-colors gap-2 pl-2.5 pr-1.5 py-1.5 ${isActive
             ? 'bg-gradient-to-b from-[#14b877]/[0.14] to-[#14b877]/[0.03] border-[#14b877]/40 shadow-[0_0_18px_rgba(20,184,119,0.1)]'
             : 'border-white/[0.08] hover:bg-white/[0.04] hover:border-white/20'}`}>
        <AssetIcon icon={ins.icon} size={20} />
        <span className="text-[13px] font-bold whitespace-nowrap">{ins.name} (OTC)</span>
        {!tabHasOpenTrades && tabs.length > 1 && (
          <button onClick={(e) => closeTab(sym, e)} data-testid={`close-tab-${sym}`}
                  className="h-5 w-5 flex items-center justify-center rounded-md text-white/25 hover:text-white hover:bg-white/10 transition-colors"><X size={11} /></button>
        )}
      </div>
    );
  };

  return (
    <div className="h-[100dvh] flex flex-col text-white bg-[#040D09] overflow-hidden overscroll-none touch-pan-x" data-testid="demo-trade-page"
         style={{ overscrollBehavior: 'none' }}>
      {/* Header */}
      <header className="shrink-0 flex items-center gap-2 sm:gap-3 px-2.5 sm:px-4 h-[52px] border-b border-white/[0.05] md:border-white/[0.07] bg-transparent md:bg-[#050f0a]/95 md:backdrop-blur-xl">
        <Link to="/" className="hidden md:flex shrink-0 items-center gap-2" data-testid="trade-logo-link">
          <BrandLogo className="h-7 w-auto object-contain" />
        </Link>

        {/* Mobile — active market button (tap → asset picker) */}
        <button onClick={() => setPickerOpen(true)} data-testid="mobile-market-button"
                className="md:hidden shrink-0 flex items-center gap-2 rounded-xl border border-white/[0.09] bg-gradient-to-b from-white/[0.05] to-transparent pl-2 pr-2 py-1 active:bg-white/[0.06] transition-colors">
          {activeIns && <AssetIcon icon={activeIns.icon} size={22} />}
          <span className="text-[13px] font-bold whitespace-nowrap">{activeIns?.name} (OTC)</span>
          <CaretDown size={11} weight="bold" className="text-white/40" />
        </button>

        <div className="hidden md:block h-6 w-px bg-white/[0.08] shrink-0" />

        {/* Asset tabs — desktop inline */}
        <div className="hidden md:flex flex-1 items-center gap-1.5 overflow-x-auto scrollbar-none min-w-0 py-1">
          {tabs.map((sym) => renderTab(sym))}
          <button onClick={() => setPickerOpen(true)} data-testid="add-asset-button"
                  className="shrink-0 h-9 w-9 flex items-center justify-center rounded-xl border border-dashed border-white/20 text-white/45 hover:text-[#14b877] hover:border-[#14b877]/50 transition-colors">
            <Plus size={16} weight="bold" />
          </button>
        </div>
        <div className="flex-1 md:hidden" />

        {/* Balance (click → account switcher) + deposit + avatar */}
        <div className="shrink-0 flex items-center gap-2 sm:gap-2.5">
          <button
            onClick={() => setAccountsOpen(true)}
            data-testid="demo-balance"
            className={`group rounded-xl border ${badge.ring} bg-gradient-to-b from-white/[0.06] to-white/[0.015] pl-1 pr-1.5 sm:pl-1.5 sm:pr-2 py-[3px] sm:py-1 flex items-center gap-1.5 sm:gap-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] active:scale-[0.97] transition-[transform,border-color] duration-150`}
          >
            <span className={`grid place-items-center ${badge.text}`} data-testid={`account-icon-${accountKey}`}>
              <badge.icon className="h-[16px] w-[16px] sm:h-5 sm:w-5" weight="fill" />
            </span>
            <span className="flex flex-col items-start leading-none gap-[2px] sm:gap-[3px]">
              <span className={`text-[7px] sm:text-[8px] font-extrabold tracking-[0.16em] ${badge.text}`} data-testid="account-badge">
                {badge.label}
              </span>
              <span className="text-[12px] sm:text-[14px] font-extrabold tabular-nums" data-testid="balance-value">
                ${balance !== null ? balance.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}
              </span>
            </span>
            <CaretDown size={10} weight="bold" className="text-white/35 group-hover:text-white/70 transition-colors" />
          </button>
          <button onClick={() => toast({ title: 'Deposit coming soon', description: 'Apni ekhon demo account e trade korchen.' })} data-testid="deposit-button"
                  className="hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-[#1ad48b] to-[#0fa066] text-[#03150d] font-bold text-[13px] px-4 py-2 shadow-[0_4px_18px_rgba(20,184,119,0.25)] hover:brightness-110 hover:shadow-[0_4px_24px_rgba(20,184,119,0.4)] active:scale-[0.97] transition-[transform,box-shadow,filter] duration-150">
            <Download size={15} weight="bold" /> Deposit
          </button>
          {user.picture
            ? <img src={user.picture} alt={user.name} referrerPolicy="no-referrer" className="hidden md:block h-8 w-8 rounded-full object-cover ring-1 ring-white/15 hover:ring-[#14b877]/60 transition-shadow cursor-pointer" data-testid="trade-avatar" onClick={() => navigate('/profile')} />
            : <div className="hidden md:flex h-8 w-8 rounded-full items-center justify-center font-bold text-[13px] bg-gradient-to-br from-[#1ad48b] to-[#0c8a56] text-[#03150d] ring-1 ring-white/10 hover:ring-[#14b877]/60 transition-shadow cursor-pointer" data-testid="trade-avatar" onClick={() => navigate('/profile')}>{(user.nickname || user.full_name || user.email || 'B')[user.nickname ? 1 : 0]?.toUpperCase() || 'B'}</div>}
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar (desktop) */}
        <aside className="hidden md:flex w-[64px] shrink-0 flex-col items-center gap-1 border-r border-white/[0.07] bg-[#050f0a]/95 backdrop-blur-xl py-3">
          {SIDE_ITEMS.map(([Icon, label, path], i) => (
            <button key={label} data-testid={`side-${label.toLowerCase()}`}
                    onClick={() => path && navigate(path)}
                    className={`relative w-14 py-2 flex flex-col items-center gap-1 rounded-xl transition-colors ${i === 0 ? 'text-[#14b877] bg-[#14b877]/10' : 'text-white/40 hover:text-white hover:bg-white/[0.05]'}`}>
              {i === 0 && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full bg-[#14b877]" />}
              <Icon size={20} weight="duotone" />
              <span className="text-[9px] font-semibold whitespace-nowrap">{label}</span>
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={logout} data-testid="trade-logout-button" className="w-14 py-2 flex flex-col items-center gap-1 rounded-xl text-white/40 hover:text-red-400 hover:bg-red-400/[0.06] transition-colors">
            <SignOut size={20} weight="duotone" />
            <span className="text-[9px] font-semibold whitespace-nowrap">Logout</span>
          </button>
        </aside>

        {/* Chart area */}
        <main className="flex-1 relative min-w-0 bfg-trade-main-bg">
          {activeIns && <TradeChart symbol={active} digits={activeIns.digits} lastTick={lastTick} openTrades={openTrades} hoverDir={hoverDir} results={results} onDismissResult={dismissResult} resultTtl={RESULT_TTL} wsRef={wsRef} />}
          <TradesPanel openTrades={openTrades} history={history} instMap={instMap} />
        </main>

        {/* Trade panel (desktop) */}
        <TradePanel instrument={activeIns} amount={amount} setAmount={setAmount} duration={duration} setDuration={setDuration} onTrade={placeTrade} placing={placing} balance={balance} onHoverDir={setHoverDir} />
      </div>

      {/* Trade panel (mobile) */}
      <TradePanel mobile instrument={activeIns} amount={amount} setAmount={setAmount} duration={duration} setDuration={setDuration} onTrade={placeTrade} placing={placing} balance={balance} />

      {/* Bottom navigation (mobile) */}
      <nav className="md:hidden shrink-0 flex items-stretch border-t border-white/[0.07] bg-[#040D09] pb-[env(safe-area-inset-bottom)]" data-testid="mobile-bottom-nav">
        {[
          [ChartLineUp, 'Chart', null, true],
          [ChartPieSlice, 'Portfolio', '/dashboard', false],
          [ClockCounterClockwise, 'History', null, false],
          [UserIcon, 'Profile', '/profile', false],
          [SignOut, 'Logout', 'logout', false],
        ].map(([Icon, label, path, isActive]) => (
          <button key={label} data-testid={`mobile-nav-${label.toLowerCase()}`} aria-label={label}
                  onClick={() => { if (path === 'logout') logout(); else if (path) navigate(path); }}
                  className={`flex-1 py-2.5 flex items-center justify-center transition-colors ${isActive ? 'text-[#14b877]' : 'text-white/40 active:text-white'}`}>
            <Icon size={21} weight={isActive ? 'fill' : 'duotone'} />
          </button>
        ))}
      </nav>

      <AssetPicker open={pickerOpen} onClose={() => setPickerOpen(false)} instruments={instrumentList} quotes={quotes} onSelect={openTab} />
      <AccountSwitcher open={accountsOpen} onClose={() => setAccountsOpen(false)} onSwitched={onAccountSwitched} />
    </div>
  );
}
