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
  mat('linen', 'Linen', 'item'),
  mat('moonstone', 'Moonstone', 'item'),
  mat('pine', 'Pine', 'item'),
  mat('porcelain', 'Porcelain', 'item'),
  mat('ruby', 'Ruby', 'item'),
  mat('satin', 'Satin', 'item'),
  mat('silver', 'Silver', 'item'),
  mat('teak', 'Teak', 'item'),
];

export const WEAPON_TINKERING_MATERIALS = [
  mat('aquamarine', 'Aquamarine', 'weapon'),
  mat('black-garnet', 'Black Garnet', 'weapon'),
  mat('brass', 'Brass', 'weapon'),
  mat('emerald', 'Emerald', 'weapon'),
  mat('granite', 'Granite', 'weapon'),
  mat('imperial-topaz', 'Imperial Topaz', 'weapon'),
  mat('iron', 'Iron', 'weapon'),
  mat('jet', 'Jet', 'weapon'),
  mat('mahogany', 'Mahogany', 'weapon'),
  mat('oak', 'Oak', 'weapon'),
  mat('red-garnet', 'Red Garnet', 'weapon'),
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

export const MATERIALS = [...ITEM_TINKERING_MATERIALS, ...WEAPON_TINKERING_MATERIALS, ...MAGIC_ITEM_TINKERING_MATERIALS];

export function getMaterial(id) {
  return MATERIALS.find((m) => m.id === id) || null;
}

// Which material pool a generated item's slot draws from, and which slots a
// material's category can be applied to in Tinkering.
export const SLOT_MATERIAL_CATEGORY = {
  weapon: 'weapon',
  armor: 'item',
  shield: 'item',
  amulet: 'magic-item',
  ring: 'magic-item',
};

export function materialsForSlot(slot) {
  const category = SLOT_MATERIAL_CATEGORY[slot];
  return MATERIALS.filter((m) => m.category === category);
}

export function slotsForMaterialCategory(category) {
  return Object.keys(SLOT_MATERIAL_CATEGORY).filter((slot) => SLOT_MATERIAL_CATEGORY[slot] === category);
}

// Flat salvage yield by rarity — no workmanship/success roll, just a fixed
// quantity of the item's material.
export const SALVAGE_YIELD = { Common: 1, Uncommon: 2, Rare: 3, Epic: 5, Legendary: 8 };

// What each gathering skill can yield — subsets of the lists above, so gathering
// and salvage feed the same shared material pool. A POI's full-clear material
// must be a member of the pool for the skill that clear trains
// (test/waves.test.js enforces this).
export const GATHER_MATERIAL_POOLS = {
  mining: ['iron', 'brass', 'granite', 'jet', 'copper', 'silver', 'gold'],
  woodcutting: ['oak', 'mahogany', 'pine', 'teak', 'ebony'],
  skinning: ['gromnie-hide'],
  foraging: ['linen', 'satin', 'porcelain'],
  fishing: ['aquamarine', 'moonstone', 'amber'],
};
