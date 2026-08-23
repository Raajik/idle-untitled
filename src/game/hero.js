// Hero stats: Asheron's Call six attributes -> derived combat stats.
//
// Attributes level up naturally from actions (melee/archery/magic attacks,
// dodging/blocking/parrying, salvaging, tinkering, taking hits, dying — see
// trainAttribute in skills.js for the mechanism and combat.js/loot.js/
// tinkering.js for the call sites), the same way skills already do.
// Character level is derived from total XP earned this run, using AC's cubic curve.

import { ENLIGHTENMENT_UPGRADES } from '../data/enlightenment.js';
import { heroBuildingBonuses } from '../data/buildings.js';
import { achievementBonuses } from '../data/achievements.js';
import { spellBonusKey } from '../data/spells.js';
import { vitaeMultiplier, workOffVitae } from './vitae.js';

export const ATTRIBUTES = [
  { id: 'str', name: 'Strength', short: 'STR', desc: '+1.5 ATK each' },
  { id: 'end', name: 'Endurance', short: 'END', desc: '+5 Max HP, +0.5 DEF, +2 Max Stamina each' },
  { id: 'coord', name: 'Coordination', short: 'COORD', desc: '+0.2% crit each' },
  { id: 'quick', name: 'Quickness', short: 'QUICK', desc: '+4% attack speed, +2 Max Stamina each' },
  { id: 'focus', name: 'Focus', short: 'FOCUS', desc: 'Life Magic (coming soon)' },
  { id: 'self', name: 'Self', short: 'SELF', desc: '+4 Max Mana each' },
];

// --- Experience / level (AC-flavored cubic curve, scaled down for small numbers) ---

// XP required to advance from `level` to `level + 1`.
export function xpForLevel(level) {
  return 8 * level * level * level;
}

// Cumulative XP required to REACH `level` (sum of the per-level steps below it).
export function totalXpForLevel(level) {
  const n = level - 1;
  const s = (n * (n + 1)) / 2; // 1 + 2 + ... + n
  return Math.floor(8 * s * s);
}

// Character level derived from total XP earned this run.
export function levelFromTotalXp(xp) {
  let level = 1;
  while (xp >= totalXpForLevel(level + 1)) level += 1;
  return level;
}

// Aggregate all percentage/flat bonuses from item spells, training, unlocked town
// buildings, and enlightenment upgrades.
export function getBonuses(state) {
  const b = {
    atkPct: 0, atkFlat: 0, hpFlat: 0, hpPct: 0, pyrealsPct: 0, xpPct: 0, critPct: 0, luckPct: 0,
    weaponAtk: 0, armorDef: 0, armorFlat: 0, maxManaFlat: 0, startStats: 0,
    hpRegenFlat: 0, staminaRegenFlat: 0, manaRegenFlat: 0,
    dodgeBonus: 0, blockBonus: 0, parryBonus: 0, magicResistanceBonus: 0, resistanceBonus: {},
  };

  for (const slot of Object.keys(state.equipment)) {
    const item = state.equipment[slot];
    if (!item) continue;
    if (slot === 'weapon') b.weaponAtk += item.power;
    if (slot === 'armor') {
      b.armorDef += Math.floor(item.power * 0.6);
      b.hpFlat += item.power * 2;
    }
    if (slot === 'shield') b.armorDef += Math.floor(item.power * 0.5);
    for (const spell of item.spells) {
      const key = spellBonusKey(spell);
      if (key.includes('.')) {
        const [outer, inner] = key.split('.');
        b[outer][inner] = (b[outer][inner] || 0) + spell.value;
      } else {
        b[key] = (b[key] || 0) + spell.value;
      }
    }
  }

  b.atkPct += state.training.atk * 6;
  b.hpPct += state.training.hp * 8;
  b.pyrealsPct += state.training.pyreals * 5;

  for (const [key, val] of Object.entries(heroBuildingBonuses(state))) {
    b[key] = (b[key] || 0) + val;
  }

  for (const [key, val] of Object.entries(achievementBonuses(state))) {
    b[key] = (b[key] || 0) + val;
  }

  for (const up of ENLIGHTENMENT_UPGRADES) {
    const rank = state.enlightenment.upgrades[up.id] || 0;
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
  // Vitae diminishes the body and what it can do with a weapon: the pools you
  // fight out of, and the numbers you hit and soak with. Deliberately NOT attack
  // speed or crit — being weakened should cost you power, not turn the fight
  // into slow motion, which at the 40% floor would be miserable to watch.
  const vitae = vitaeMultiplier(state);
  const maxHp = Math.floor((20 + h.end * 5 + b.hpFlat) * (1 + b.hpPct / 100) * vitae);
  const atk = Math.floor((3 + h.str * 1.5 + b.weaponAtk + b.atkFlat) * (1 + b.atkPct / 100) * vitae);
  const magicAtk = Math.floor((3 + h.focus * 1.5) * vitae); // Magic's own damage baseline, off Focus not Strength
  const def = Math.floor((h.end * 0.5 + b.armorDef + b.armorFlat) * vitae);
  const spd = 1 + h.quick * 0.04; // attacks per second
  const critChance = 5 + h.coord * 0.2 + b.critPct; // percent
  const maxStamina = Math.floor((20 + h.end * 2 + h.quick * 2) * vitae);
  const maxMana = Math.floor((20 + h.self * 4 + b.maxManaFlat) * vitae);
  return {
    maxHp,
    atk,
    magicAtk,
    def,
    spd,
    critChance,
    maxStamina,
    maxMana,
    hpRegenFlat: b.hpRegenFlat,
    staminaRegenFlat: b.staminaRegenFlat,
    manaRegenFlat: b.manaRegenFlat,
    xpPct: b.xpPct,
    pyrealsPct: b.pyrealsPct,
    luckPct: b.luckPct,
    dodgeBonus: b.dodgeBonus,
    blockBonus: b.blockBonus,
    parryBonus: b.parryBonus,
    magicResistanceBonus: b.magicResistanceBonus,
    resistanceBonus: b.resistanceBonus,
  };
}

// Grant XP: adds to the run's cumulative total, which drives character level.
// Returns the number of levels gained.
export function grantXp(state, amount) {
  const mult = 1 + derivedStats(state).xpPct / 100;
  const gained = Math.round(amount * mult);
  state.progress.totalXpEarned += gained;
  const newLevel = levelFromTotalXp(state.progress.totalXpEarned);
  const levels = newLevel - state.hero.level;
  state.hero.level = newLevel;
  workOffVitae(state, gained); // experience is the only thing that burns vitae off
  return levels;
}

// Average hero damage per second against a target with `def` defense — used by offline sim.
export function heroDps(state, targetDef) {
  const d = derivedStats(state);
  const perHit = Math.max(1, d.atk - targetDef);
  const withCrit = perHit * (1 + (d.critChance / 100) * 1.0); // crit = 2x => +100% on crit chance
  return withCrit * d.spd;
}
