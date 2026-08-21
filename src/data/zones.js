// Zone & monster definitions (Asheron's Call theme). Pure data — add zones here,
// never touch engine code. Stats are tuned so combat is brutal: monsters hit hard
// enough to threaten the hero at every zone, and survival is never guaranteed.

export const ZONES = [
  {
    id: 'drudge-hideout',
    name: 'Drudge Hideout',
    killsToBoss: 15,
    monsters: [
      { name: 'Drudge Skulker', hp: 22, atk: 8, def: 2, xp: 6, gold: 3 },
      { name: 'Drudge', hp: 28, atk: 9, def: 2, xp: 8, gold: 4 },
      { name: 'Shreth', hp: 34, atk: 8, def: 1, xp: 9, gold: 4 },
    ],
    boss: { name: 'Drudge Warlord', hp: 85, atk: 11, def: 2, xp: 70, gold: 45 },
  },
  {
    id: 'banderling-plains',
    name: 'Banderling Plains',
    killsToBoss: 20,
    monsters: [
      { name: 'Banderling', hp: 60, atk: 16, def: 5, xp: 18, gold: 9 },
      { name: 'Mosswart', hp: 48, atk: 18, def: 4, xp: 20, gold: 11 },
      { name: 'Banderling Guard', hp: 75, atk: 15, def: 6, xp: 19, gold: 10 },
    ],
    boss: { name: 'Banderling Chieftain', hp: 260, atk: 22, def: 6, xp: 180, gold: 115 },
  },
  {
    id: 'mosswart-horde',
    name: 'Mosswart Horde',
    killsToBoss: 25,
    monsters: [
      { name: 'Mosswart Raider', hp: 140, atk: 30, def: 10, xp: 42, gold: 22 },
      { name: 'Reedshark', hp: 175, atk: 34, def: 12, xp: 48, gold: 25 },
      { name: 'Mosswart Shaman', hp: 115, atk: 36, def: 9, xp: 45, gold: 24 },
    ],
    boss: { name: 'Mosswart Brood Mother', hp: 650, atk: 46, def: 14, xp: 420, gold: 260 },
  },
  {
    id: 'olthoi-nest',
    name: 'Olthoi Nest',
    killsToBoss: 30,
    monsters: [
      { name: 'Olthoi Nymph', hp: 360, atk: 58, def: 22, xp: 95, gold: 50 },
      { name: 'Skeleton Lord', hp: 470, atk: 52, def: 30, xp: 110, gold: 55 },
      { name: 'Olthoi Drone', hp: 310, atk: 62, def: 20, xp: 100, gold: 52 },
    ],
    boss: { name: 'Olthoi Soldier', hp: 1600, atk: 80, def: 28, xp: 950, gold: 580 },
  },
  {
    id: 'golem-caverns',
    name: 'Golem Caverns',
    killsToBoss: 35,
    monsters: [
      { name: 'Sandstone Golem', hp: 900, atk: 100, def: 50, xp: 210, gold: 110 },
      { name: 'Gromnie', hp: 700, atk: 112, def: 44, xp: 230, gold: 120 },
      { name: 'Mud Golem', hp: 1050, atk: 94, def: 56, xp: 220, gold: 115 },
    ],
    boss: { name: 'Magma Golem', hp: 3400, atk: 145, def: 55, xp: 2100, gold: 1300 },
  },
  {
    id: 'virindi-citadel',
    name: 'Virindi Citadel',
    killsToBoss: 45,
    monsters: [
      { name: 'Virindi', hp: 1500, atk: 180, def: 80, xp: 480, gold: 260 },
      { name: 'Lugian Raider', hp: 1900, atk: 170, def: 95, xp: 520, gold: 280 },
      { name: 'Virindi Consul', hp: 1350, atk: 195, def: 75, xp: 500, gold: 270 },
    ],
    boss: { name: 'Virindi Executor', hp: 7400, atk: 255, def: 100, xp: 5200, gold: 3200 },
  },
];

export function getZone(index) {
  return ZONES[Math.min(index, ZONES.length - 1)];
}
