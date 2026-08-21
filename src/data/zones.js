// Zone & monster definitions (Asheron's Call theme). Pure data — add zones here,
// never touch engine code. Stats are tuned so combat is brutal: monsters hit hard
// enough to threaten the hero at every zone, and survival is never guaranteed.
//
// Rewards are AC-scale: XP in the hundreds/thousands, pyreals in the hundreds.

export const ZONES = [
  {
    id: 'drudge-hideout',
    name: 'Drudge Hideout',
    killsToBoss: 15,
    monsters: [
      { name: 'Drudge Skulker', hp: 22, atk: 8, def: 2, xp: 600, pyreals: 300 },
      { name: 'Drudge', hp: 28, atk: 9, def: 2, xp: 800, pyreals: 400 },
      { name: 'Shreth', hp: 34, atk: 8, def: 1, xp: 900, pyreals: 400 },
    ],
    boss: { name: 'Drudge Warlord', hp: 85, atk: 11, def: 2, xp: 7000, pyreals: 4500 },
  },
  {
    id: 'banderling-plains',
    name: 'Banderling Plains',
    killsToBoss: 20,
    monsters: [
      { name: 'Banderling', hp: 60, atk: 16, def: 5, xp: 1800, pyreals: 900 },
      { name: 'Mosswart', hp: 48, atk: 18, def: 4, xp: 2000, pyreals: 1100 },
      { name: 'Banderling Guard', hp: 75, atk: 15, def: 6, xp: 1900, pyreals: 1000 },
    ],
    boss: { name: 'Banderling Chieftain', hp: 260, atk: 22, def: 6, xp: 18000, pyreals: 11500 },
  },
  {
    id: 'mosswart-horde',
    name: 'Mosswart Horde',
    killsToBoss: 25,
    monsters: [
      { name: 'Mosswart Raider', hp: 140, atk: 30, def: 10, xp: 4200, pyreals: 2200 },
      { name: 'Reedshark', hp: 175, atk: 34, def: 12, xp: 4800, pyreals: 2500 },
      { name: 'Mosswart Shaman', hp: 115, atk: 36, def: 9, xp: 4500, pyreals: 2400 },
    ],
    boss: { name: 'Mosswart Brood Mother', hp: 650, atk: 46, def: 14, xp: 42000, pyreals: 26000 },
  },
  {
    id: 'olthoi-nest',
    name: 'Olthoi Nest',
    killsToBoss: 30,
    monsters: [
      { name: 'Olthoi Nymph', hp: 360, atk: 58, def: 22, xp: 9500, pyreals: 5000 },
      { name: 'Skeleton Lord', hp: 470, atk: 52, def: 30, xp: 11000, pyreals: 5500 },
      { name: 'Olthoi Drone', hp: 310, atk: 62, def: 20, xp: 10000, pyreals: 5200 },
    ],
    boss: { name: 'Olthoi Soldier', hp: 1600, atk: 80, def: 28, xp: 95000, pyreals: 58000 },
  },
  {
    id: 'golem-caverns',
    name: 'Golem Caverns',
    killsToBoss: 35,
    monsters: [
      { name: 'Sandstone Golem', hp: 900, atk: 100, def: 50, xp: 21000, pyreals: 11000 },
      { name: 'Gromnie', hp: 700, atk: 112, def: 44, xp: 23000, pyreals: 12000 },
      { name: 'Mud Golem', hp: 1050, atk: 94, def: 56, xp: 22000, pyreals: 11500 },
    ],
    boss: { name: 'Magma Golem', hp: 3400, atk: 145, def: 55, xp: 210000, pyreals: 130000 },
  },
  {
    id: 'virindi-citadel',
    name: 'Virindi Citadel',
    killsToBoss: 45,
    monsters: [
      { name: 'Virindi', hp: 1500, atk: 180, def: 80, xp: 48000, pyreals: 26000 },
      { name: 'Lugian Raider', hp: 1900, atk: 170, def: 95, xp: 52000, pyreals: 28000 },
      { name: 'Virindi Consul', hp: 1350, atk: 195, def: 75, xp: 50000, pyreals: 27000 },
    ],
    boss: { name: 'Virindi Executor', hp: 7400, atk: 255, def: 100, xp: 520000, pyreals: 320000 },
  },
];

export function getZone(index) {
  return ZONES[Math.min(index, ZONES.length - 1)];
}
