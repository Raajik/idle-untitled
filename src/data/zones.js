// Zone & monster definitions. Pure data — add zones here, never touch engine code.
//
// Each zone: monsters array, killsToBoss, and a boss. Monster stats are base values
// for the zone; combat scales them slightly per kill within the zone for a gentle
// difficulty ramp. Numbers are intentionally small and readable.

export const ZONES = [
  {
    id: 'slime-meadow',
    name: 'Slime Meadow',
    killsToBoss: 15,
    monsters: [
      { name: 'Green Slime', hp: 12, atk: 2, def: 0, xp: 6, gold: 3 },
      { name: 'Blue Slime', hp: 16, atk: 3, def: 1, xp: 8, gold: 4 },
      { name: 'Slime Bud', hp: 9, atk: 1, def: 0, xp: 5, gold: 3 },
    ],
    boss: { name: 'King Slime', hp: 55, atk: 5, def: 1, xp: 60, gold: 40 },
  },
  {
    id: 'goblin-camp',
    name: 'Goblin Camp',
    killsToBoss: 20,
    monsters: [
      { name: 'Goblin Grunt', hp: 34, atk: 6, def: 2, xp: 18, gold: 9 },
      { name: 'Goblin Slinger', hp: 26, atk: 8, def: 1, xp: 20, gold: 11 },
      { name: 'Warg Pup', hp: 42, atk: 5, def: 3, xp: 19, gold: 10 },
    ],
    boss: { name: 'Goblin Chief', hp: 200, atk: 10, def: 3, xp: 170, gold: 110 },
  },
  {
    id: 'whispering-woods',
    name: 'Whispering Woods',
    killsToBoss: 25,
    monsters: [
      { name: 'Thorn Sprite', hp: 95, atk: 12, def: 4, xp: 42, gold: 22 },
      { name: 'Murk Wolf', hp: 125, atk: 14, def: 5, xp: 48, gold: 25 },
      { name: 'Hex Crow', hp: 80, atk: 16, def: 4, xp: 45, gold: 24 },
    ],
    boss: { name: 'The Whisperer', hp: 620, atk: 22, def: 8, xp: 420, gold: 260 },
  },
  {
    id: 'ember-caves',
    name: 'Ember Caves',
    killsToBoss: 30,
    monsters: [
      { name: 'Cinder Imp', hp: 240, atk: 25, def: 10, xp: 95, gold: 50 },
      { name: 'Magma Turtle', hp: 380, atk: 21, def: 16, xp: 110, gold: 55 },
      { name: 'Ash Bat', hp: 210, atk: 28, def: 9, xp: 100, gold: 52 },
    ],
    boss: { name: 'Emberlord Vrax', hp: 1600, atk: 38, def: 15, xp: 950, gold: 580 },
  },
  {
    id: 'frost-peak',
    name: 'Frost Peak',
    killsToBoss: 35,
    monsters: [
      { name: 'Rime Golem', hp: 750, atk: 44, def: 24, xp: 210, gold: 110 },
      { name: 'Snow Harpy', hp: 560, atk: 52, def: 20, xp: 230, gold: 120 },
      { name: 'Glacial Wisp', hp: 470, atk: 57, def: 18, xp: 220, gold: 115 },
    ],
    boss: { name: 'Wintermaw', hp: 3400, atk: 74, def: 28, xp: 2100, gold: 1300 },
  },
  {
    id: 'shadow-keep',
    name: 'Shadow Keep',
    killsToBoss: 45,
    monsters: [
      { name: 'Umbral Knight', hp: 1550, atk: 88, def: 42, xp: 480, gold: 260 },
      { name: 'Void Acolyte', hp: 1300, atk: 105, def: 36, xp: 520, gold: 280 },
      { name: 'Gloom Stalker', hp: 1420, atk: 96, def: 39, xp: 500, gold: 270 },
    ],
    boss: { name: 'The Nameless King', hp: 7600, atk: 135, def: 58, xp: 5200, gold: 3200 },
  },
];

export function getZone(index) {
  return ZONES[Math.min(index, ZONES.length - 1)];
}
