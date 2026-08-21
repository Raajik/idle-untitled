// Athletics shortcuts: discrete, bidirectional instant-relocation links between
// two specific POIs, unlocked once Athletics reaches the listed rank. Using one
// is the Jump action (see game/shortcuts.js) — instant, but on a shared cooldown
// that shrinks as Athletics ranks up.

export const SHORTCUTS = [
  {
    id: 'meeting-hall-rat-nest',
    name: 'Back Alley Cut-Through',
    from: 'holtburg-meeting-hall',
    to: 'rat-nest',
    athleticsRank: 10,
  },
  {
    id: 'redoubt-cave-of-alabree',
    name: 'Rope Line Down the Bluff',
    from: 'holtburg-redoubt',
    to: 'cave-of-alabree',
    athleticsRank: 20,
  },
  {
    id: 'dungeon-fern-mukkir-nest',
    name: 'Old Hunting Trail',
    from: 'dungeon-fern',
    to: 'mukkir-nest',
    athleticsRank: 35,
  },
];

// Shortcuts reachable from wherever the hero currently is (either endpoint).
export function shortcutsFromLocation(poiId) {
  return SHORTCUTS.filter((s) => s.from === poiId || s.to === poiId);
}

// The endpoint on the other side of a shortcut from the given location.
export function otherEndpoint(shortcut, poiId) {
  return shortcut.from === poiId ? shortcut.to : shortcut.from;
}
