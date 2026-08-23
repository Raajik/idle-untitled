// Progressive UI: declarative unlocks table. Visibility is DERIVED from game state
// (never stored flags), so saves can't desync. `seenUnlocks` only tracks toasts.
//
// `kind: 'category'` entries (Hero) are headers, not routable tabs — they render
// nested tab buttons for every unlocked entry whose `parent` matches their id.

import { canEnlighten } from '../game/enlightenment.js';

// Owning any gear at all — via a kill-drop, a shop purchase, or the tutorial's
// auto-equips — not just having ever gotten a monster drop specifically.
function ownsAnyGear(s) {
  return s.inventory.length > 0 || Object.values(s.equipment).some(Boolean);
}

export const UNLOCKS = [
  { id: 'battle', kind: 'tab', label: '⚔ Battle', when: () => true },
  {
    id: 'hero',
    kind: 'category',
    label: (s) => `🧙 ${s.hero.name || 'Hero'}`,
    when: (s) => s.hero.level >= 2 || s.progress.visitedPois.length > 0 || ownsAnyGear(s),
  },
  { id: 'attributes', kind: 'tab', parent: 'hero', label: 'Attributes', when: (s) => s.hero.level >= 2, toast: '🧙 Attributes unlocked — allocate your stat points!' },
  { id: 'skills', kind: 'tab', parent: 'hero', label: 'Skills', when: (s) => s.progress.visitedPois.length > 0 || s.travel !== null || s.progress.unlockedRegions.length > 0, toast: '🏃 Skills unlocked — Athletics trains as you walk!' },
  { id: 'inventory', kind: 'tab', parent: 'hero', label: 'Inventory', when: (s) => ownsAnyGear(s), toast: '🎒 Inventory unlocked — check your gear anytime!' },
  {
    id: 'tinkering',
    kind: 'tab',
    parent: 'hero',
    label: 'Tinkering',
    when: (s) => Object.values(s.materials).some((c) => c > 0),
    toast: '🔧 Tinkering unlocked — use materials from clears and salvage to improve your gear!',
  },
  {
    id: 'lifestone',
    kind: 'category',
    label: '🪦 Lifestone',
    when: (s) => s.progress.recallUnlocked,
    toast: '🪦 Lifestone Recall unlocked — instant travel between Lifestones you\'ve bonded with!',
  },
  { id: 'recall', kind: 'tab', parent: 'lifestone', label: 'Recall', when: (s) => s.progress.recallUnlocked },
  { id: 'training', kind: 'tab', label: '💰 Training', when: (s) => s.progress.totalPyrealsEarned >= 200, toast: '💰 Training unlocked — spend pyreals on permanent % upgrades!' },
  { id: 'enlightenment', kind: 'tab', label: '✦ Enlightenment', when: (s) => s.progress.totalClears >= 1, toast: '✦ Enlightenment unlocked — a greater power stirs...', teaser: (s) => !canEnlighten(s) },
  { id: 'overview', kind: 'tab', label: '📊 Overview', when: (s) => s.enlightenment.count >= 1, toast: '📊 Overview unlocked — monitor everything at once!' },
  // Routable, but deliberately not in the nav list — index.html has a gear button
  // in the sidebar footer that selects it (see ui/render.js renderNav).
  { id: 'settings', kind: 'tab', label: '⚙ Settings', when: () => true, hidden: true },
];

// Flat top-level nav entries: routable tabs with no parent, plus category headers.
export function topLevelEntries(state) {
  return UNLOCKS.filter((u) => !u.parent && !u.hidden && u.when(state));
}

// Routable child tabs under a category id.
export function childTabs(state, categoryId) {
  return UNLOCKS.filter((u) => u.kind === 'tab' && u.parent === categoryId && u.when(state));
}

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
