// Rebirth (prestige) definitions: soul formula inputs + permanent upgrade tree.

export const REBIRTH_MIN_REGION = 'glenden-wood'; // must have reached at least this region

// Hero Souls earned on rebirth: driven by highest region reached and levels gained
// this run. Tuned so a first rebirth (region 1-2, ~level 15) yields ~2 souls,
// scaling to ~8 by region 5.
export function soulsForRun(highestRegionIndex, heroLevel) {
  if (highestRegionIndex < 1) return 0; // index 0 = Holtburg only, doesn't count
  return Math.floor(Math.pow(highestRegionIndex + 1, 1.5) / 2 + heroLevel / 25);
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
