// Number formatting helper (comma separators) for pyreals, XP, and other large values.

export function fmt(n) {
  return Math.round(n).toLocaleString('en-US');
}
