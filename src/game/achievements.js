// Awarding achievements. The definitions and their effects live in
// data/achievements.js; this is just the "you earned it" side, kept separate so
// the data module stays importable from game/hero.js without a cycle.

import { getAchievement, hasAchievement } from '../data/achievements.js';
import { addLog } from './state.js';

// Grants an achievement once. Returns true only on the first award, so callers
// can fire a toast without having to track it themselves.
export function awardAchievement(state, id) {
  if (hasAchievement(state, id)) return false;
  const achievement = getAchievement(id);
  if (!achievement) return false;
  state.achievements.push(id);
  addLog(state, `★ ${achievement.name} — ${achievement.reward}.`, 'good');
  return true;
}

export { hasAchievement };
