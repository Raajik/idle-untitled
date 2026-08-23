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

export const REPUTATION_PER_QUEST = 10;

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
