// Item spells: AC-flavored, leveled (1-8) bonuses that replace the old flat
// "+8% ATK" affix system. A spell's level is what scales its magnitude and
// what makes high-level ones rare/late-game (see `spellLevelCeiling`).

import { DAMAGE_TYPES } from './regions.js';
import { ARMOR_SLOTS, UNDERCLOTHING_SLOTS } from './items.js';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const MAX_SPELL_LEVEL = 10;

// How high a spell can roll here: driven by how deep into a POI's waves the drop
// happened (0 to ~1.1, see game/waves.js waveDifficulty) and how far out the
// region is (regionIndex, see data/regions.js).
export function spellLevelCeiling(depth, regionIndex) {
  return Math.max(1, Math.min(MAX_SPELL_LEVEL, 1 + regionIndex * 2 + Math.floor(depth * 4)));
}

// Weighted toward the low end so even a high ceiling mostly rolls modest
// levels, with an occasional near-max spell.
export function rollSpellLevel(ceiling) {
  const t = Math.pow(Math.random(), 2);
  return Math.max(1, Math.min(ceiling, 1 + Math.floor(t * ceiling)));
}

// Every attribute, skill and mitigation spell is worth this much per level.
export const PER_LEVEL = 5;

// The attributes an item can raise, and what to call the spell that does it.
export const ATTRIBUTE_NAMES = {
  str: 'Strength',
  end: 'Endurance',
  coord: 'Coordination',
  quick: 'Quickness',
  focus: 'Focus',
  self: 'Self',
};

// The skills an item can raise ranks in. Deliberately the combat ones only —
// a ring that makes you better at Fishing is a different kind of item.
export const BUFFABLE_SKILL_NAMES = {
  unarmed: 'Unarmed',
  sword: 'Sword',
  axe: 'Axe',
  mace: 'Mace',
  spear: 'Spear',
  bow: 'Bow',
  crossbow: 'Crossbow',
  war: 'War Magic',
  dodge: 'Dodge',
  block: 'Block',
  parry: 'Parry',
  magicResistance: 'Magic Resistance',
};

function pickKey(table) {
  const keys = Object.keys(table);
  return keys[Math.floor(Math.random() * keys.length)];
}

function magnitude(level, perLevel, base = 0) {
  const jitter = 0.9 + Math.random() * 0.2;
  return Math.max(1, Math.round((base + level * perLevel) * jitter));
}

// One spell definition per bonus type. `roll(level)` returns { value, meta? }
// and `effectLabel(value, meta)` renders the mechanical text.
const DEFS = {
  armor: {
    name: 'Aegis',
    roll: (level) => ({ value: magnitude(level, 3) }),
    effectLabel: (v) => `+${v} Armor`,
    bonusKey: () => 'armorFlat',
  },
  flatDamage: {
    name: 'Brutality',
    roll: (level) => ({ value: magnitude(level, 2) }),
    effectLabel: (v) => `+${v} ATK`,
    bonusKey: () => 'atkFlat',
  },
  atkPct: {
    name: 'Fury',
    roll: (level) => ({ value: magnitude(level, 2) }),
    effectLabel: (v) => `+${v}% ATK`,
    bonusKey: () => 'atkPct',
  },
  // --- The three families an item's own spells come from. Every one of them is
  // an exact multiple of five per level — no jitter — so a "Strength V" is worth
  // the same +25 wherever it turns up, and a level 1 is a real, readable +5. ---

  attribute: {
    name: null, // named for whichever attribute it rolled
    roll: (level) => ({ value: level * PER_LEVEL, meta: { attr: pickKey(ATTRIBUTE_NAMES) } }),
    effectLabel: (v, meta) => `+${v} ${ATTRIBUTE_NAMES[meta.attr]}`,
    bonusKey: (meta) => `attrBonus.${meta.attr}`,
    displayName: (meta) => ATTRIBUTE_NAMES[meta.attr],
  },
  skillRank: {
    name: null, // named for whichever skill it rolled
    roll: (level) => ({ value: level * PER_LEVEL, meta: { skill: pickKey(BUFFABLE_SKILL_NAMES) } }),
    effectLabel: (v, meta) => `+${v} ${BUFFABLE_SKILL_NAMES[meta.skill]}`,
    bonusKey: (meta) => `skillRankBonus.${meta.skill}`,
    displayName: (meta) => BUFFABLE_SKILL_NAMES[meta.skill],
  },
  mitigation: {
    name: null, // named for whichever damage type it rolled
    roll: (level) => ({ value: level * PER_LEVEL, meta: { dmgType: DAMAGE_TYPES[Math.floor(Math.random() * DAMAGE_TYPES.length)] } }),
    effectLabel: (v, meta) => `+${v}% ${cap(meta.dmgType)} Resistance`,
    bonusKey: (meta) => `resistanceBonus.${meta.dmgType}`,
    displayName: (meta) => `${cap(meta.dmgType)} Ward`,
  },
  pyrealsPct: {
    name: 'Fortune',
    roll: (level) => ({ value: magnitude(level, 2.5) }),
    effectLabel: (v) => `+${v}% Pyreals`,
    bonusKey: () => 'pyrealsPct',
  },
  xpPct: {
    name: 'Wisdom',
    roll: (level) => ({ value: magnitude(level, 2.5) }),
    effectLabel: (v) => `+${v}% XP`,
    bonusKey: () => 'xpPct',
  },
  critPct: {
    name: 'Precision',
    roll: (level) => ({ value: magnitude(level, 1) }),
    effectLabel: (v) => `+${v}% Crit`,
    bonusKey: () => 'critPct',
  },
  maxManaFlat: {
    name: 'Clarity',
    roll: (level) => ({ value: magnitude(level, 4) }),
    effectLabel: (v) => `+${v} Max Mana`,
    bonusKey: () => 'maxManaFlat',
  },

  // --- Properties Tinkering works into a weapon (see data/tinkering.js) ---
  //
  // These behave differently from the affixes above in two ways. They're exact:
  // no jitter, because Tinkering is a decision and you should know what you're
  // buying before you spend the material. And they're mild — a single pass is a
  // small nudge, and even ten passes is a modest, steady weapon rather than a
  // different weapon. What makes them worth it is that you choose them.
  //
  // Alacrity is deliberately the strongest of them: attack speed on a weapon was
  // never worth chasing in Asheron's Call, and it should be here. At its
  // ceiling it takes a 4.0s Devastating swing down to 3.0s.

  weaponDamage: {
    name: 'Keenness',
    roll: (level) => ({ value: level * 1 }),
    effectLabel: (v) => `+${v} ATK`,
    bonusKey: () => 'atkFlat',
  },
  magicDamage: {
    name: 'Channeling',
    roll: (level) => ({ value: level * 1 }),
    effectLabel: (v) => `+${v} Magic ATK`,
    bonusKey: () => 'magicAtkFlat',
  },
  hitChance: {
    name: 'Accuracy',
    roll: (level) => ({ value: level * 1.5 }),
    effectLabel: (v) => `+${v}% to hit`,
    bonusKey: () => 'hitChancePct',
  },
  attackSpeed: {
    name: 'Alacrity',
    roll: (level) => ({ value: level * 2.5 }),
    effectLabel: (v) => `${v}% faster attacks`,
    bonusKey: () => 'attackSpeedPct',
  },
  spellEfficiency: {
    name: 'Frugality',
    roll: (level) => ({ value: level * 1.5 }),
    effectLabel: (v) => `-${v}% mana per cast`,
    bonusKey: () => 'manaCostPct',
  },
  minDamage: {
    name: 'Tempering',
    roll: (level) => ({ value: level * 7 }),
    effectLabel: (v) => `+${v}% toward your best hit`,
    bonusKey: () => 'minDamagePct',
  },
  evasion: {
    name: 'Evasion',
    roll: (level) => ({ value: level * 1 }),
    effectLabel: (v) => `+${v}% Dodge`,
    bonusKey: () => 'dodgeBonus',
  },
  guard: {
    // A melee fighter is the only one who can actually use all three defensive
    // layers — Block wants a shield and Parry wants a melee weapon — so brass
    // worked into a melee weapon feeds every one of them.
    name: 'Guard',
    roll: (level) => ({ value: level * 1 }),
    effectLabel: (v) => `+${v}% Dodge, Block and Parry`,
    bonusKey: () => ['dodgeBonus', 'blockBonus', 'parryBonus'],
  },
};

function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}

// Which spell ids a given equipment slot can roll.
// Which spell ids a given equipment slot can roll. Every slot reaches the
// attribute family, so there's always enough variety to fill an orange's five
// slots with five different things. The scaling damage affixes stay on weapons
// on purpose: they multiply the flat ATK that Tinkering adds, which is what
// makes a spell-rich weapon the one worth working on.
export const SPELL_IDS_FOR_SLOT = {
  weapon: ['attribute', 'skillRank', 'flatDamage', 'atkPct'],
  shield: ['attribute', 'mitigation', 'armor'],
  amulet: ['attribute', 'skillRank', 'mitigation', 'pyrealsPct', 'xpPct', 'critPct', 'maxManaFlat'],
  bracelet: ['attribute', 'skillRank', 'mitigation', 'pyrealsPct', 'xpPct', 'critPct', 'maxManaFlat'],
  ring: ['attribute', 'skillRank', 'mitigation', 'pyrealsPct', 'xpPct', 'critPct', 'maxManaFlat'],
};
// Every piece of armor rolls from the same pool.
for (const slot of ARMOR_SLOTS) SPELL_IDS_FOR_SLOT[slot] = ['attribute', 'mitigation', 'armor'];
// Underclothing turns nothing, so it never rolls Aegis — enchantment is the
// whole reason to wear a particular shirt.
for (const slot of UNDERCLOTHING_SLOTS) SPELL_IDS_FOR_SLOT[slot] = ['attribute', 'skillRank', 'mitigation'];

// Rolls one full spell instance of a named id: { id, name, level, value, meta,
// label }. Used where the caller already knows what it wants — Tinkering's
// recipes name a specific property rather than rolling for one.
export function rollSpellById(id, level) {
  const def = DEFS[id];
  if (!def) return null;
  const { value, meta = {} } = def.roll(level);
  const name = def.name || (def.displayName ? def.displayName(meta) : id);
  return {
    id,
    name,
    level,
    value,
    meta,
    label: `${name} ${ROMAN[level]} (${def.effectLabel(value, meta)})`,
  };
}

// Rolls one full spell instance for the given slot, picking a random applicable
// spell id for that slot.
export function rollSpell(slot, level) {
  const ids = SPELL_IDS_FOR_SLOT[slot] || [];
  if (ids.length === 0) return null;
  const id = ids[Math.floor(Math.random() * ids.length)];
  const def = DEFS[id];
  const { value, meta = {} } = def.roll(level);
  const name = def.name || (def.displayName ? def.displayName(meta) : id);
  return {
    id,
    name,
    level,
    value,
    meta,
    label: `${name} ${ROMAN[level]} (${def.effectLabel(value, meta)})`,
  };
}

// Which keys in hero.js's bonus accumulator a spell instance feeds. Always an
// array — most spells feed exactly one, but a few (Guard) feed several. Supports
// dotted paths for nested bonuses (e.g. "resistanceBonus.fire").
export function spellBonusKeys(spell) {
  const keys = DEFS[spell.id].bonusKey(spell.meta || {});
  return Array.isArray(keys) ? keys : [keys];
}
