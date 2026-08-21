// Rebirth: prestige reset and permanent upgrade tree.

import { soulsForRun, REBIRTH_UPGRADES, REBIRTH_MIN_REGION } from '../data/rebirth.js';
import { regionIndex } from '../data/regions.js';
import { resetRun, addLog } from './state.js';

function highestRegionIndex(state) {
  let max = -1;
  for (const id of state.progress.unlockedRegions) {
    const idx = regionIndex(id);
    if (idx > max) max = idx;
  }
  return max;
}

export function canRebirth(state) {
  return soulsForRun(highestRegionIndex(state), state.hero.level) > 0;
}

export function soulsAvailable(state) {
  return soulsForRun(highestRegionIndex(state), state.hero.level);
}

export function performRebirth(state) {
  const souls = soulsAvailable(state);
  if (souls <= 0) return 0;
  state.rebirth.souls += souls;
  state.rebirth.count += 1;

  // Apply Head Start upgrade to the fresh hero
  resetRun(state);
  const headStart = (state.rebirth.upgrades.headStart || 0) * 5;
  if (headStart > 0) {
    for (const attr of ['str', 'end', 'coord', 'quick', 'focus', 'self']) {
      state.hero[attr] += headStart;
    }
  }

  addLog(state, `✦ Rebirth #${state.rebirth.count}! Gained ${souls} Hero Souls.`, 'boss');
  return souls;
}

export function upgradeCost(upgradeId) {
  const up = REBIRTH_UPGRADES.find((u) => u.id === upgradeId);
  return (rank) => up.cost(rank);
}

export function buyUpgrade(state, upgradeId) {
  const up = REBIRTH_UPGRADES.find((u) => u.id === upgradeId);
  const rank = state.rebirth.upgrades[upgradeId] || 0;
  if (rank >= up.maxRank) return false;
  const cost = up.cost(rank);
  if (state.rebirth.souls < cost) return false;
  state.rebirth.souls -= cost;
  state.rebirth.upgrades[upgradeId] = rank + 1;
  return true;
}

export { REBIRTH_UPGRADES, REBIRTH_MIN_REGION, soulsForRun };
