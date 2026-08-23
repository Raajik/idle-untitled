// Town buildings. You don't buy these for yourself — you invest in them, and the
// town grows around you. Only the Town Hall is standing when you arrive; opening
// anything else costs pyreals plus materials farmed from POI clears, and every
// level after that is another investment in the same business.
//
// Levels and stock live in `state.buildings[id]` — see game/buildings.js for the
// invest/restock logic. This file is pure data plus the cost/bonus math, so it
// can be imported from anywhere (notably game/hero.js) without dragging in the
// loot generator.
//
// A building offers up to four things:
//   - `stock`: a rotating catalog of generated gear. Every stock-bearing business
//     restocks on its own timer, and investing shortens that timer.
//   - `sells`: consumables it keeps behind the counter, as { id, chance } — the
//     chance it's on the shelf at all after any given restock. A generalist has
//     a bit of everything *sometimes*; the specialist who actually brews the
//     thing always has it.
//   - `exchange`: true if it deals in raw materials at rates that move with the
//     stock (see game/buildings.js rollExchangeRates) — a pyreal sink for anyone
//     short of one particular thing.
//   - `service`: a one-off action (the Physician's heal, the Town Hall's tour).
//   - `perk`: one bonus that scales with level. Most `perk.key`s are getBonuses()
//     keys from game/hero.js and apply to the hero automatically; the ones in
//     LOCAL_PERK_KEYS are read directly by the system that cares about them.
//
// Investment costs name a material KIND (metal, wood, cloth, hide, stone, gem)
// rather than one specific material, so an excess of copper is as good as iron
// and nobody is blocked behind the one node they haven't farmed.

import { SLOTS, ARMOR_SLOTS, UNDERCLOTHING_SLOTS } from './items.js';
import { totalOfKind, heldOfKind } from './materials.js';
import { REGIONS } from './regions.js';

export const MAX_BUILDING_LEVEL = 10;

// Perk keys that are NOT hero bonuses — each is read by one specific caller:
// `materialMult` by game/waves.js (clear payout), `healCostPct` by game/shop.js.
const LOCAL_PERK_KEYS = ['materialMult', 'healCostPct', 'investmentPct'];

const BASE_ROTATION_SECONDS = 3600; // one hour at level 1
const MIN_ROTATION_SECONDS = 300;

// How long a building's stock lasts before it rerolls. Level 1 is an hour;
// level 10 is about ten minutes.
export function rotationSeconds(level) {
  return Math.max(MIN_ROTATION_SECONDS, Math.round(BASE_ROTATION_SECONDS * Math.pow(0.82, Math.max(1, level) - 1)));
}

const BUILDING_TEMPLATES = [
  {
    id: 'town-hall',
    name: 'Town Hall',
    blurb: "Holtburg's ledger, its arguments, and the man who decides which of them matter.",
    startsUnlocked: true,
    upgrade: { pyreals: 500, growth: 1.6, materialKind: 'metal', materials: 2 },
    // Sitting through the tour is what opens the General Store — the town has to
    // explain itself before it will take your money.
    service: 'tour',
    unlocksOnService: 'general-store',
    perk: { key: 'investmentPct', perLevel: -3, text: (v) => `${v}% to invest in any business` },
  },
  {
    id: 'general-store',
    name: 'General Store',
    blurb: 'A bit of everything and a great deal of nothing in particular.',
    // Opened by the Town Hall's tour rather than bought (see unlocksOnService).
    unlock: null,
    // Deliberately the steepest curve in town: a generalist that keeps pace with
    // the specialists has to be paid for like one of each.
    upgrade: { pyreals: 1400, growth: 2.1, materialKind: 'metal', materials: 4 },
    stock: { slots: SLOTS, min: 4, max: 6, perLevel: 1, luckPerLevel: 4 },
    // Neither is guaranteed: the Store is where you find out a potion exists and
    // learn to resent its supply, which is the argument for opening a Physician.
    sells: [
      { id: 'healing-kit', chance: 0.55 },
      { id: 'stamina-potion', chance: 0.35 },
    ],
    exchange: true,
    perk: null, // more of everything, better, faster — that IS the perk
  },
  {
    id: 'physician',
    name: 'Physician',
    blurb: 'Bandages, poultices, and no questions about how you got that.',
    unlock: { pyreals: 500, materialKind: 'cloth', materials: 5 },
    upgrade: { pyreals: 400, growth: 1.6, materialKind: 'cloth', materials: 3 },
    // The reliable supply. The Store might have a potion; the healer always does,
    // which is most of the reason to put money into this place.
    sells: [
      { id: 'healing-kit', chance: 1 },
      { id: 'stamina-potion', chance: 1 },
    ],
    service: 'heal',
    perk: { key: 'healCostPct', perLevel: -8, text: (v) => `${v}% healing cost` },
  },
  {
    id: 'weaponsmith',
    name: 'Weaponsmith',
    blurb: 'Hammer, anvil, and a standing opinion about your current blade.',
    unlock: { pyreals: 1200, materialKind: 'metal', materials: 8 },
    upgrade: { pyreals: 900, growth: 1.7, materialKind: 'metal', materials: 4 },
    stock: { slots: ['weapon'], weaponFilter: 'melee', min: 2, max: 4 },
    perk: { key: 'atkPct', perLevel: 4, text: (v) => `+${v}% ATK` },
  },
  {
    id: 'bowyer',
    name: 'Bowyer',
    blurb: 'Staves, strings, and fletching done while you wait.',
    unlock: { pyreals: 1800, materialKind: 'wood', materials: 8 },
    upgrade: { pyreals: 1200, growth: 1.7, materialKind: 'wood', materials: 4 },
    stock: { slots: ['weapon'], weaponFilter: 'ranged', min: 2, max: 4 },
    // Not crit chance: nothing buys that (see game/hero.js). A bowyer sells you
    // range, so what investing buys is the shot itself landing.
    perk: { key: 'hitChancePct', perLevel: 1, text: (v) => `+${v}% chance to hit` },
  },
  {
    id: 'armorsmith',
    name: 'Armorsmith',
    blurb: 'Plate, chain, and shields dented in all the reassuring places.',
    unlock: { pyreals: 2500, materialKind: 'stone', materials: 10 },
    upgrade: { pyreals: 1600, growth: 1.7, materialKind: 'stone', materials: 5 },
    stock: { slots: [...ARMOR_SLOTS, 'shield'], min: 3, max: 5 },
    perk: { key: 'hpPct', perLevel: 5, text: (v) => `+${v}% Max HP` },
  },
  {
    id: 'tailor',
    name: 'Tailor',
    blurb: 'Light armor cut to move, because not every hit is worth taking.',
    unlock: { pyreals: 3200, materialKind: 'hide', materials: 10 },
    upgrade: { pyreals: 2000, growth: 1.7, materialKind: 'hide', materials: 5 },
    stock: { slots: [...UNDERCLOTHING_SLOTS, ...ARMOR_SLOTS], min: 2, max: 4 },
    perk: { key: 'dodgeBonus', perLevel: 1.5, text: (v) => `+${v.toFixed(1)}% Dodge chance` },
  },
  {
    id: 'archmage',
    name: 'Archmage',
    blurb: 'Wands, orbs, staves, amulets, and unsolicited advice about mana.',
    unlock: { pyreals: 4500, materialKind: 'gem', materials: 6 },
    upgrade: { pyreals: 2800, growth: 1.7, materialKind: 'gem', materials: 3 },
    stock: { slots: ['weapon', 'amulet'], weaponFilter: 'magic', min: 3, max: 5 },
    perk: { key: 'maxManaFlat', perLevel: 6, text: (v) => `+${v} Max Mana` },
  },
  {
    id: 'jeweler',
    name: 'Jeweler',
    blurb: 'Rings that catch the light, and — so they claim — good fortune.',
    unlock: { pyreals: 6000, materialKind: 'metal', materials: 6 },
    upgrade: { pyreals: 3600, growth: 1.7, materialKind: 'metal', materials: 3 },
    stock: { slots: ['ring'], min: 2, max: 4 },
    perk: { key: 'luckPct', perLevel: 3, text: (v) => `+${v}% better loot rarity` },
  },
  {
    id: 'storehouse',
    name: 'Storehouse',
    blurb: 'Crates, ledgers, and space to haul more back from every dungeon.',
    unlock: { pyreals: 8000, materialKind: 'metal', materials: 12 },
    upgrade: { pyreals: 5000, growth: 1.7, materialKind: 'metal', materials: 6 },
    perk: { key: 'materialMult', perLevel: 25, text: (v) => `+${v}% materials per full clear` },
  },
  {
    id: 'trade-hall',
    name: 'Trade Hall',
    blurb: 'Where Holtburg argues about prices, loudly, on your behalf.',
    unlock: { pyreals: 12000, materialKind: 'wood', materials: 12 },
    upgrade: { pyreals: 7000, growth: 1.7, materialKind: 'wood', materials: 6 },
    perk: { key: 'pyrealsPct', perLevel: 6, text: (v) => `+${v}% Pyreals` },
  },
];

// Every region has the same town, and every town is its own set of businesses
// with its own levels and its own stock. Ids are `<regionId>:<type>` so two
// Weaponsmiths in two towns are two businesses.
//
// Holtburg is the only town you build from nothing — it's where the game teaches
// you what investing IS. Everywhere else is an established town that was there
// before you arrived, already trading, which is the point of walking that far:
// you could skip half of Holtburg's ladder entirely if you were willing to idle
// out the road to the next one.
export const FIRST_REGION = 'holtburg';

export const BUILDINGS = REGIONS.flatMap((region) =>
  BUILDING_TEMPLATES.map((template) => ({
    ...template,
    type: template.id,
    id: `${region.id}:${template.id}`,
    regionId: region.id,
    name: template.name,
    startsUnlocked: region.id === FIRST_REGION ? !!template.startsUnlocked : true,
    unlocksOnService: template.unlocksOnService ? `${region.id}:${template.unlocksOnService}` : undefined,
  }))
);

// A town's own copy of a business type.
export function buildingIn(regionId, type) {
  return `${regionId}:${type}`;
}

export function buildingType(buildingId) {
  return String(buildingId).split(':').pop();
}

export function getBuilding(buildingId) {
  return BUILDINGS.find((b) => b.id === buildingId) || null;
}

export function buildingsForRegion(regionId) {
  return BUILDINGS.filter((b) => b.regionId === regionId);
}

// Fresh `state.buildings` map: only `startsUnlocked` buildings begin at level 1.
// Stock starts empty with `rotatesAt: 0` so the first tick rolls it (see
// game/buildings.js tickBuildings) — that keeps state.js free of loot imports.
export function freshBuildings() {
  const map = {};
  for (const def of BUILDINGS) {
    map[def.id] = { level: def.startsUnlocked ? 1 : 0, stock: [], sells: [], exchange: [], rotatesAt: 0 };
  }
  return map;
}

// --- Costs ---
// A cost is { pyreals, materialId, materials }; `materialId` is null when a
// building's next step costs pyreals only.

// What it costs to open this business, after the Town Hall's discount. Null when
// there's nothing to buy — it either starts open or is opened some other way.
export function unlockCost(building, state) {
  const u = building.unlock;
  if (!u) return null;
  const raw = { pyreals: u.pyreals, materialKind: u.materialKind || null, materials: u.materials || 0 };
  return state ? discounted(state, raw) : raw;
}

// Cost to go from `level` to `level + 1`. Pyreals grow geometrically, materials
// linearly, so late levels are gated on pyreals rather than on grinding one node.
export function upgradeCost(building, level, state) {
  const u = building.upgrade;
  if (!u || level >= MAX_BUILDING_LEVEL) return null;
  const raw = {
    pyreals: Math.floor(u.pyreals * Math.pow(u.growth, level - 1)),
    materialKind: u.materialKind || null,
    materials: (u.materials || 0) * level,
  };
  return state ? discounted(state, raw) : raw;
}

// The Town Hall's perk discounts every investment in town, including its own.
export function investmentDiscount(state) {
  return Math.max(0.25, 1 + buildingBonus(state, 'investmentPct') / 100);
}

function discounted(state, cost) {
  if (!cost) return null;
  const scale = investmentDiscount(state);
  return {
    pyreals: Math.max(1, Math.round(cost.pyreals * scale)),
    materialKind: cost.materialKind,
    materials: cost.materialKind ? Math.max(1, Math.round(cost.materials * scale)) : 0,
  };
}

export function canAfford(state, cost) {
  if (!cost) return false;
  if (state.pyreals < cost.pyreals) return false;
  if (cost.materialKind && totalOfKind(state, cost.materialKind) < cost.materials) return false;
  return true;
}

// Spends a kind from whatever you're holding most of first, so the pile you
// were never going to tinker with goes before the one you might.
export function payCost(state, cost) {
  state.pyreals -= cost.pyreals;
  if (!cost.materialKind) return;
  let owed = cost.materials;
  for (const held of heldOfKind(state, cost.materialKind)) {
    if (owed <= 0) break;
    const take = Math.min(owed, held.count);
    state.materials[held.id] -= take;
    owed -= take;
  }
}

// --- Perks ---

export function buildingLevel(state, buildingId) {
  const b = state.buildings && state.buildings[buildingId];
  return b ? b.level : 0;
}

// Total value of one perk key across every unlocked building. Works for both
// hero-bonus keys and the LOCAL_PERK_KEYS.
// A perk is worth whatever your BEST town gives, not the sum of every town's.
// Opening a second Weaponsmith is about its stock and its prices; it doesn't
// stack the buff, or reaching a new region would multiply your character
// sheet by simply arriving.
// A shop in a town you have never walked to is not doing anything for you,
// however open it is. Towns past the first start fully built (see FIRST_REGION),
// so without this a brand-new hero would arrive holding every perk in the game.
function perkLevel(state, def) {
  const reached = (state.progress && state.progress.unlockedRegions) || [];
  if (!reached.includes(def.regionId)) return 0;
  return buildingLevel(state, def.id);
}

function bestLevelByType(state) {
  const best = {};
  for (const def of BUILDINGS) {
    const level = perkLevel(state, def);
    if (level > (best[def.type] || 0)) best[def.type] = level;
  }
  return best;
}

export function buildingBonus(state, key) {
  const best = bestLevelByType(state);
  const seen = new Set();
  let total = 0;
  for (const def of BUILDINGS) {
    if (!def.perk || def.perk.key !== key || seen.has(def.type)) continue;
    seen.add(def.type);
    total += def.perk.perLevel * (best[def.type] || 0);
  }
  return total;
}

// Every perk that feeds game/hero.js getBonuses(), as a { key: value } object.
export function heroBuildingBonuses(state) {
  const best = bestLevelByType(state);
  const bonuses = {};
  const seen = new Set();
  for (const def of BUILDINGS) {
    if (!def.perk || LOCAL_PERK_KEYS.includes(def.perk.key) || seen.has(def.type)) continue;
    seen.add(def.type);
    const level = best[def.type] || 0;
    if (level === 0) continue;
    bonuses[def.perk.key] = (bonuses[def.perk.key] || 0) + def.perk.perLevel * level;
  }
  return bonuses;
}

// Human-readable perk value at a given level, e.g. "+12% ATK" — null for a
// building with no perk, or at level 0.
export function perkText(building, level) {
  if (!building.perk || level <= 0) return null;
  return building.perk.text(building.perk.perLevel * level);
}
