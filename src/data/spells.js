// Item spells: AC-flavored, leveled (1-8) bonuses that replace the old flat
// "+8% ATK" affix system. A spell's level is what scales its magnitude and
// what makes high-level ones rare/late-game (see `spellLevelCeiling`).

import { DAMAGE_TYPES } from './regions.js';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
export const MAX_SPELL_LEVEL = 8;

// How high a spell can roll here: driven by POI depth (0-3, see game/combat.js
// computeDepth) and how far out the region is (regionIndex, see data/regions.js).
export function spellLevelCeiling(depth, regionIndex) {
  return Math.max(1, Math.min(MAX_SPELL_LEVEL, 1 + regionIndex * 2 + Math.floor(depth * 2)));
}

// Weighted toward the low end so even a high ceiling mostly rolls modest
// levels, with an occasional near-max spell.
export function rollSpellLevel(ceiling) {
  const t = Math.pow(Math.random(), 2);
  return Math.max(1, Math.min(ceiling, 1 + Math.floor(t * ceiling)));
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
  defensiveBoost: {
    name: null, // named per-roll below, since it depends on which skill it picked
    roll: (level) => {
      const options = ['dodge', 'block', 'parry', 'magicResistance', 'resistance'];
      const skill = options[Math.floor(Math.random() * options.length)];
      const meta = skill === 'resistance' ? { skill, dmgType: DAMAGE_TYPES[Math.floor(Math.random() * DAMAGE_TYPES.length)] } : { skill };
      return { value: magnitude(level, 2), meta };
    },
    effectLabel: (v, meta) =>
      meta.skill === 'resistance'
        ? `+${v}% ${cap(meta.dmgType)} Resistance`
        : `+${v}% ${meta.skill === 'magicResistance' ? 'Magic Resistance' : cap(meta.skill)}`,
    bonusKey: (meta) => (meta.skill === 'resistance' ? `resistanceBonus.${meta.dmgType}` : `${meta.skill}Bonus`),
    displayName: (meta) =>
      meta.skill === 'resistance'
        ? { dodge: 'Swiftness', block: 'Bulwark', parry: 'Riposte', magicResistance: 'Runeward' }[meta.skill] || `${cap(meta.dmgType)} Ward`
        : { dodge: 'Swiftness', block: 'Bulwark', parry: 'Riposte', magicResistance: 'Runeward' }[meta.skill],
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
};

function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}

// Which spell ids a given equipment slot can roll.
export const SPELL_IDS_FOR_SLOT = {
  weapon: ['flatDamage', 'atkPct', 'defensiveBoost'],
  armor: ['armor'],
  shield: ['armor'],
  amulet: ['pyrealsPct', 'xpPct', 'critPct', 'maxManaFlat'],
  ring: ['pyrealsPct', 'xpPct', 'critPct', 'maxManaFlat'],
};

// Rolls one full spell instance for the given slot: { id, name, level, value,
// meta, label }. Picks a random applicable spell id for that slot.
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

// Which key in hero.js's bonus accumulator a spell instance feeds. Supports
// dotted paths for nested bonuses (e.g. "resistanceBonus.fire").
export function spellBonusKey(spell) {
  return DEFS[spell.id].bonusKey(spell.meta || {});
}
