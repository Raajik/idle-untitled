// Hero stats: Asheron's Call six attributes -> derived combat stats.
// Strength / Endurance / Coordination / Quickness drive melee combat;
// Focus (Life Magic) and Self (mana) are latent until the skill system lands.

import { REBIRTH_UPGRADES } from '../data/rebirth.js';

export const ATTRIBUTES = [
  { id: 'str', name: 'Strength', short: 'STR', desc: '+1.5 ATK each' },
  { id: 'end', name: 'Endurance', short: 'END', desc: '+5 Max HP, +0.5 DEF each' },
  { id: 'coord', name: 'Coordination', short: 'COORD', desc: '+0.5% dodge, +0.2% crit each' },
  { id: 'quick', name: 'Quickness', short: 'QUICK', desc: '+4% attack speed each' },
  { id: 'focus', name: 'Focus', short: 'FOCUS', desc: 'Life Magic (coming soon)' },
  { id: 'self', name: 'Self', short: 'SELF', desc: 'Mana (coming soon)' },
];

export function xpForLevel(level) {
  return Math.floor(16 * Math.pow(level, 1.7));
}

// Aggregate all percentage/flat bonuses from equipment affixes, training, and rebirth upgrades.
export function getBonuses(state) {
  const b = { atkPct: 0, hpFlat: 0, hpPct: 0, goldPct: 0, xpPct: 0, critPct: 0, luckPct: 0, weaponAtk: 0, armorDef: 0, startStats: 0 };

  for (const slot of Object.keys(state.equipment)) {
    const item = state.equipment[slot];
    if (!item) continue;
    if (slot === 'weapon') b.weaponAtk += item.power;
    if (slot === 'armor') {
      b.armorDef += Math.floor(item.power * 0.6);
      b.hpFlat += item.power * 2;
    }
    for (const affix of item.affixes) {
      b[affix.id] = (b[affix.id] || 0) + affix.value;
    }
  }

  b.atkPct += state.training.atk * 6;
  b.hpPct += state.training.hp * 8;
  b.goldPct += state.training.gold * 5;

  for (const up of REBIRTH_UPGRADES) {
    const rank = state.rebirth.upgrades[up.id] || 0;
    if (rank === 0) continue;
    for (const [key, val] of Object.entries(up.effectPerRank)) {
      b[key] = (b[key] || 0) + val * rank;
    }
  }

  return b;
}

export function derivedStats(state) {
  const h = state.hero;
  const b = getBonuses(state);
  const maxHp = Math.floor((20 + h.end * 5 + b.hpFlat) * (1 + b.hpPct / 100));
  const atk = Math.floor((3 + h.str * 1.5 + b.weaponAtk) * (1 + b.atkPct / 100));
  const def = Math.floor(h.end * 0.5 + b.armorDef);
  const spd = 1 + h.quick * 0.04; // attacks per second
  const dodge = h.coord * 0.5; // percent chance to avoid a monster hit
  const critChance = 5 + h.coord * 0.2 + b.critPct; // percent
  return {
    maxHp,
    atk,
    def,
    spd,
    dodge,
    critChance,
    xpPct: b.xpPct,
    goldPct: b.goldPct,
    luckPct: b.luckPct,
  };
}

// Grant XP, applying multiplier and handling multiple level-ups. Returns levels gained.
export function grantXp(state, amount) {
  const mult = 1 + derivedStats(state).xpPct / 100;
  state.hero.xp += Math.round(amount * mult);
  let levels = 0;
  while (state.hero.xp >= xpForLevel(state.hero.level)) {
    state.hero.xp -= xpForLevel(state.hero.level);
    state.hero.level += 1;
    state.hero.statPoints += 3;
    levels += 1;
  }
  return levels;
}

export function allocateStat(state, stat) {
  if (state.hero.statPoints <= 0 || !ATTRIBUTES.some((a) => a.id === stat)) return false;
  state.hero.statPoints -= 1;
  state.hero[stat] += 1;
  return true;
}

// Average hero damage per second against a target with `def` defense — used by offline sim.
export function heroDps(state, targetDef) {
  const d = derivedStats(state);
  const perHit = Math.max(1, d.atk - targetDef);
  const withCrit = perHit * (1 + (d.critChance / 100) * 1.0); // crit = 2x => +100% on crit chance
  return withCrit * d.spd;
}
