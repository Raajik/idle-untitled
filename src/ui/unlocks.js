// Progressive UI: declarative unlocks table. Visibility is DERIVED from game state
// (never stored flags), so saves can't desync. `seenUnlocks` only tracks toasts.

import { canRebirth } from '../game/prestige.js';

export const UNLOCKS = [
  { id: 'battle', kind: 'tab', label: '⚔ Battle', when: () => true },
  { id: 'hero', kind: 'tab', label: '🧙 Hero', when: (s) => s.hero.level >= 2, toast: '🧙 Hero unlocked — allocate your stat points!' },
  { id: 'equipment', kind: 'tab', label: '🎒 Equipment', when: (s) => s.progress.totalDrops >= 1, toast: '🎒 Equipment unlocked — monsters can drop loot!' },
  { id: 'training', kind: 'tab', label: '💰 Training', when: (s) => s.progress.totalPyrealsEarned >= 5000, toast: '💰 Training unlocked — spend pyreals on permanent % upgrades!' },
  { id: 'rebirth', kind: 'tab', label: '✦ Rebirth', when: (s) => s.progress.bossesKilled >= 1, toast: '✦ Rebirth unlocked — a greater power stirs...', teaser: (s) => !canRebirth(s) },
  { id: 'overview', kind: 'tab', label: '📊 Overview', when: (s) => s.rebirth.count >= 1, toast: '📊 Overview unlocked — monitor everything at once!' },
  { id: 'settings', kind: 'tab', label: '⚙ Settings', when: () => true },
];

export function unlockedTabs(state) {
  return UNLOCKS.filter((u) => u.kind === 'tab' && u.when(state));
}

// Returns unlocks that are now visible but haven't been toasted yet, and marks them seen.
export function drainNewUnlocks(state) {
  const fresh = [];
  for (const u of UNLOCKS) {
    if (!u.toast) continue;
    if (u.when(state) && !state.ui.seenUnlocks.includes(u.id)) {
      state.ui.seenUnlocks.push(u.id);
      fresh.push(u);
    }
  }
  return fresh;
}
