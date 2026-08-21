// Rebirth: prestige reset and permanent upgrade tree.

import { soulsForRun, REBIRTH_UPGRADES, REBIRTH_MIN_ZONE } from '../data/rebirth.js';
import { resetRun, addLog } from './state.js';

export function canRebirth(state) {
  return soulsForRun(state.progress.highestZone, state.hero.level) > 0;
}

export function soulsAvailable(state) {
  return soulsForRun(state.progress.highestZone, state.hero.level);
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

export { REBIRTH_UPGRADES, REBIRTH_MIN_ZONE, soulsForRun };
