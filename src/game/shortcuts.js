// Jump: instant relocation between the two ends of an unlocked Athletics
// shortcut. No travel time at all (that's the point) — just a shared
// cooldown, same shape as Lifestone Recall's.

import { SHORTCUTS, shortcutsFromLocation, otherEndpoint } from '../data/shortcuts.js';
import { getPoiById } from '../data/regions.js';
import { jumpCooldownSeconds, trainSkill, trainAttribute, JUMP_XP_ON_USE, JUMP_QUICK_XP_ON_USE } from './skills.js';
import { addLog } from './state.js';

// Shortcuts usable right now: hero must be standing at one endpoint (not
// travelling) and have reached the required Athletics rank.
export function availableShortcutsFrom(state) {
  if (state.travel || !state.location.poiId) return [];
  const rank = state.hero.skills.athletics.rank;
  return shortcutsFromLocation(state.location.poiId).filter((s) => rank >= s.athleticsRank);
}

export function canJump(state) {
  return state.progress.jumpCooldown <= 0;
}

export function jumpTo(state, shortcutId) {
  const shortcut = SHORTCUTS.find((s) => s.id === shortcutId);
  if (!shortcut) return false;
  if (!canJump(state)) return false;
  if (state.travel || !state.location.poiId) return false;
  const rank = state.hero.skills.athletics.rank;
  if (rank < shortcut.athleticsRank) return false;

  const destPoiId = otherEndpoint(shortcut, state.location.poiId);
  if (destPoiId === state.location.poiId) return false; // not standing at either endpoint
  const destPoi = getPoiById(destPoiId);
  if (!destPoi) return false;

  state.location = { regionId: destPoi.regionId, poiId: destPoiId };
  state.monsters = [];
  state.progress.wave = 1;
  state.progress.waveMonstersLeft = 0;
  state.progress.timeInPoi = 0;
  state.progress.killsInPoi = 0;
  state.hero.attackTimer = 0;
  if (!state.progress.visitedPois.includes(destPoiId)) state.progress.visitedPois.push(destPoiId);

  state.progress.jumpCooldown = jumpCooldownSeconds(rank);
  trainSkill(state, state.hero.skills.athletics, 'Athletics', JUMP_XP_ON_USE);
  trainAttribute(state, 'quick', JUMP_QUICK_XP_ON_USE);
  addLog(state, `You take the ${shortcut.name} and arrive at ${destPoi.name} in a heartbeat.`, 'good');
  return true;
}

export function tickJumpCooldown(state, dt) {
  if (state.progress.jumpCooldown > 0) {
    state.progress.jumpCooldown = Math.max(0, state.progress.jumpCooldown - dt);
  }
}
