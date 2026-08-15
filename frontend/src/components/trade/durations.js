// Shared duration helpers for trade panels & sheets.
export const TIMER_STEPS = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400];
export const TIME_OFFSETS = [1, 2, 3, 4, 5, 10, 15, 30, 60, 120, 180, 240];

export const fmtDur = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

// "30-second lockout" rule for wall-clock targets.
export function resolveTimeTarget(offsetMin) {
  const now = new Date();
  const target = new Date(now);
  target.setSeconds(0, 0);
  target.setMinutes(target.getMinutes() + offsetMin);
  if (now.getSeconds() >= 30) {
    target.setMinutes(target.getMinutes() + 1);
  }
  const duration = Math.max(60, Math.round((target.getTime() - now.getTime()) / 1000));
  return { duration, closeAt: target };
}

export function buildTimeChips() {
  const now = new Date();
  return TIME_OFFSETS.map((off) => {
    const t = new Date(now);
    t.setSeconds(0, 0);
    t.setMinutes(t.getMinutes() + off);
    if (now.getSeconds() >= 30) t.setMinutes(t.getMinutes() + 1);
    return { off, label: `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}` };
  });
}
