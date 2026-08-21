// Item definitions: slots, rarities, affix tables, name generation. Pure data + helpers.

export const SLOTS = ['weapon', 'armor', 'amulet', 'ring'];

export const RARITIES = [
  { name: 'Common', weight: 100, powerMult: 1.0, affixes: 0 },
  { name: 'Uncommon', weight: 45, powerMult: 1.25, affixes: 1 },
  { name: 'Rare', weight: 18, powerMult: 1.6, affixes: 2 },
  { name: 'Epic', weight: 6, powerMult: 2.1, affixes: 3 },
  { name: 'Legendary', weight: 1.5, powerMult: 2.8, affixes: 3 },
];

export const AFFIXES = [
  { id: 'atkPct', label: (v) => `+${v}% ATK`, min: 4, max: 12 },
  { id: 'hpFlat', label: (v) => `+${v} Max HP`, min: 4, max: 16 },
  { id: 'pyrealsPct', label: (v) => `+${v}% Pyreals`, min: 5, max: 15 },
  { id: 'xpPct', label: (v) => `+${v}% XP`, min: 5, max: 15 },
  { id: 'critPct', label: (v) => `+${v}% Crit`, min: 2, max: 6 },
];

export const BASE_NAMES = {
  weapon: ['Sword', 'Axe', 'Mace', 'Spear', 'Dagger', 'Staff', 'Bow', 'Crossbow'],
  armor: ['Leather Armor', 'Studded Leather', 'Chainmail', 'Plate Armor', 'Covenant Armor'],
  amulet: ['Amulet', 'Necklace', 'Pendant', 'Talisman'],
  ring: ['Ring', 'Band', 'Signet', 'Loop'],
};

export const PREFIXES = {
  Common: ['Worn', 'Plain', 'Sturdy'],
  Uncommon: ['Fine', 'Keen', 'Gleaming'],
  Rare: ['Masterwork', 'Runed', 'Superior'],
  Epic: ['Dread', 'Radiant', 'Ancient'],
  Legendary: ['Peerless', 'Dawnborn', 'Kingsfall', 'Everlasting'],
};

// Base power a drop of a given zone has, before rarity multiplier.
// Weapons convert power to ATK; armor to DEF + HP; amulet/ring lean on affixes.
export function zoneItemPower(zoneIndex) {
  return 2 + zoneIndex * 3;
}
