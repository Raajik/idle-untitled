// Salvage/tinkering materials — real Asheron's Call salvage material names,
// grouped by which of AC's tinkering skills they belonged to (see CLAUDE.md-
// adjacent note: sourced from wiki search results, not the full ~72-item
// catalog — Armor Tinkering/Alchemy specific names weren't retrievable, so
// armor pieces reuse the Item Tinkering pool as a stand-in). "Pyreal" is
// deliberately omitted — it's a real AC material too, but the name collides
// with this game's currency.
//
// `category` determines which equipment slot a material can be applied to in
// Tinkering (see game/tinkering.js). GATHER_MATERIAL_POOLS at the bottom groups
// the same materials by gathering skill — each POI's `gather` entry in
// data/regions.js names one member of one pool as its full-clear payout.

import { ARMOR_SLOTS, UNDERCLOTHING_SLOTS } from './items.js';

function mat(id, name, category) {
  return { id, name, category };
}

export const ITEM_TINKERING_MATERIALS = [
  mat('amber', 'Amber', 'item'),
  mat('copper', 'Copper', 'item'),
  mat('diamond', 'Diamond', 'item'),
  mat('ebony', 'Ebony', 'item'),
  mat('gold', 'Gold', 'item'),
  mat('gromnie-hide', 'Gromnie Hide', 'item'),
  mat('ursuin-pelt', 'Ursuin Pelt', 'item'),
  mat('armoredillo-hide', 'Armoredillo Hide', 'item'),
  mat('linen', 'Linen', 'item'),
  mat('moonstone', 'Moonstone', 'item'),
  mat('pine', 'Pine', 'item'),
  mat('porcelain', 'Porcelain', 'item'),
  mat('ruby', 'Ruby', 'item'),
  mat('satin', 'Satin', 'item'),
  mat('silver', 'Silver', 'item'),
  mat('teak', 'Teak', 'item'),
  mat('velvet', 'Velvet', 'item'),
];

export const WEAPON_TINKERING_MATERIALS = [
  mat('brass', 'Brass', 'weapon'),
  mat('granite', 'Granite', 'weapon'),
  mat('iron', 'Iron', 'weapon'),
  mat('mahogany', 'Mahogany', 'weapon'),
  mat('oak', 'Oak', 'weapon'),
];

// The rending gems. These are NOT ordinary salvage: they're boss loot, one per
// damage type, and applying one to a weapon is its own act (see
// game/rending.js) rather than a Tinkering roll. They sit in their own category
// so materialsForSlot never offers them as a normal tinker and so nothing is
// ever *named* after them — a weapon is made of iron and rends fire, and those
// are two different facts about it.
export const RENDING_MATERIALS = [
  mat('white-sapphire', 'White Sapphire', 'rending'),
  mat('black-garnet', 'Black Garnet', 'rending'),
  mat('imperial-topaz', 'Imperial Topaz', 'rending'),
  mat('emerald', 'Emerald', 'rending'),
  mat('aquamarine', 'Aquamarine', 'rending'),
  mat('red-garnet', 'Red Garnet', 'rending'),
  mat('jet', 'Jet', 'rending'),
  mat('onyx', 'Onyx', 'rending'),
];

export const MAGIC_ITEM_TINKERING_MATERIALS = [
  mat('agate', 'Agate', 'magic-item'),
  mat('azurite', 'Azurite', 'magic-item'),
  mat('black-opal', 'Black Opal', 'magic-item'),
  mat('bloodstone', 'Bloodstone', 'magic-item'),
  mat('carnelian', 'Carnelian', 'magic-item'),
  mat('citrine', 'Citrine', 'magic-item'),
  mat('fire-opal', 'Fire Opal', 'magic-item'),
  mat('green-garnet', 'Green Garnet', 'magic-item'),
  mat('hematite', 'Hematite', 'magic-item'),
  mat('lapis-lazuli', 'Lapis Lazuli', 'magic-item'),
  mat('lavender-jade', 'Lavender Jade', 'magic-item'),
  mat('malachite', 'Malachite', 'magic-item'),
  mat('opal', 'Opal', 'magic-item'),
  mat('red-jade', 'Red Jade', 'magic-item'),
  mat('rose-quartz', 'Rose Quartz', 'magic-item'),
  mat('smoky-quartz', 'Smoky Quartz', 'magic-item'),
];

export const MATERIALS = [
  ...ITEM_TINKERING_MATERIALS,
  ...WEAPON_TINKERING_MATERIALS,
  ...MAGIC_ITEM_TINKERING_MATERIALS,
  ...RENDING_MATERIALS,
];

// What a material IS, as opposed to what it can be applied to. Building
// investment asks for a KIND — "8 metal" — rather than naming iron specifically,
// so a stack of copper you'll never tinker with is still worth something and you
// spend whichever of a kind you have most of.
export const MATERIAL_KINDS = ['metal', 'wood', 'cloth', 'hide', 'stone', 'gem'];

export const MATERIAL_KIND = {
  // metal
  iron: 'metal', copper: 'metal', silver: 'metal', gold: 'metal', brass: 'metal',
  // wood
  oak: 'wood', mahogany: 'wood', pine: 'wood', teak: 'wood', ebony: 'wood',
  // cloth
  linen: 'cloth', satin: 'cloth', velvet: 'cloth',
  // hide
  'gromnie-hide': 'hide', 'ursuin-pelt': 'hide', 'armoredillo-hide': 'hide',
  // stone
  granite: 'stone', porcelain: 'stone', hematite: 'stone', malachite: 'stone',
};

// One glyph per kind, so a material says what it counts as at a glance. Building
// investment asks for "8 metal" (see data/buildings.js), and knowing that copper
// counts as metal shouldn't mean reading a table somewhere else.
export const KIND_ICONS = {
  metal: '\u2692',
  wood: '\u{1F332}',
  cloth: '\u{1F9F5}',
  hide: '\u{1F43E}',
  stone: '\u{1FAA8}',
  gem: '\u{1F48E}',
  rending: '\u25C8', // the rending gems, which are boss loot and never spendable
};

export function kindIcon(kind) {
  return KIND_ICONS[kind] || '';
}

// The icon for a specific material, by what kind it counts as.
export function materialIcon(id) {
  const m = getMaterial(id);
  if (m && m.category === 'rending') return KIND_ICONS.rending;
  return kindIcon(materialKind(id));
}

export function materialKind(id) {
  // Anything not named above is a gem: the magic-item pool is almost entirely
  // stones-you-set rather than stones-you-build-with.
  return MATERIAL_KIND[id] || 'gem';
}

export function materialsOfKind(kind) {
  // Rending gems are boss loot with exactly one use (see game/rending.js) and
  // are never spent on a shopfront, however much "gem" they technically are.
  return MATERIALS.filter((m) => m.category !== 'rending' && materialKind(m.id) === kind);
}

// What the player is holding of a kind, most plentiful first — which is the
// order investment spends them in.
export function heldOfKind(state, kind) {
  return materialsOfKind(kind)
    .map((m) => ({ id: m.id, name: m.name, count: state.materials[m.id] || 0 }))
    .filter((m) => m.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function totalOfKind(state, kind) {
  return heldOfKind(state, kind).reduce((sum, m) => sum + m.count, 0);
}

export function kindLabel(kind) {
  return kind ? kind[0].toUpperCase() + kind.slice(1) : '';
}

export function getMaterial(id) {
  return MATERIALS.find((m) => m.id === id) || null;
}

// Which material pool a generated item's slot draws from, and which slots a
// material's category can be applied to in Tinkering.
export const SLOT_MATERIAL_CATEGORY = {
  weapon: 'weapon',
  shield: 'item',
  amulet: 'magic-item',
  bracelet: 'magic-item',
  ring: 'magic-item',
};
// Every piece of armor takes the same materials the old single armor slot did.
for (const slot of ARMOR_SLOTS) SLOT_MATERIAL_CATEGORY[slot] = 'item';
// Cloth, same as the armor pool draws from.
for (const slot of UNDERCLOTHING_SLOTS) SLOT_MATERIAL_CATEGORY[slot] = 'item';

export function materialsForSlot(slot) {
  const category = SLOT_MATERIAL_CATEGORY[slot];
  return MATERIALS.filter((m) => m.category === category);
}

export function slotsForMaterialCategory(category) {
  return Object.keys(SLOT_MATERIAL_CATEGORY).filter((slot) => SLOT_MATERIAL_CATEGORY[slot] === category);
}

// Salvage yield. Every item breaks down into a base 1-2 of whatever it's made
// of, nudged up by rarity, and then multiplied by the Salvaging skill — which
// compounds per rank rather than adding, so a trained salvager pulls an order of
// magnitude more out of the same drop. That's what makes farming a dungeon for
// its material worth doing twice: the gear it drops is made of the same stuff
// (see game/loot.js rollDrop), so the whole clear feeds one pile.
export const SALVAGE_BASE_MIN = 1;
export const SALVAGE_BASE_MAX = 2;
export const SALVAGE_RARITY_BONUS = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 5 };
export const SALVAGE_GROWTH_PER_RANK = 1.03; // ~19x by rank 100

// What each gathering skill can yield — subsets of the lists above, so gathering
// and salvage feed the same shared material pool. A POI's full-clear material
// must be a member of the pool for the skill that clear trains
// (test/waves.test.js enforces this).
export const GATHER_MATERIAL_POOLS = {
  mining: ['iron', 'brass', 'granite', 'copper', 'silver', 'gold', 'green-garnet', 'opal'],
  woodcutting: ['oak', 'mahogany', 'pine', 'teak', 'ebony'],
  skinning: ['gromnie-hide', 'ursuin-pelt', 'armoredillo-hide'],
  foraging: ['linen', 'satin', 'porcelain', 'velvet'],
  fishing: ['moonstone', 'amber', 'porcelain'],
};
