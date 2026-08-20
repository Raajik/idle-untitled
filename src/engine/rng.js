// Random helpers. All game randomness funnels through here so tests can stub if needed.

export function rand(min, max) {
  return Math.random() * (max - min) + min;
}

export function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

export function chance(p) {
  return Math.random() < p;
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Weighted pick: items = [{ weight, ... }]
export function pickWeighted(items) {
  const total = items.reduce((s, it) => s + it.weight, 0);
  let roll = Math.random() * total;
  for (const it of items) {
    roll -= it.weight;
    if (roll <= 0) return it;
  }
  return items[items.length - 1];
}
