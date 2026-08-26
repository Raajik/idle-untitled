// Quests: the things a town asks of you, and what it thinks of you afterwards.
//
// A quest is a giver, one objective, and a reward. The giver is a building or a
// POI id, which is what puts the "!" on its card (see game/quests.js). The
// objective is checked against what you're already carrying rather than tracked
// as you go, so nothing has to hook into combat and a quest taken late still
// counts the pile you brought with you.
//
// Objectives:
//   trophy    N of a data/trophies.js id
//   material  N of a data/materials.js id
//   kind      N of any material of a kind (metal, wood, ...)
//   kill      N kills of a species (see data/species.js)
//   item      N pieces of equipment of a slot, handed over
//
// Rewards always include REPUTATION, which is the point of the system: a town
// that knows you is cheaper to invest in and will open doors money alone won't
// (see data/buildings.js). Everything else — xp, a skill, an item — is on top.
//
// A quest may also carry:
//   region    pins it to one town, for story beats that only happen once
//   requires  another quest id that must be 'done' before this one opens, which
//             is what lets one giver hand out a chain rather than everything at
//             once (see game/quests.js questUnlocked)

import { RENDING_MATERIALS } from './materials.js';

export const REPUTATION_PER_QUEST = 10;

// --- Thorolf's rack ---
//
// One weapon per OFFENSIVE SKILL rather than one per base type. There are twelve
// base types but only eight skills — katar/cestus/nekode all train Unarmed and
// wand/orb/staff all train War Magic — so handing over all twelve would be four
// weapons that teach nothing the one beside them didn't. Katar stands in for the
// unarmed family, wand for the casting devices.
export const THOROLF_WEAPONS = ['sword', 'axe', 'mace', 'spear', 'katar', 'bow', 'crossbow', 'wand'];

// Everything off the rack is stamped, so "bring back the rest" means HIS rest and
// not seven pieces of roadside junk. Stamped gear also can't be sold or salvaged
// (see game/loot.js isQuestItem) — tidying your pack can't strand the quest.
export const THOROLF_TAG = 'thorolf';

// All eight roll identical: same power, same rarity, no spells. The point is to
// feel the difference between a spear and a wand, and a lucky rarity roll on one
// of them would answer that question with the loot table instead of the weapon.
export const THOROLF_WEAPON_POWER = 6;
export const THOROLF_WEAPON_RARITY = 'Common';

// You keep one. The count is what he expects back, not what he lent.
export const THOROLF_KEEP = 1;

export const QUESTS = [
  {
    id: 'town-tour',
    giver: 'town-hall',
    perRegion: true,
    title: 'Ask how the town works',
    desc: 'The clerk has time for you, and the General Store will not trade with a stranger.',
    objective: null, // handed in by taking the tour itself
    rewards: { reputation: 5 },
  },
  {
    id: 'store-larder',
    giver: 'general-store',
    perRegion: true,
    title: 'Stock the larder',
    desc: 'The store will take twenty-five raw meat off your hands, and start dealing in food once it has them.',
    objective: { kind: 'trophy', id: 'raw-meat', count: 25 },
    rewards: {
      reputation: 15,
      xp: 250,
      skills: ['cooking'],
      consumables: { 'simple-meal': 10 },
      unlocks: 'storeFoodUnlocked',
    },
  },
  {
    id: 'thorolf-armory',
    giver: 'town-hall',
    region: 'holtburg',
    requires: 'town-tour',
    title: 'Ask for Thorolf',
    desc: 'Alcott said to ask for him. He keeps the practice rack in the back of the hall, and he would rather lend you all of it than watch you guess.',
    objective: null,
    rewards: { reputation: 5, weapons: THOROLF_WEAPONS },
  },
  {
    id: 'thorolf-return',
    giver: 'town-hall',
    region: 'holtburg',
    requires: 'thorolf-armory',
    title: 'Return the rack',
    desc: 'Carry all eight until one of them stops feeling borrowed. Equip the one you are keeping — Thorolf wants back whatever is still loose in your pack.',
    objective: { kind: 'questItem', id: THOROLF_TAG, count: THOROLF_WEAPONS.length - THOROLF_KEEP, takeAll: true },
    rewards: {
      reputation: 20,
      xp: 400,
      // A rending gem is boss loot everywhere else in the game (see
      // game/buildings.js, which keeps them off shop shelves on purpose). One,
      // chosen, is the exception: it's the reward for having settled on a weapon,
      // and picking the type that suits it is the whole decision.
      choice: {
        kind: 'material',
        count: 1,
        prompt: 'Pick one off the shelf',
        options: RENDING_MATERIALS.map((m) => m.id),
      },
    },
  },
];

export function getQuest(id) {
  return QUESTS.find((q) => q.id === id) || null;
}

// A quest instance's id in state: per-region quests are keyed by the town they
// were taken in, so Glenden Wood's larder is not Holtburg's.
export function questKey(questId, regionId) {
  const def = getQuest(questId);
  return def && def.perRegion ? `${regionId}:${questId}` : questId;
}

export function questIdFromKey(key) {
  const parts = String(key).split(':');
  return parts[parts.length - 1];
}
