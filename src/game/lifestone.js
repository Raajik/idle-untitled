// Lifestone Recall: instant travel to any region whose Lifestone you've bonded
// with (i.e. arrived at), gated by a cooldown that shrinks as the skill ranks up.

import { getRegion } from '../data/regions.js';
import { recallCooldownSeconds, RECALL_XP_ON_USE, trainSkill } from './skills.js';
import { addLog } from './state.js';

export function canRecall(state) {
  return state.progress.recallUnlocked && state.progress.recallCooldown <= 0;
}

export function recallTo(state, regionId) {
  if (!canRecall(state)) return false;
  if (!state.progress.unlockedRegions.includes(regionId)) return false;
  const region = getRegion(regionId);
  if (!region) return false;

  state.travel = null;
  state.monster = null;
  state.location = { regionId, poiId: null };
  state.progress.recallCooldown = recallCooldownSeconds(state.hero.skills.lifestone.recall.rank);
  trainSkill(state, state.hero.skills.lifestone.recall, 'Lifestone Recall', RECALL_XP_ON_USE);
  addLog(state, `The Lifestone's light folds around you — you arrive at ${region.name}.`, 'good');
  return true;
}

export function tickRecallCooldown(state, dt) {
  if (state.progress.recallCooldown > 0) {
    state.progress.recallCooldown = Math.max(0, state.progress.recallCooldown - dt);
  }
}
