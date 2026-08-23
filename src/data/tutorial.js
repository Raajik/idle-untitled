// The scripted first walk into Holtburg: the small, mostly harmless things a
// brand-new hero can actually beat. Not a real POI (no waves, no gear drops),
// just the ordinary combat tick against a fixed pool.
//
// These carry explicit `stats` INSTEAD OF deriving them from `level`, because the
// curve in data/monsterScaling.js is built for dungeon monsters and a rabbit is
// not one. They still carry a level: it's what the UI shows you, and it's how you
// tell at a glance that the rat is the one to worry about. A hero starts with 1
// in every attribute — 25 HP and 4 ATK — so the stats here are sized against that
// and nothing else.
//
// `drops` are trophies (see data/trophies.js): `chance` 1 always drops.

export const TUTORIAL_ROAD = {
  id: 'tutorial-road',
  name: 'The Road to Holtburg',
  monsters: [
    {
      name: 'Rabbit',
      level: 1,
      dmgType: 'pierce',
      stats: { hp: 8, atk: 1, def: 0, xp: 4, pyreals: 1, dodge: 8, maxStamina: 6 },
      drops: [{ id: 'raw-meat', chance: 1 }],
    },
    {
      name: 'Chicken',
      level: 1,
      dmgType: 'pierce',
      stats: { hp: 7, atk: 1, def: 0, xp: 4, pyreals: 1, dodge: 10, maxStamina: 6 },
      drops: [{ id: 'raw-meat', chance: 1 }],
    },
    {
      // The one that can actually hurt you, and the only one worth skinning.
      name: 'Rat',
      level: 2,
      dmgType: 'pierce',
      stats: { hp: 16, atk: 2, def: 1, xp: 9, pyreals: 3, dodge: 6, maxStamina: 10 },
      drops: [
        { id: 'rat-tail', chance: 1 },
        { id: 'pristine-rat-tail', chance: 0.08 },
      ],
    },
  ],
};

// Rats are the exception on this road, not the rule — two harmless things for
// every one that bites.
export const TUTORIAL_MONSTER_WEIGHTS = { Rabbit: 4, Chicken: 4, Rat: 2 };

export const TUTORIAL_JOURNEY_SECONDS = 180;
