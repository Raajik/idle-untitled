// Skills: every skill (Athletics, the defensives, the offensives, gathering,
// Tinkering) shares one rank/xp shape and one xp curve, capped at rank 100.
// Athletics is trained by walking; it shrinks travel time and powers Jump
// (instant shortcut relocation). The defensives avoid an incoming hit (capped
// at 95% at rank 100) — except Resistance, which instead *mitigates* damage
// by a percentage (same curve, different meaning). Offense skills govern how
// often the hero's own attacks connect (starting well below even odds,
// capped at 95% at rank 100) — see `defensiveChance` / `resistanceMitigationPct`
// / `hitChance`.

import { addLog } from './state.js';

export const MAX_SKILL_RANK = 100;
export const ATHLETICS_XP_PER_SECOND = 4;
export const COMBAT_SKILL_XP = 1; // xp granted to a combat skill per attack faced/thrown

// Melee weapons (and bare fists) train their own skill; Bow/Crossbow are Ranged;
// the Magic skills aren't tied to a weapon yet (no spellcasting system exists).
export const OFFENSE_SKILLS = [
  { key: 'unarmed', label: 'Unarmed', category: 'Melee' },
  { key: 'sword', label: 'Sword', category: 'Melee' },
  { key: 'spear', label: 'Spear', category: 'Melee' },
  { key: 'axe', label: 'Axe', category: 'Melee' },
  { key: 'mace', label: 'Mace', category: 'Melee' },
  { key: 'life', label: 'Life Magic', category: 'Magic', comingSoon: true },
  { key: 'war', label: 'War Magic', category: 'Magic', comingSoon: true },
  { key: 'void', label: 'Void Magic', category: 'Magic', comingSoon: true },
  { key: 'bow', label: 'Bow', category: 'Ranged' },
  { key: 'crossbow', label: 'Crossbow', category: 'Ranged' },
];

export const MELEE_WEAPON_BASE_TYPES = ['sword', 'spear', 'axe', 'mace'];
const WEAPON_BASE_TO_SKILL = { sword: 'sword', spear: 'spear', axe: 'axe', mace: 'mace', bow: 'bow', crossbow: 'crossbow' };

// Gathering skills, in the order they're listed in the Skills tab.
export const GATHERING_SKILLS = [
  { key: 'mining', label: 'Mining' },
  { key: 'foraging', label: 'Foraging' },
  { key: 'woodcutting', label: 'Woodcutting' },
  { key: 'fishing', label: 'Fishing' },
  { key: 'skinning', label: 'Skinning' },
];

export function xpToNextRank(rank) {
  return Math.ceil(18 * Math.pow(rank + 1, 1.55));
}

// Base walk time shrinks toward ~10% of base as Athletics approaches rank 100.
export function modifiedWalkTime(baseSeconds, athleticsRank) {
  return Math.max(3, (baseSeconds * 100) / (100 + athleticsRank * 9));
}

// Chance (%) a defensive skill (Dodge/Block/Parry) fully avoids an attack.
// Concave: fast early gains, long tail up to the 95% cap at rank 100.
export function defensiveChance(rank) {
  const r = Math.max(0, Math.min(MAX_SKILL_RANK, rank));
  return 95 * Math.pow(r / MAX_SKILL_RANK, 0.7);
}

// Resistance doesn't avoid a hit — it reduces the damage of one that connects,
// by this percentage. Same curve shape/cap as defensiveChance, different job.
export function resistanceMitigationPct(rank) {
  return defensiveChance(rank);
}

// Chance (%) an attack connects at all, given the wielder's relevant offense skill.
// Starts at even odds (lots of misses on an untrained skill) and climbs to 95%.
export function hitChance(rank) {
  const r = Math.max(0, Math.min(MAX_SKILL_RANK, rank));
  return 50 + 45 * Math.pow(r / MAX_SKILL_RANK, 0.7);
}

// Which offense skill governs the hero's current attacks, and its rank.
export function activeWeaponSkill(state) {
  const weapon = state.equipment.weapon;
  const key = weapon && weapon.baseType ? WEAPON_BASE_TO_SKILL[weapon.baseType] || 'unarmed' : 'unarmed';
  const meta = OFFENSE_SKILLS.find((s) => s.key === key);
  return { key, label: meta.label, skill: state.hero.skills.offense[key], weaponName: weapon ? weapon.name : null };
}

// Adds xp to any {rank, xp} skill object, capped at MAX_SKILL_RANK, logging rank-ups.
export function trainSkill(state, skill, name, xp) {
  if (skill.rank >= MAX_SKILL_RANK) return;
  skill.xp += xp;
  let leveled = false;
  while (skill.rank < MAX_SKILL_RANK && skill.xp >= xpToNextRank(skill.rank)) {
    skill.xp -= xpToNextRank(skill.rank);
    skill.rank += 1;
    leveled = true;
  }
  if (skill.rank >= MAX_SKILL_RANK) skill.xp = 0;
  if (leveled) addLog(state, `${name} increased to ${skill.rank}.`, 'good');
}

export function grantAthleticsXp(state, seconds) {
  trainSkill(state, state.hero.skills.athletics, 'Athletics', seconds * ATHLETICS_XP_PER_SECOND);
}

// Jump (shortcuts): instant relocation between two linked POIs, gated by a
// cooldown that shrinks from 1 hour toward 5 minutes as Athletics ranks up —
// same shape as Recall's cooldown.
export const JUMP_XP_ON_USE = 15;

export function jumpCooldownSeconds(athleticsRank) {
  return Math.max(300, (3600 * 100) / (100 + athleticsRank * 11));
}

// Lifestone Recall: instant travel to any unlocked Lifestone, gated by a cooldown
// that shrinks from 1 hour toward 5 minutes as the skill ranks up.
export const RECALL_XP_ON_USE = 40;
export const RECALL_XP_ON_DEATH = 3;

export function recallCooldownSeconds(rank) {
  return Math.max(300, (3600 * 100) / (100 + rank * 11));
}
