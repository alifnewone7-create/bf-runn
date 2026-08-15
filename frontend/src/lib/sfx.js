/**
 * sfx.js — professional studio sound pack for the trading terminal (v4).
 *
 * Real MP3 assets (Mixkit License, royalty-free) served from /sounds/,
 * played through Web Audio buffers so settlement sounds fired from the
 * WebSocket callback are never blocked by autoplay policy.
 *
 *   up()   — UP trade placed    → /sounds/up.mp3    (bright ascending synth chime,    Mixkit sfx 2574)
 *   down() — DOWN trade placed  → /sounds/down.mp3  (same-family chime, sibling note, Mixkit sfx 2575)
 *   win()  — profit             → /sounds/win.mp3   (achievement bell 2s flourish,    Mixkit sfx 270)
 *   lose() — loss               → /sounds/lose.mp3  (descending mirror flourish,      Mixkit sfx 946)
 *
 * DESKTOP ONLY — silent on phones/tablets (viewport < 768px or coarse pointer).
 */

let ctx = null;
let master = null;
const buffers = {};
const loading = {};

const SOURCES = {
  up: '/sounds/up.mp3',
  down: '/sounds/down.mp3',
  win: '/sounds/win.mp3',
  lose: '/sounds/lose.mp3',
};

const VOLUME = { up: 1.0, down: 1.0, win: 1.0, lose: 0.9 };

const isDesktop = () => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return (
    window.matchMedia('(min-width: 768px)').matches &&
    window.matchMedia('(pointer: fine)').matches
  );
};

const enabled = () => {
  try {
    return localStorage.getItem('bfg_sfx') !== 'off';
  } catch (e) {
    return true;
  }
};

function audio() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 1.0;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function load(name) {
  const c = audio();
  if (!c || buffers[name] || loading[name]) return;
  loading[name] = fetch(SOURCES[name])
    .then((r) => r.arrayBuffer())
    .then((ab) => c.decodeAudioData(ab))
    .then((buf) => {
      buffers[name] = buf;
      delete loading[name];
    })
    .catch(() => {
      delete loading[name];
    });
}

function preloadAll() {
  Object.keys(SOURCES).forEach(load);
}

/** Browsers block audio until a gesture — call this from the first user click. */
export function unlockAudio() {
  if (!isDesktop()) return;
  const c = audio();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  preloadAll();
}

function play(name) {
  const c = audio();
  if (!c) return;
  const buf = buffers[name];
  if (!buf) {
    load(name);
    if (loading[name]) {
      loading[name].then(() => {
        if (buffers[name]) play(name);
      });
    }
    return;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = VOLUME[name] ?? 1.0;
  src.connect(g);
  g.connect(master);
  src.start();
}

const guard = (name) => () => {
  if (!isDesktop() || !enabled()) return;
  try {
    play(name);
  } catch (e) {
    /* audio must never break the trade flow */
  }
};

export const up = guard('up');
export const down = guard('down');
export const win = guard('win');
export const lose = guard('lose');

if (typeof window !== 'undefined' && isDesktop()) {
  const once = () => {
    unlockAudio();
    window.removeEventListener('pointerdown', once);
  };
  window.addEventListener('pointerdown', once);
}

export default { up, down, win, lose, unlockAudio };
