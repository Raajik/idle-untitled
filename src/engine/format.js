// Number formatting helper (comma separators) for pyreals, XP, and other large values.

export function fmt(n) {
  return Math.round(n).toLocaleString('en-US');
}

// "1 soul" / "2 souls". Pass `many` when the plural isn't just an added s.
export function plural(n, one, many = `${one}s`) {
  return `${fmt(n)} ${n === 1 ? one : many}`;
}

// Seconds -> short human string, e.g. 90 -> "1m 30s", 7530 -> "2h 5m".
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// A clock reading — "0:07", "3:45", "1:02:30". Used where a duration is compared
// against another duration (travel times against their base), because "1m 30s"
// and "45s" are hard to weigh against each other at a glance and 1:30 vs 0:45
// is not.
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${sec}`;
  return `${m}:${sec}`;
}
