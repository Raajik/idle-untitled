// The scripted first walk into Holtburg: a handful of weak roadside monsters the
// fresh, unarmed hero can fight or flee from. Not a real POI (no depth scaling, no
// loot), just reuses the ordinary combat tick against a small fixed monster pool.

export const TUTORIAL_ROAD = {
  id: 'tutorial-road',
  name: 'The Road to Holtburg',
  monsters: [
    { name: 'Mangy Wolf', level: 1, dmgType: 'slash' },
    { name: 'Roadside Bandit', level: 2, dmgType: 'pierce' },
    { name: 'Wild Boar', level: 3, dmgType: 'bludgeon' },
  ],
  boss: { name: 'Mangy Wolf', level: 1, dmgType: 'slash' }, // present for safety; practically never rolled
};

export const TUTORIAL_JOURNEY_SECONDS = 180;
