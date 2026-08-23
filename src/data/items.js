// Item definitions: slots, rarities, affix tables, name generation. Pure data + helpers.

// Armor covers the body a piece at a time, the way Asheron's Call did it, so a
// full set is nine finds rather than one. Each piece is worth proportionally
// less than the single "armor" slot was — see ARMOR_HP_PER_POWER in game/hero.js
// — so a complete set lands in the same place the old single slot did instead of
// nine-timesing it.
export const ARMOR_SLOTS = [
  'head',
  'shoulder',
  'upperArm',
  'lowerArm',
  'hands',
  'chest',
  'abdomen',
  'upperLegs',
  'lowerLegs',
  'feet',
];

// A "kind" is what an item IS — a ring, a helm, a bow. Some kinds have more than
// one place to put them: you wear two rings and two bracelets. Items are rolled
// by kind (`item.slot` is always a kind), while `state.equipment` is keyed by
// slot instance, so a ring can go in either hand.
// Underclothing sits beneath the armor and turns none of it: no armor value, no
// health. What it does carry is enchantment, which makes a good shirt worth as
// much as a good ring and worth nothing at all to a smith.
export const UNDERCLOTHING_SLOTS = ['shirt', 'pants'];

export function isUnderclothing(slot) {
  return UNDERCLOTHING_SLOTS.includes(slot);
}

export const SLOTS = ['weapon', ...UNDERCLOTHING_SLOTS, ...ARMOR_SLOTS, 'shield', 'amulet', 'bracelet', 'ring'];

const SLOT_COUNTS = { bracelet: 2, ring: 2 };

// Every place something can be worn, in the order the paper doll shows them.
export const EQUIP_SLOTS = SLOTS.flatMap((kind) => {
  const count = SLOT_COUNTS[kind] || 1;
  return count === 1 ? [kind] : Array.from({ length: count }, (_, i) => `${kind}${i + 1}`);
});

// The kind a slot instance holds: 'ring2' -> 'ring'.
export function slotKind(equipSlot) {
  return equipSlot.replace(/\d+$/, '');
}

// Every instance that can hold this kind of item.
export function equipSlotsForKind(kind) {
  return EQUIP_SLOTS.filter((slot) => slotKind(slot) === kind);
}

// Slots always shown once Inventory unlocks.
export const STARTING_SLOTS = EQUIP_SLOTS;

// What to call each slot in the UI.
export const SLOT_LABELS = {
  weapon: 'Weapon',
  shirt: 'Shirt',
  pants: 'Pants',
  head: 'Head',
  shoulder: 'Shoulder',
  upperArm: 'Upper Arm',
  lowerArm: 'Lower Arm',
  hands: 'Hands',
  chest: 'Chest',
  abdomen: 'Abdomen',
  upperLegs: 'Upper Legs',
  lowerLegs: 'Lower Legs',
  feet: 'Feet',
  shield: 'Shield',
  amulet: 'Amulet',
  bracelet: 'Bracelet',
  ring: 'Ring',
};

export function isArmorSlot(slot) {
  return ARMOR_SLOTS.includes(slot);
}

// Hidden until progress.aetheriaSlots unlocks them — nothing drops these yet.
export const AETHERIA_SLOTS = ['aetheria1', 'aetheria2', 'aetheria3'];

// `spells` is the inclusive range of how many spells an item of this rarity rolls
// with — quality IS spell count. A white carries none; an orange carries four or
// five. Every rarity can drop anywhere: the weights make the good ones rare, not
// the location, so a level-1 dungeon can hand you an orange with five level-1
// spells on it. That's the jackpot, and it should be possible from the start.
export const RARITIES = [
  { name: 'Common', weight: 100, powerMult: 1.0, spells: [0, 0] },
  { name: 'Uncommon', weight: 45, powerMult: 1.25, spells: [1, 2] },
  { name: 'Rare', weight: 18, powerMult: 1.6, spells: [2, 3] },
  { name: 'Epic', weight: 6, powerMult: 2.1, spells: [3, 4] },
  { name: 'Legendary', weight: 1.5, powerMult: 2.8, spells: [4, 5] },
];

// Weapon base names double as their offensive skill key (lowercased) — see skills.js.
// Weapons come in three classes. Which one you're holding decides what your
// attacks cost and scale off (see game/combat.js), and which materials Tinkering
// will take for it (see data/tinkering.js).
export const WEAPON_CLASSES = {
  // Katars, cesti and nekode are melee weapons that train Unarmed — holding one
  // is closer to fighting bare-handed than to swinging a sword (see
  // data/weaponTraits.js UNARMED_WEAPONS).
  melee: ['sword', 'axe', 'mace', 'spear', 'katar', 'cestus', 'nekode'],
  ranged: ['bow', 'crossbow'],
  magic: ['wand', 'orb', 'staff'],
};

// The class of a weapon base type, or null for anything that isn't a weapon.
export function weaponClass(baseType) {
  if (!baseType) return null;
  for (const [cls, types] of Object.entries(WEAPON_CLASSES)) {
    if (types.includes(baseType)) return cls;
  }
  return null;
}

export const BASE_NAMES = {
  weapon: ['Sword', 'Axe', 'Mace', 'Spear', 'Katar', 'Cestus', 'Nekode', 'Bow', 'Crossbow', 'Wand', 'Orb', 'Staff'],
  shirt: ['Shirt', 'Tunic', 'Doublet'],
  pants: ['Pants', 'Trousers', 'Breeches'],
  head: ['Helm', 'Coif', 'Cowl'],
  shoulder: ['Pauldrons', 'Spaulders', 'Shoulders'],
  upperArm: ['Rerebraces', 'Upper Vambraces', 'Armplates'],
  lowerArm: ['Vambraces', 'Bracers', 'Armguards'],
  hands: ['Gauntlets', 'Gloves', 'Mitts'],
  chest: ['Breastplate', 'Hauberk', 'Cuirass'],
  abdomen: ['Girth', 'Faulds', 'Belt Armor'],
  upperLegs: ['Cuisses', 'Tassets', 'Legguards'],
  lowerLegs: ['Greaves', 'Shin Guards', 'Leggings'],
  feet: ['Sollerets', 'Boots', 'Sabatons'],
  shield: ['Buckler', 'Round Shield', 'Kite Shield', 'Tower Shield'],
  amulet: ['Amulet', 'Necklace', 'Pendant', 'Talisman'],
  bracelet: ['Bracelet', 'Bangle', 'Armlet', 'Cuff'],
  ring: ['Ring', 'Band', 'Signet', 'Loop'],
};

// One glyph per kind of gear, so a slot grid reads at a glance without art
// assets. Weapons key off `baseType` (a Sword and a Bow shouldn't look alike);
// everything else keys off its slot. Kept beside BASE_NAMES so a new base type
// can't be added without an icon showing up missing right below it.
export const ITEM_ICONS = {
  sword: '⚔',
  axe: '🪓',
  mace: '🔨',
  spear: '🔱',
  katar: '🗡',
  cestus: '🥊',
  nekode: '🐾',
  bow: '🏹',
  crossbow: '🎯',
  wand: '🪄',
  orb: '🔮',
  staff: '🦯',
  shirt: '👕',
  pants: '👖',
  head: '⛑',
  shoulder: '🎽',
  upperArm: '💪',
  lowerArm: '🦾',
  hands: '🧤',
  chest: '🧥',
  abdomen: '🩹',
  upperLegs: '🩳',
  lowerLegs: '🦵',
  feet: '🥾',
  shield: '🛡',
  amulet: '📿',
  bracelet: '⌚',
  ring: '💍',
  aetheria: '✦',
};

export function itemIcon(item) {
  if (!item) return '';
  if (item.slot === 'weapon' && item.baseType) return ITEM_ICONS[item.baseType] || ITEM_ICONS.sword;
  return ITEM_ICONS[item.slot] || '◈';
}

// The icon shown in an empty equipment slot, so the paper doll still reads as a
// row of places things go rather than a row of blanks.
export function slotIcon(slot) {
  if (slot.startsWith('aetheria')) return ITEM_ICONS.aetheria;
  const kind = slotKind(slot);
  if (kind === 'weapon') return ITEM_ICONS.sword;
  return ITEM_ICONS[kind] || '◈';
}

// Base power of a drop from a point of interest, derived from its average monster ATK.
// Weapons convert power to ATK; armor to DEF + HP; amulet/ring lean on affixes.
export function poiItemPower(avgMonsterAtk) {
  return Math.max(2, Math.round(avgMonsterAtk * 0.5));
}
