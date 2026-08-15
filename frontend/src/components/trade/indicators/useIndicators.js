import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultParams } from './catalog';

const genId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i += 1) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

const accountKey = () => {
  try {
    const payload = (localStorage.getItem('bfg_token') || '').split('.')[1];
    if (!payload) return 'anon';
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return json.sub || 'anon';
  } catch (e) { return 'anon'; }
};
const lsKey = () => `bfg_indicators_v1:${accountKey()}`;
const readCache = () => {
  try { return JSON.parse(localStorage.getItem(lsKey()) || '{}'); } catch (e) { return {}; }
};
const writeCache = (symbol, list) => {
  try {
    const all = readCache();
    all[symbol] = list;
    localStorage.setItem(lsKey(), JSON.stringify(all));
  } catch (e) { /* noop */ }
};
const outboxKey = () => `bfg_indicators_outbox:${accountKey()}`;
const readOutbox = () => {
  try {
    const q = JSON.parse(localStorage.getItem(outboxKey()) || '[]');
    return Array.isArray(q) ? q : [];
  } catch (e) { return []; }
};
const writeOutbox = (q) => {
  try { localStorage.setItem(outboxKey(), JSON.stringify(q)); } catch (e) { /* noop */ }
};

/**
 * Per-account + per-pair indicator store — same contract as useDrawings:
 * backend over socket.io (indicators/get · save · delete · clear, with
 * indicators/changed pushed to the account's other sessions), localStorage as
 * an instant-paint mirror plus an outbox for writes made while offline.
 */
export default function useIndicators({ symbol, wsRef }) {
  const [indicators, setIndicators] = useState(() => readCache()[symbol] || []);
  const symRef = useRef(symbol);
  symRef.current = symbol;
  const listRef = useRef(indicators);
  listRef.current = indicators;
  const outboxRef = useRef(readOutbox());

  const enqueue = useCallback((event, payload) => {
    const id = payload?.indicator?.id || payload?.id || null;
    const sym = payload?.symbol || payload?.indicator?.symbol || null;
    let q = outboxRef.current;
    if (event === 'indicators/clear') q = q.filter((o) => o.sym !== sym);
    else if (id) q = q.filter((o) => o.id !== id);
    q.push({ event, payload, id, sym });
    if (q.length > 200) q = q.slice(-200);
    outboxRef.current = q;
    writeOutbox(q);
  }, []);

  const emit = useCallback((event, payload, ack) => {
    const ws = wsRef?.current;
    if (!ws || !ws.connected) {
      if (!ack) enqueue(event, payload);
      return false;
    }
    if (ack) ws.emit(event, payload, ack); else ws.emit(event, payload);
    return true;
  }, [wsRef, enqueue]);

  const commit = useCallback((next) => {
    setIndicators(next);
    writeCache(symRef.current, next);
  }, []);

  const fetchList = useCallback((sym, isCancelled) => {
    let polls = 0;
    let attempts = 0;
    const run = () => {
      if (isCancelled()) return;
      let answered = false;
      const ok = emit('indicators/get', { symbol: sym }, (resp) => {
        answered = true;
        if (isCancelled() || !resp || resp.error || resp.symbol !== sym) return;
        setIndicators(resp.indicators || []);
        writeCache(sym, resp.indicators || []);
      });
      if (!ok) {
        polls += 1;
        if (polls < 40) setTimeout(run, 200);
        return;
      }
      attempts += 1;
      if (attempts < 4) setTimeout(() => { if (!answered) run(); }, 5000 * attempts);
    };
    run();
  }, [emit]);

  useEffect(() => {
    setIndicators(readCache()[symbol] || []);
    let cancelled = false;
    fetchList(symbol, () => cancelled);
    return () => { cancelled = true; };
  }, [symbol, fetchList]);

  useEffect(() => {
    let ws = null;
    let timer;
    const onChanged = (msg) => {
      if (!msg) return;
      if (msg.action === 'clear') {
        if (msg.symbol === symRef.current) commit([]);
        return;
      }
      const d = msg.indicator;
      if (msg.action === 'delete') {
        commit(listRef.current.filter((x) => x.id !== (msg.id || d?.id)));
        return;
      }
      if (!d || d.symbol !== symRef.current) return;
      const exists = listRef.current.some((x) => x.id === d.id);
      commit(exists ? listRef.current.map((x) => (x.id === d.id ? d : x)) : listRef.current.concat([d]));
    };
    const onConnect = () => {
      const sock = wsRef?.current || ws;
      const queued = outboxRef.current.splice(0);
      writeOutbox([]);
      const refetch = () => fetchList(symRef.current, () => false);
      if (!queued.length || !sock) { refetch(); return; }
      let left = queued.length;
      let fired = false;
      const finish = () => { if (fired) return; fired = true; clearTimeout(guard); refetch(); };
      const guard = setTimeout(finish, 8000);
      for (const o of queued) {
        sock.emit(o.event, o.payload, () => { left -= 1; if (left <= 0) finish(); });
      }
    };
    const attach = () => {
      ws = wsRef?.current;
      if (!ws) { timer = setTimeout(attach, 200); return; }
      ws.on('indicators/changed', onChanged);
      ws.on('connect', onConnect);
      if (ws.connected && outboxRef.current.length) onConnect();
    };
    attach();
    return () => {
      clearTimeout(timer);
      if (ws) { ws.off('indicators/changed', onChanged); ws.off('connect', onConnect); }
    };
  }, [wsRef, commit, fetchList]);

  const persist = useCallback((d) => { emit('indicators/save', { indicator: d }); }, [emit]);

  const add = useCallback((kind, params) => {
    const item = {
      id: genId(), symbol: symRef.current, kind,
      params: { ...defaultParams(kind), ...(params || {}) }, visible: true,
    };
    commit(listRef.current.concat([item]));
    persist(item);
    return item;
  }, [commit, persist]);

  const update = useCallback((id, patch, { save = true } = {}) => {
    const next = listRef.current.map((x) => (x.id === id
      ? { ...x, ...patch, params: { ...x.params, ...(patch.params || {}) } }
      : x));
    commit(next);
    if (save) {
      const item = next.find((x) => x.id === id);
      if (item) persist(item);
    }
  }, [commit, persist]);

  const saveNow = useCallback((id) => {
    const item = listRef.current.find((x) => x.id === id);
    if (item) persist(item);
  }, [persist]);

  const remove = useCallback((id) => {
    commit(listRef.current.filter((x) => x.id !== id));
    emit('indicators/delete', { id, symbol: symRef.current });
  }, [commit, emit]);

  const clear = useCallback(() => {
    commit([]);
    emit('indicators/clear', { symbol: symRef.current });
  }, [commit, emit]);

  return { indicators, add, update, saveNow, remove, clear };
}
