import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_STYLE } from './tools';

// Always a real UUID v4 — the backend stores drawings keyed by UUID and would
// otherwise replace a non-UUID client id, breaking later updates/deletes.
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

// Cache key is scoped to the logged-in account so drawings never leak between
// users sharing a browser.
const accountKey = () => {
  try {
    const payload = (localStorage.getItem('bfg_token') || '').split('.')[1];
    if (!payload) return 'anon';
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return json.sub || 'anon';
  } catch (e) { return 'anon'; }
};
const lsKey = () => `bfg_drawings_v1:${accountKey()}`;

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

// Pending writes survive a reload while the socket is down.
const outboxKey = () => `bfg_drawings_outbox:${accountKey()}`;
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
 * Per-account + per-pair drawing store.
 * Source of truth is the backend (over socket.io: drawings/get · save · delete ·
 * clear, with drawings/changed pushed to every session of the same account).
 * localStorage mirrors the last known state so the chart paints instantly and
 * still works when the socket is briefly down.
 */
export default function useDrawings({ symbol, wsRef }) {
  const [drawings, setDrawings] = useState(() => readCache()[symbol] || []);
  const symRef = useRef(symbol);
  symRef.current = symbol;
  const listRef = useRef(drawings);
  listRef.current = drawings;
  // Writes attempted while the socket is down wait here (deduped per drawing,
  // newest wins) and are flushed on reconnect, so nothing is lost server-side.
  const outboxRef = useRef(readOutbox());

  const enqueue = useCallback((event, payload) => {
    const id = payload?.drawing?.id || payload?.id || null;
    const sym = payload?.symbol || payload?.drawing?.symbol || null;
    let q = outboxRef.current;
    if (event === 'drawings/clear') q = q.filter((o) => o.sym !== sym);
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
    // Never pass an undefined ack — socket.io serialises it as a trailing
    // `null` data arg and the server handler (sid, data) then drops the event.
    if (ack) ws.emit(event, payload, ack); else ws.emit(event, payload);
    return true;
  }, [wsRef, enqueue]);

  const commit = useCallback((next) => {
    setDrawings(next);
    writeCache(symRef.current, next);
  }, []);

  // Load on pair switch — cache first, then authoritative server list.
  // A missing ack (rare socket hiccup) is retried instead of leaving the chart
  // on a stale local mirror.
  const fetchList = useCallback((sym, isCancelled) => {
    let polls = 0;
    let attempts = 0;
    const run = () => {
      if (isCancelled()) return;
      let answered = false;
      const ok = emit('drawings/get', { symbol: sym }, (resp) => {
        answered = true;
        if (isCancelled() || !resp || resp.error || resp.symbol !== sym) return;
        setDrawings(resp.drawings || []);
        writeCache(sym, resp.drawings || []);
      });
      if (!ok) {
        // Socket not ready yet — poll briefly.
        polls += 1;
        if (polls < 40) setTimeout(run, 200);
        return;
      }
      attempts += 1;
      // Ack missing (rare server hiccup) → a few backoff retries.
      if (attempts < 4) setTimeout(() => { if (!answered) run(); }, 5000 * attempts);
    };
    run();
  }, [emit]);

  useEffect(() => {
    setDrawings(readCache()[symbol] || []);
    let cancelled = false;
    fetchList(symbol, () => cancelled);
    return () => { cancelled = true; };
  }, [symbol, fetchList]);

  // Live sync across the account's other sessions/devices. The socket is created
  // by the parent after this child mounts, so keep polling until it exists.
  useEffect(() => {
    let ws = null;
    let timer;
    const onChanged = (msg) => {
      if (!msg) return;
      if (msg.action === 'clear') {
        if (msg.symbol === symRef.current) commit([]);
        return;
      }
      const d = msg.drawing;
      if (msg.action === 'delete') {
        commit(listRef.current.filter((x) => x.id !== (msg.id || d?.id)));
        return;
      }
      if (!d || d.symbol !== symRef.current) return;
      const exists = listRef.current.some((x) => x.id === d.id);
      commit(exists ? listRef.current.map((x) => (x.id === d.id ? d : x)) : listRef.current.concat([d]));
    };
    const onConnect = () => {
      // Flush queued writes FIRST and wait for their acks — refetching before
      // the server applied them would overwrite local state with a stale list.
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
      ws.on('drawings/changed', onChanged);
      ws.on('connect', onConnect);
      // Already connected (e.g. queue restored from a previous session) → flush now.
      if (ws.connected && outboxRef.current.length) onConnect();
    };
    attach();
    return () => {
      clearTimeout(timer);
      if (ws) { ws.off('drawings/changed', onChanged); ws.off('connect', onConnect); }
    };
  }, [wsRef, commit, fetchList]);

  const persist = useCallback((d) => { emit('drawings/save', { drawing: d }); }, [emit]);

  const create = useCallback((tool, points, style) => {
    const d = {
      id: genId(), symbol: symRef.current, tool, points,
      ...DEFAULT_STYLE, ...(style || {}),
    };
    commit(listRef.current.concat([d]));
    persist(d);
    return d;
  }, [commit, persist]);

  const update = useCallback((id, patch, { save = true } = {}) => {
    const next = listRef.current.map((x) => (x.id === id ? { ...x, ...patch } : x));
    commit(next);
    if (save) {
      const d = next.find((x) => x.id === id);
      if (d) persist(d);
    }
  }, [commit, persist]);

  const saveNow = useCallback((id) => {
    const d = listRef.current.find((x) => x.id === id);
    if (d) persist(d);
  }, [persist]);

  const remove = useCallback((id) => {
    commit(listRef.current.filter((x) => x.id !== id));
    emit('drawings/delete', { id, symbol: symRef.current });
  }, [commit, emit]);

  const clear = useCallback(() => {
    commit([]);
    emit('drawings/clear', { symbol: symRef.current });
  }, [commit, emit]);

  return { drawings, create, update, saveNow, remove, clear };
}
