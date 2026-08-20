// Rebirth (prestige) definitions: soul formula inputs + permanent upgrade tree.

export const REBIRTH_MIN_ZONE = 1; // must have reached at least zone index 1 (Goblin Camp)

// Hero Souls earned on rebirth: driven by highest zone unlocked and levels gained this run.
export function soulsForRun(highestZoneIndex, heroLevel) {
  if (highestZoneIndex < REBIRTH_MIN_ZONE) return 0;
  return Math.floor(3 * Math.pow(highestZoneIndex + 1, 1.8) + heroLevel / 5);
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
    id: 'goldBoost',
    name: 'Greed',
    desc: '+20% Gold per rank',
    maxRank: 5,
    cost: (rank) => rank + 1,
    effectPerRank: { goldPct: 20 },
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
    desc: 'Start each run with +5 STR/VIT/AGI per rank',
    maxRank: 3,
    cost: (rank) => rank + 3,
    effectPerRank: { startStats: 5 },
  },
];
