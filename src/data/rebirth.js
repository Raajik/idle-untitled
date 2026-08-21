// Rebirth (prestige) definitions: soul formula inputs + permanent upgrade tree.

export const REBIRTH_MIN_ZONE = 1; // must have reached at least zone index 1 (Banderling Plains)

// Hero Souls earned on rebirth: driven by highest zone unlocked and levels gained this run.
// Tuned so a first rebirth (zone 1-2, ~level 15) yields ~2 souls, scaling to ~8 by zone 5.
export function soulsForRun(highestZoneIndex, heroLevel) {
  if (highestZoneIndex < REBIRTH_MIN_ZONE) return 0;
  return Math.floor(Math.pow(highestZoneIndex + 1, 1.5) / 2 + heroLevel / 25);
}

export const REBIRTH_UPGRADES = [
  {
    id: 'xpBoost',
    name: 'Attunement',
    desc: '+20% XP per rank',
    maxRank: 5,
    cost: (rank) => rank + 1,
    effectPerRank: { xpPct: 20 },
  },
  {
    id: 'pyrealsBoost',
    name: 'Greed',
    desc: '+20% Pyreals per rank',
    maxRank: 5,
    cost: (rank) => rank + 1,
    effectPerRank: { pyrealsPct: 20 },
  },
  {
    id: 'atkBoost',
    name: 'Battle Memory',
    desc: '+15% ATK per rank',
    maxRank: 5,
    cost: (rank) => rank + 2,
    effectPerRank: { atkPct: 15 },
  },
  {
    id: 'luckBoost',
    name: 'Fortune',
    desc: '+10% better loot rarity per rank',
    maxRank: 3,
    cost: (rank) => rank + 3,
    effectPerRank: { luckPct: 10 },
  },
  {
    id: 'headStart',
    name: 'Head Start',
    desc: 'Start each run with +5 to all attributes per rank',
    maxRank: 3,
    cost: (rank) => rank + 3,
    effectPerRank: { startStats: 5 },
  },
];
