// Hero stats: Asheron's Call six attributes -> derived combat stats.
// Strength / Endurance / Coordination / Quickness drive melee combat;
// Focus (Life Magic) and Self (mana) are latent until the skill system lands.
//
// Attributes are raised by spending XP (AC-style) with a power-2.5 cost curve.
// Character level is derived from total XP earned this run, using AC's cubic curve.

import { REBIRTH_UPGRADES } from '../data/rebirth.js';

export const ATTRIBUTES = [
  { id: 'str', name: 'Strength', short: 'STR', desc: '+1.5 ATK each' },
  { id: 'end', name: 'Endurance', short: 'END', desc: '+5 Max HP, +0.5 DEF, +2 Max Stamina each' },
  { id: 'coord', name: 'Coordination', short: 'COORD', desc: '+0.5% dodge, +0.2% crit each' },
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

// --- Attribute raising (AC-style: spend XP, escalating cost ~ value^2.5) ---

export function attributeCost(value) {
  return Math.ceil(0.025 * Math.pow(value, 2.5));
}

export function raiseAttribute(state, attr) {
  if (!ATTRIBUTES.some((a) => a.id === attr)) return false;
  const cost = attributeCost(state.hero[attr]);
  if (state.hero.xp < cost) return false;
  state.hero.xp -= cost;
  state.hero[attr] += 1;
  return true;
}

// Aggregate all percentage/flat bonuses from equipment affixes, training, and rebirth upgrades.
export function getBonuses(state) {
  const b = { atkPct: 0, hpFlat: 0, hpPct: 0, pyrealsPct: 0, xpPct: 0, critPct: 0, luckPct: 0, weaponAtk: 0, armorDef: 0, startStats: 0 };

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
  b.pyrealsPct += state.training.pyreals * 5;

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
  const maxStamina = Math.floor(20 + h.end * 2 + h.quick * 2);
  const maxMana = Math.floor(20 + h.self * 4);
  return {
    maxHp,
    atk,
    def,
    spd,
    dodge,
    critChance,
    maxStamina,
    maxMana,
    xpPct: b.xpPct,
    pyrealsPct: b.pyrealsPct,
    luckPct: b.luckPct,
  };
}

// Grant XP: adds to the spendable pool AND the run's total (which drives level).
// Returns the number of levels gained.
export function grantXp(state, amount) {
  const mult = 1 + derivedStats(state).xpPct / 100;
  const gained = Math.round(amount * mult);
  state.hero.xp += gained;
  state.progress.totalXpEarned += gained;
  const newLevel = levelFromTotalXp(state.progress.totalXpEarned);
  const levels = newLevel - state.hero.level;
  state.hero.level = newLevel;
  return levels;
}

// Average hero damage per second against a target with `def` defense — used by offline sim.
export function heroDps(state, targetDef) {
  const d = derivedStats(state);
  const perHit = Math.max(1, d.atk - targetDef);
  const withCrit = perHit * (1 + (d.critChance / 100) * 1.0); // crit = 2x => +100% on crit chance
  return withCrit * d.spd;
}
