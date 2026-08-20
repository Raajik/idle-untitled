// Zone & monster definitions. Pure data — add zones here, never touch engine code.
//
// Each zone: monsters array, killsToBoss, and a boss. Monster stats are base values
// for the zone; combat scales them slightly per kill within the zone for a gentle
// difficulty ramp.

export const ZONES = [
  {
    id: 'slime-meadow',
    name: 'Slime Meadow',
    killsToBoss: 10,
    monsters: [
      { name: 'Green Slime', hp: 22, atk: 3, def: 0, xp: 6, gold: 3 },
      { name: 'Blue Slime', hp: 30, atk: 4, def: 1, xp: 8, gold: 4 },
      { name: 'Slime Bud', hp: 18, atk: 2, def: 0, xp: 5, gold: 3 },
    ],
    boss: { name: 'King Slime', hp: 120, atk: 7, def: 2, xp: 60, gold: 40 },
  },
  {
    id: 'goblin-camp',
    name: 'Goblin Camp',
    killsToBoss: 15,
    monsters: [
      { name: 'Goblin Grunt', hp: 70, atk: 10, def: 3, xp: 18, gold: 9 },
      { name: 'Goblin Slinger', hp: 55, atk: 13, def: 2, xp: 20, gold: 11 },
      { name: 'Warg Pup', hp: 85, atk: 9, def: 4, xp: 19, gold: 10 },
    ],
    boss: { name: 'Goblin Chief', hp: 420, atk: 18, def: 6, xp: 170, gold: 110 },
  },
  {
    id: 'whispering-woods',
    name: 'Whispering Woods',
    killsToBoss: 20,
    monsters: [
      { name: 'Thorn Sprite', hp: 200, atk: 22, def: 8, xp: 42, gold: 22 },
      { name: 'Murk Wolf', hp: 260, atk: 26, def: 9, xp: 48, gold: 25 },
      { name: 'Hex Crow', hp: 170, atk: 30, def: 7, xp: 45, gold: 24 },
    ],
    boss: { name: 'The Whisperer', hp: 1300, atk: 40, def: 14, xp: 420, gold: 260 },
  },
  {
    id: 'ember-caves',
    name: 'Ember Caves',
    killsToBoss: 25,
    monsters: [
      { name: 'Cinder Imp', hp: 520, atk: 48, def: 18, xp: 95, gold: 50 },
      { name: 'Magma Turtle', hp: 800, atk: 40, def: 30, xp: 110, gold: 55 },
      { name: 'Ash Bat', hp: 450, atk: 55, def: 16, xp: 100, gold: 52 },
    ],
    boss: { name: 'Emberlord Vrax', hp: 3400, atk: 72, def: 28, xp: 950, gold: 580 },
  },
  {
    id: 'frost-peak',
    name: 'Frost Peak',
    killsToBoss: 30,
    monsters: [
      { name: 'Rime Golem', hp: 1600, atk: 85, def: 45, xp: 210, gold: 110 },
      { name: 'Snow Harpy', hp: 1200, atk: 100, def: 38, xp: 230, gold: 120 },
      { name: 'Glacial Wisp', hp: 1000, atk: 110, def: 34, xp: 220, gold: 115 },
    ],
    boss: { name: 'Wintermaw', hp: 7200, atk: 140, def: 55, xp: 2100, gold: 1300 },
  },
  {
    id: 'shadow-keep',
    name: 'Shadow Keep',
    killsToBoss: 40,
    monsters: [
      { name: 'Umbral Knight', hp: 3400, atk: 170, def: 80, xp: 480, gold: 260 },
      { name: 'Void Acolyte', hp: 2800, atk: 200, def: 70, xp: 520, gold: 280 },
      { name: 'Gloom Stalker', hp: 3100, atk: 185, def: 75, xp: 500, gold: 270 },
    ],
    boss: { name: 'The Nameless King', hp: 16000, atk: 260, def: 110, xp: 5200, gold: 3200 },
  },
];

export function getZone(index) {
  return ZONES[Math.min(index, ZONES.length - 1)];
}
