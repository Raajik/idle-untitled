// Number formatting helper (comma separators) for pyreals, XP, and other large values.

export function fmt(n) {
  return Math.round(n).toLocaleString('en-US');
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
