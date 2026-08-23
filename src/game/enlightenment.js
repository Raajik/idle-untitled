// Enlightenment: prestige reset and permanent upgrade tree.

import { soulsForRun, ENLIGHTENMENT_UPGRADES, ENLIGHTENMENT_MIN_REGION } from '../data/enlightenment.js';
import { regionIndex } from '../data/regions.js';
import { plural } from '../engine/format.js';
import { resetRun, addLog } from './state.js';

function highestRegionIndex(state) {
  let max = -1;
  for (const id of state.progress.unlockedRegions) {
    const idx = regionIndex(id);
    if (idx > max) max = idx;
  }
  return max;
}

export function canEnlighten(state) {
  return soulsForRun(highestRegionIndex(state), state.hero.level) > 0;
}

export function soulsAvailable(state) {
  return soulsForRun(highestRegionIndex(state), state.hero.level);
}

export function performEnlightenment(state) {
  const souls = soulsAvailable(state);
  if (souls <= 0) return 0;
  state.enlightenment.souls += souls;
  state.enlightenment.count += 1;

  // Apply Head Start upgrade to the fresh hero
  resetRun(state);
  const headStart = (state.enlightenment.upgrades.headStart || 0) * 5;
  if (headStart > 0) {
    for (const attr of ['str', 'end', 'coord', 'quick', 'focus', 'self']) {
      state.hero[attr] += headStart;
    }
  }

  addLog(state, `✦ Enlightenment #${state.enlightenment.count}! Gained ${plural(souls, 'Hero Soul')}.`, 'boss');
  return souls;
}

export function upgradeCost(upgradeId) {
  const up = ENLIGHTENMENT_UPGRADES.find((u) => u.id === upgradeId);
  return (rank) => up.cost(rank);
}

export function buyUpgrade(state, upgradeId) {
  const up = ENLIGHTENMENT_UPGRADES.find((u) => u.id === upgradeId);
  const rank = state.enlightenment.upgrades[upgradeId] || 0;
  if (rank >= up.maxRank) return false;
  const cost = up.cost(rank);
  if (state.enlightenment.souls < cost) return false;
  state.enlightenment.souls -= cost;
  state.enlightenment.upgrades[upgradeId] = rank + 1;
  return true;
}

export { ENLIGHTENMENT_UPGRADES, ENLIGHTENMENT_MIN_REGION, soulsForRun };
