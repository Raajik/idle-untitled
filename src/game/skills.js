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
import { ATTRIBUTES } from './hero.js';

export const MAX_SKILL_RANK = 100;
// Walking is effortless and Athletics is the skill that shortens walking, so a
// generous rate here compounds: it used to out-train every combat skill and let a
// single long haul between regions jump Athletics ~10 ranks on its own. Kept just
// under the rate a fight trains a weapon skill at.
export const ATHLETICS_XP_PER_SECOND = 1.5;
export const COMBAT_SKILL_XP = 1; // xp granted to a combat skill per attack faced/thrown

// Attribute-xp grants: attributes level up from actions the same way skills do,
// reusing xpToNextRank's curve (offset so a fresh hero's first point costs the
// same as a skill's first rank-up). See trainAttribute below.
export const MELEE_ATTR_XP = 1; // STR/COORD/QUICK per melee swing attempt
export const ARCHERY_COORD_XP = 5; // COORD per archery attack attempt (much more than melee)
export const MAGIC_ATTR_XP = 1; // FOCUS/SELF per cast attempt
export const DEFEND_SUCCESS_ATTR_XP = 2; // Dodge/Block/Parry attribute grants
export const MAGIC_RESIST_ATTR_XP = 3; // FOCUS/SELF per Magic Resistance proc
export const HIT_TAKEN_END_XP = 1; // END per landed hit
export const DEATH_END_XP = 15; // additional END on death, on top of the hit's own grant
export const SALVAGE_ATTR_XP = { str: 3, coord: 2, focus: 2 };
export const SALVAGE_SKILL_XP = 6; // Salvaging, per item broken down
export const TINKER_ATTR_XP = { coord: 2, focus: 2 };
export const QUICK_XP_PER_ATHLETICS_SECOND = 0.4; // same ~1/4 ratio to ATHLETICS_XP_PER_SECOND
export const JUMP_QUICK_XP_ON_USE = 4; // scaled down from JUMP_XP_ON_USE, same ratio

// Melee weapons (and bare fists) train their own skill; Bow/Crossbow are Ranged.
// War Magic governs the Magic attack bar (Arc/Volley/Streak — see
// data/combatStances.js) and is fully playable; Life/Void Magic are latent
// until non-combat spellcasting (heals, debuffs) lands.
export const OFFENSE_SKILLS = [
  { key: 'unarmed', label: 'Unarmed', category: 'Melee' },
  { key: 'sword', label: 'Sword', category: 'Melee' },
  { key: 'spear', label: 'Spear', category: 'Melee' },
  { key: 'axe', label: 'Axe', category: 'Melee' },
  { key: 'mace', label: 'Mace', category: 'Melee' },
  { key: 'life', label: 'Life Magic', category: 'Magic', comingSoon: true },
  { key: 'war', label: 'War Magic', category: 'Magic' },
  { key: 'void', label: 'Void Magic', category: 'Magic', comingSoon: true },
  { key: 'bow', label: 'Bow', category: 'Ranged' },
  { key: 'crossbow', label: 'Crossbow', category: 'Ranged' },
];

export const MELEE_WEAPON_BASE_TYPES = ['sword', 'spear', 'axe', 'mace'];
// Casting devices all channel War Magic — the device shapes how well, not which
// skill (see data/items.js WEAPON_CLASSES).
const WEAPON_BASE_TO_SKILL = {
  sword: 'sword', spear: 'spear', axe: 'axe', mace: 'mace',
  bow: 'bow', crossbow: 'crossbow',
  wand: 'war', orb: 'war', staff: 'war',
};

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

export const ATTRIBUTE_BASE = 1; // attributes start at 1 — treat that as "rank 0" for the shared curve
const ATTR_BASE_VALUE = ATTRIBUTE_BASE;

export function xpToNextAttrPoint(value) {
  return xpToNextRank(Math.max(0, value - ATTR_BASE_VALUE));
}

// Adds xp to an attribute (a plain int on state.hero), no cap, logging on each point gained.
export function trainAttribute(state, attrId, xp) {
  const h = state.hero;
  h.attrXp[attrId] += xp;
  let leveled = false;
  while (h.attrXp[attrId] >= xpToNextAttrPoint(h[attrId])) {
    h.attrXp[attrId] -= xpToNextAttrPoint(h[attrId]);
    h[attrId] += 1;
    leveled = true;
  }
  if (leveled) {
    const meta = ATTRIBUTES.find((a) => a.id === attrId);
    addLog(state, `${meta.name} increased to ${h[attrId]}.`, 'good');
  }
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
  trainAttribute(state, 'quick', seconds * QUICK_XP_PER_ATHLETICS_SECOND);
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
