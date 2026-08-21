// Regions & Points of Interest (Asheron's Call theme). Pure data — add regions and
// POIs here, never touch engine code. A Region is a geographic area; a Point of
// Interest (POI) is a specific place where you fight monsters and complete quests.
//
// POIs are endlessly huntable once their region is reached — there is no linear
// unlock order. Difficulty instead scales with time+kills spent at a POI (see
// game/combat.js `computeDepth`), and each POI's boss is a rare random encounter
// once depth is high enough, not a one-time gate.
//
// walkSeconds is the BASE travel time (before the Run skill's speed bonus) it
// takes to reach a region from town, or a POI from its region's hub.
//
// Rewards are AC-scale (XP in hundreds/thousands, pyreals in hundreds).

export const REGIONS = [
  {
    id: 'holtburg',
    name: 'Holtburg',
    walkSeconds: 30,
    pois: [
      {
        id: 'holtburg-meeting-hall', name: 'Holtburg Meeting Hall', coords: '42.2N, 33.9E', quest: 'None', walkSeconds: 6,
        monsters: [
          { name: 'Militia Recruit', hp: 20, atk: 7, def: 1, xp: 500, pyreals: 250 },
          { name: 'Training Dummy', hp: 30, atk: 4, def: 2, xp: 400, pyreals: 200 },
          { name: 'Town Guard', hp: 26, atk: 9, def: 3, xp: 700, pyreals: 350 },
        ],
        boss: { name: 'Militia Captain', hp: 80, atk: 11, def: 3, xp: 6500, pyreals: 4000 },
      },
      {
        id: 'drudge-hideout', name: 'Drudge Hideout', coords: '41.4N, 33.3E', quest: "Alfrin's Stolen Supplies", walkSeconds: 12,
        monsters: [
          { name: 'Drudge Skulker', hp: 22, atk: 8, def: 2, xp: 600, pyreals: 300 },
          { name: 'Drudge', hp: 28, atk: 9, def: 2, xp: 800, pyreals: 400 },
          { name: 'Shreth', hp: 34, atk: 8, def: 1, xp: 900, pyreals: 400 },
        ],
        boss: { name: 'Drudge Warlord', hp: 85, atk: 11, def: 2, xp: 7000, pyreals: 4500 },
      },
      {
        id: 'holtburg-redoubt', name: 'Holtburg Redoubt', coords: '40.4N, 34.4E', quest: "Worcer's Missing Heirlooms", walkSeconds: 14,
        monsters: [
          { name: 'Banderling', hp: 36, atk: 12, def: 4, xp: 1050, pyreals: 550 },
          { name: 'Banderling Guard', hp: 42, atk: 13, def: 5, xp: 1150, pyreals: 600 },
          { name: 'Drudge Ravener', hp: 38, atk: 13, def: 4, xp: 1100, pyreals: 550 },
        ],
        boss: { name: 'Banderling Warlord', hp: 125, atk: 16, def: 5, xp: 11000, pyreals: 7000 },
      },
      {
        id: 'rat-nest', name: 'A Rat Nest', coords: '40.2N, 32.5E', quest: 'Rat Tails', walkSeconds: 16,
        monsters: [
          { name: 'Brown Rat', hp: 14, atk: 6, def: 1, xp: 500, pyreals: 250 },
          { name: 'Grey Rat', hp: 12, atk: 7, def: 0, xp: 450, pyreals: 250 },
          { name: 'Sewer Rat', hp: 18, atk: 6, def: 1, xp: 550, pyreals: 300 },
        ],
        boss: { name: 'Rat King', hp: 55, atk: 10, def: 2, xp: 6000, pyreals: 3500 },
      },
      {
        id: 'cave-of-alabree', name: 'Cave of Alabree', coords: '41.8N, 32.1E', quest: "Brogord's Demise", walkSeconds: 18,
        monsters: [
          { name: 'Drudge Skulker', hp: 22, atk: 8, def: 2, xp: 600, pyreals: 300 },
          { name: 'Drudge Mystic', hp: 26, atk: 10, def: 2, xp: 800, pyreals: 400 },
          { name: 'Shreth Cub', hp: 30, atk: 9, def: 1, xp: 700, pyreals: 350 },
        ],
        boss: { name: 'Brogord the Axe', hp: 90, atk: 12, def: 3, xp: 7500, pyreals: 4500 },
      },
      {
        id: 'holtburg-dungeon', name: 'Holtburg Dungeon', coords: '43.6N, 33.0E', quest: 'Sword of Lost Light Quest', walkSeconds: 20,
        monsters: [
          { name: 'Dungeon Drudge', hp: 30, atk: 10, def: 3, xp: 900, pyreals: 450 },
          { name: 'Skeleton Lord', hp: 38, atk: 12, def: 4, xp: 1100, pyreals: 550 },
          { name: 'Undead Minion', hp: 34, atk: 11, def: 3, xp: 1000, pyreals: 500 },
        ],
        boss: { name: 'The Lost Light', hp: 120, atk: 15, def: 5, xp: 10500, pyreals: 6500 },
      },
      {
        id: 'asuger-temple', name: 'Asuger Temple', coords: '45.1N, 30.4E', quest: "Elysa's Favor", walkSeconds: 22,
        monsters: [
          { name: 'Temple Drudge', hp: 26, atk: 10, def: 2, xp: 800, pyreals: 400 },
          { name: 'Skeleton', hp: 24, atk: 11, def: 3, xp: 850, pyreals: 400 },
          { name: 'Lesser Lich', hp: 34, atk: 12, def: 3, xp: 950, pyreals: 500 },
        ],
        boss: { name: 'Asuger', hp: 90, atk: 13, def: 3, xp: 8000, pyreals: 5000 },
      },
      {
        id: 'banderling-ruin', name: 'Banderling Ruin', coords: '36.1N, 39.6E', quest: 'Runed Chest', walkSeconds: 26,
        monsters: [
          { name: 'Banderling Scout', hp: 30, atk: 11, def: 3, xp: 900, pyreals: 450 },
          { name: 'Banderling Warrior', hp: 40, atk: 12, def: 4, xp: 1000, pyreals: 500 },
          { name: 'Banderling Savage', hp: 34, atk: 13, def: 3, xp: 950, pyreals: 500 },
        ],
        boss: { name: 'Banderling Chieftain', hp: 100, atk: 14, def: 4, xp: 9000, pyreals: 5500 },
      },
      {
        id: 'dungeon-fern', name: 'Dungeon Fern', coords: '43.3N, 37.2E', quest: 'Runed Chest', walkSeconds: 28,
        monsters: [
          { name: 'Shreth', hp: 34, atk: 8, def: 1, xp: 900, pyreals: 400 },
          { name: 'Shreth Elder', hp: 40, atk: 9, def: 2, xp: 1000, pyreals: 500 },
          { name: 'Fern Gromnie', hp: 36, atk: 11, def: 3, xp: 1000, pyreals: 500 },
        ],
        boss: { name: 'Fern Guardian', hp: 110, atk: 14, def: 4, xp: 9500, pyreals: 5800 },
      },
      {
        id: 'mukkir-nest', name: 'Small Fledgling Mukkir Nest', coords: '43.5N, 36.1E', quest: 'Small Fledgling Mukkir Kill Task', walkSeconds: 30,
        monsters: [
          { name: 'Fledgling Mukkir', hp: 42, atk: 14, def: 4, xp: 1150, pyreals: 600 },
          { name: 'Mukkir Drone', hp: 48, atk: 14, def: 5, xp: 1200, pyreals: 650 },
          { name: 'Mukkir Spawnling', hp: 38, atk: 15, def: 4, xp: 1150, pyreals: 600 },
        ],
        boss: { name: 'Mukkir Queen', hp: 135, atk: 17, def: 5, xp: 12000, pyreals: 7500 },
      },
      {
        id: 'hunters-leap', name: "Hunter's Leap", coords: '35.7N, 32.6E', quest: "Lilitha's Lost Bow", walkSeconds: 34,
        monsters: [
          { name: 'Shreth', hp: 34, atk: 8, def: 1, xp: 900, pyreals: 400 },
          { name: 'Shreth Hunter', hp: 40, atk: 10, def: 2, xp: 1000, pyreals: 500 },
          { name: 'Ridgeback Shreth', hp: 46, atk: 11, def: 3, xp: 1100, pyreals: 550 },
        ],
        boss: { name: 'Shreth Alpha', hp: 115, atk: 14, def: 4, xp: 10000, pyreals: 6200 },
      },
      {
        id: 'daiklos', name: 'Daiklos', coords: '33.7N, 29.2E', quest: 'Runed Chest', walkSeconds: 38,
        monsters: [
          { name: 'Skeleton', hp: 24, atk: 11, def: 3, xp: 850, pyreals: 400 },
          { name: 'Zombie', hp: 30, atk: 10, def: 2, xp: 800, pyreals: 400 },
          { name: 'Wight', hp: 34, atk: 12, def: 3, xp: 950, pyreals: 500 },
        ],
        boss: { name: 'Daiklos the Fallen', hp: 100, atk: 14, def: 4, xp: 8500, pyreals: 5200 },
      },
      {
        id: 'heart-of-innocence', name: 'Heart of Innocence', coords: '34.0N, 39.0E (Approx.)', quest: 'Heart of Innocence Quest', walkSeconds: 40,
        monsters: [
          { name: 'Lost Soul', hp: 36, atk: 12, def: 3, xp: 1000, pyreals: 500 },
          { name: 'Wailing Banshee', hp: 32, atk: 13, def: 3, xp: 1050, pyreals: 550 },
          { name: 'Tormented Spirit', hp: 40, atk: 12, def: 4, xp: 1100, pyreals: 550 },
        ],
        boss: { name: 'The Innocent One', hp: 115, atk: 15, def: 4, xp: 10000, pyreals: 6000 },
      },
    ],
  },
  {
    id: 'glenden-wood',
    name: 'Glenden Wood',
    walkSeconds: 480,
    pois: [
      {
        id: 'banderling-plains', name: 'Banderling Plains', coords: '—', quest: 'None', walkSeconds: 20,
        monsters: [
          { name: 'Banderling', hp: 60, atk: 16, def: 5, xp: 1800, pyreals: 900 },
          { name: 'Mosswart', hp: 48, atk: 18, def: 4, xp: 2000, pyreals: 1100 },
          { name: 'Banderling Guard', hp: 75, atk: 15, def: 6, xp: 1900, pyreals: 1000 },
        ],
        boss: { name: 'Banderling Chieftain', hp: 260, atk: 22, def: 6, xp: 18000, pyreals: 11500 },
      },
      {
        id: 'mosswart-horde', name: 'Mosswart Horde', coords: '—', quest: 'None', walkSeconds: 30,
        monsters: [
          { name: 'Mosswart Raider', hp: 140, atk: 30, def: 10, xp: 4200, pyreals: 2200 },
          { name: 'Reedshark', hp: 175, atk: 34, def: 12, xp: 4800, pyreals: 2500 },
          { name: 'Mosswart Shaman', hp: 115, atk: 36, def: 9, xp: 4500, pyreals: 2400 },
        ],
        boss: { name: 'Mosswart Brood Mother', hp: 650, atk: 46, def: 14, xp: 42000, pyreals: 26000 },
      },
    ],
  },
  {
    id: 'eastham',
    name: 'Eastham',
    walkSeconds: 1500,
    pois: [
      {
        id: 'olthoi-nest', name: 'Olthoi Nest', coords: '—', quest: 'None', walkSeconds: 20,
        monsters: [
          { name: 'Olthoi Nymph', hp: 360, atk: 58, def: 22, xp: 9500, pyreals: 5000 },
          { name: 'Skeleton Lord', hp: 470, atk: 52, def: 30, xp: 11000, pyreals: 5500 },
          { name: 'Olthoi Drone', hp: 310, atk: 62, def: 20, xp: 10000, pyreals: 5200 },
        ],
        boss: { name: 'Olthoi Soldier', hp: 1600, atk: 80, def: 28, xp: 95000, pyreals: 58000 },
      },
    ],
  },
  {
    id: 'direlands',
    name: 'Direlands',
    walkSeconds: 7200,
    pois: [
      {
        id: 'golem-caverns', name: 'Golem Caverns', coords: '—', quest: 'None', walkSeconds: 20,
        monsters: [
          { name: 'Sandstone Golem', hp: 900, atk: 100, def: 50, xp: 21000, pyreals: 11000 },
          { name: 'Gromnie', hp: 700, atk: 112, def: 44, xp: 23000, pyreals: 12000 },
          { name: 'Mud Golem', hp: 1050, atk: 94, def: 56, xp: 22000, pyreals: 11500 },
        ],
        boss: { name: 'Magma Golem', hp: 3400, atk: 145, def: 55, xp: 210000, pyreals: 130000 },
      },
      {
        id: 'virindi-citadel', name: 'Virindi Citadel', coords: '—', quest: 'None', walkSeconds: 40,
        monsters: [
          { name: 'Virindi', hp: 1500, atk: 180, def: 80, xp: 48000, pyreals: 26000 },
          { name: 'Lugian Raider', hp: 1900, atk: 170, def: 95, xp: 52000, pyreals: 28000 },
          { name: 'Virindi Consul', hp: 1350, atk: 195, def: 75, xp: 50000, pyreals: 27000 },
        ],
        boss: { name: 'Virindi Executor', hp: 7400, atk: 255, def: 100, xp: 520000, pyreals: 320000 },
      },
    ],
  },
];

// Flattened POI list (with region info attached) for lookups that don't care which
// region a POI belongs to.
export const POIS = REGIONS.flatMap((r) => r.pois.map((p) => ({ ...p, region: r.name, regionId: r.id })));

export function getRegion(regionId) {
  return REGIONS.find((r) => r.id === regionId) || null;
}

export function getPoiById(poiId) {
  return POIS.find((p) => p.id === poiId) || null;
}

export function regionIndex(regionId) {
  return REGIONS.findIndex((r) => r.id === regionId);
}
