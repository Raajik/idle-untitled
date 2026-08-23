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
