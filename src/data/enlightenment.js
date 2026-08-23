// Enlightenment (prestige) definitions: soul formula inputs + permanent upgrade tree.

export const ENLIGHTENMENT_MIN_REGION = 'glenden-wood'; // must have reached at least this region

// Hero Souls earned on Enlightenment: driven by the highest region reached and the
// level gained this run. Tuned against the pacing target of a ~1 hour first
// Enlightenment, which lands a player in Glenden Wood around level 6-8: that pays
// 1 soul, rising to ~3 by Eastham and ~5 by the Direlands.
export function soulsForRun(highestRegionIndex, heroLevel) {
  if (highestRegionIndex < 1) return 0; // index 0 = Holtburg only, doesn't count
  return Math.floor(Math.pow(highestRegionIndex + 1, 1.5) / 2 + heroLevel / 25);
}

export const ENLIGHTENMENT_UPGRADES = [
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
