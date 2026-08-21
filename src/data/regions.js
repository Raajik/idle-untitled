// Regions & Points of Interest (Asheron's Call theme). Pure data — add regions and
// POIs here, never touch engine code. A Region is a geographic area; a Point of
// Interest (POI) is a specific place where you fight monsters and complete quests.
//
// POIs are endlessly huntable once their region is reached — there is no linear
// unlock order. Difficulty instead scales with time+kills spent at a POI (see
// game/combat.js `computeDepth`), and each POI's boss is a rare random encounter
// once depth is high enough, not a one-time gate.
//
// Monsters/bosses carry only a `level` (stats are derived — see monsterScaling.js)
// and a `dmgType` (one of DAMAGE_TYPES, used by the Resistance skill).
//
// walkSeconds is the BASE travel time (before the Run skill's speed bonus) it
// takes to reach a region from town, or a POI from its region's hub.

export const DAMAGE_TYPES = ['bludgeon', 'pierce', 'slash', 'acid', 'cold', 'fire', 'lightning', 'void'];

export const REGIONS = [
  {
    id: 'holtburg',
    name: 'Holtburg',
    walkSeconds: 30,
    pois: [
      {
        id: 'holtburg-meeting-hall', name: 'Holtburg Meeting Hall', coords: '42.2N, 33.9E', quest: 'None', walkSeconds: 6,
        monsters: [
          { name: 'Militia Recruit', level: 1, dmgType: 'bludgeon' },
          { name: 'Training Dummy', level: 1, dmgType: 'bludgeon' },
          { name: 'Town Guard', level: 2, dmgType: 'bludgeon' },
        ],
        boss: { name: 'Militia Captain', level: 5, dmgType: 'bludgeon' },
      },
      {
        id: 'drudge-hideout', name: 'Drudge Hideout', coords: '41.4N, 33.3E', quest: "Alfrin's Stolen Supplies", walkSeconds: 12,
        monsters: [
          { name: 'Drudge Skulker', level: 2, dmgType: 'bludgeon' },
          { name: 'Drudge', level: 2, dmgType: 'bludgeon' },
          { name: 'Shreth', level: 3, dmgType: 'pierce' },
        ],
        boss: { name: 'Drudge Warlord', level: 6, dmgType: 'bludgeon' },
      },
      {
        id: 'holtburg-redoubt', name: 'Holtburg Redoubt', coords: '40.4N, 34.4E', quest: "Worcer's Missing Heirlooms", walkSeconds: 14,
        monsters: [
          { name: 'Banderling', level: 3, dmgType: 'slash' },
          { name: 'Banderling Guard', level: 3, dmgType: 'slash' },
          { name: 'Drudge Ravener', level: 4, dmgType: 'bludgeon' },
        ],
        boss: { name: 'Banderling Warlord', level: 7, dmgType: 'slash' },
      },
      {
        id: 'rat-nest', name: 'A Rat Nest', coords: '40.2N, 32.5E', quest: 'Rat Tails', walkSeconds: 16,
        monsters: [
          { name: 'Brown Rat', level: 4, dmgType: 'pierce' },
          { name: 'Grey Rat', level: 4, dmgType: 'pierce' },
          { name: 'Sewer Rat', level: 5, dmgType: 'acid' },
        ],
        boss: { name: 'Rat King', level: 8, dmgType: 'pierce' },
      },
      {
        id: 'cave-of-alabree', name: 'Cave of Alabree', coords: '41.8N, 32.1E', quest: "Brogord's Demise", walkSeconds: 18,
        monsters: [
          { name: 'Drudge Skulker', level: 5, dmgType: 'bludgeon' },
          { name: 'Drudge Mystic', level: 5, dmgType: 'lightning' },
          { name: 'Shreth Cub', level: 6, dmgType: 'cold' },
        ],
        boss: { name: 'Brogord the Axe', level: 9, dmgType: 'bludgeon' },
      },
      {
        id: 'holtburg-dungeon', name: 'Holtburg Dungeon', coords: '43.6N, 33.0E', quest: 'Sword of Lost Light Quest', walkSeconds: 20,
        monsters: [
          { name: 'Dungeon Drudge', level: 6, dmgType: 'bludgeon' },
          { name: 'Skeleton Lord', level: 6, dmgType: 'void' },
          { name: 'Undead Minion', level: 7, dmgType: 'void' },
        ],
        boss: { name: 'The Lost Light', level: 10, dmgType: 'void' },
      },
      {
        id: 'asuger-temple', name: 'Asuger Temple', coords: '45.1N, 30.4E', quest: "Elysa's Favor", walkSeconds: 22,
        monsters: [
          { name: 'Temple Drudge', level: 7, dmgType: 'bludgeon' },
          { name: 'Skeleton', level: 7, dmgType: 'void' },
          { name: 'Lesser Lich', level: 8, dmgType: 'void' },
        ],
        boss: { name: 'Asuger', level: 11, dmgType: 'void' },
      },
      {
        id: 'banderling-ruin', name: 'Banderling Ruin', coords: '36.1N, 39.6E', quest: 'Runed Chest', walkSeconds: 26,
        monsters: [
          { name: 'Banderling Scout', level: 8, dmgType: 'slash' },
          { name: 'Banderling Warrior', level: 8, dmgType: 'slash' },
          { name: 'Banderling Savage', level: 9, dmgType: 'slash' },
        ],
        boss: { name: 'Banderling Chieftain', level: 12, dmgType: 'slash' },
      },
      {
        id: 'dungeon-fern', name: 'Dungeon Fern', coords: '43.3N, 37.2E', quest: 'Runed Chest', walkSeconds: 28,
        monsters: [
          { name: 'Shreth', level: 9, dmgType: 'pierce' },
          { name: 'Shreth Elder', level: 9, dmgType: 'pierce' },
          { name: 'Fern Gromnie', level: 10, dmgType: 'acid' },
        ],
        boss: { name: 'Fern Guardian', level: 13, dmgType: 'acid' },
      },
      {
        id: 'mukkir-nest', name: 'Small Fledgling Mukkir Nest', coords: '43.5N, 36.1E', quest: 'Small Fledgling Mukkir Kill Task', walkSeconds: 30,
        monsters: [
          { name: 'Fledgling Mukkir', level: 10, dmgType: 'acid' },
          { name: 'Mukkir Drone', level: 10, dmgType: 'acid' },
          { name: 'Mukkir Spawnling', level: 11, dmgType: 'acid' },
        ],
        boss: { name: 'Mukkir Queen', level: 14, dmgType: 'acid' },
      },
      {
        id: 'hunters-leap', name: "Hunter's Leap", coords: '35.7N, 32.6E', quest: "Lilitha's Lost Bow", walkSeconds: 34,
        monsters: [
          { name: 'Shreth', level: 11, dmgType: 'pierce' },
          { name: 'Shreth Hunter', level: 11, dmgType: 'pierce' },
          { name: 'Ridgeback Shreth', level: 12, dmgType: 'pierce' },
        ],
        boss: { name: 'Shreth Alpha', level: 15, dmgType: 'pierce' },
      },
      {
        id: 'daiklos', name: 'Daiklos', coords: '33.7N, 29.2E', quest: 'Runed Chest', walkSeconds: 38,
        monsters: [
          { name: 'Skeleton', level: 12, dmgType: 'void' },
          { name: 'Zombie', level: 12, dmgType: 'acid' },
          { name: 'Wight', level: 13, dmgType: 'void' },
        ],
        boss: { name: 'Daiklos the Fallen', level: 16, dmgType: 'void' },
      },
      {
        id: 'heart-of-innocence', name: 'Heart of Innocence', coords: '34.0N, 39.0E (Approx.)', quest: 'Heart of Innocence Quest', walkSeconds: 40,
        monsters: [
          { name: 'Lost Soul', level: 13, dmgType: 'void' },
          { name: 'Wailing Banshee', level: 13, dmgType: 'cold' },
          { name: 'Tormented Spirit', level: 14, dmgType: 'void' },
        ],
        boss: { name: 'The Innocent One', level: 17, dmgType: 'void' },
      },
    ],
  },
  {
    id: 'glenden-wood',
    name: 'Glenden Wood',
    walkSeconds: 3600, // 1 hour at rank-0 Run; ~6 min once Run is maxed
    pois: [
      {
        id: 'banderling-plains', name: 'Banderling Plains', coords: '—', quest: 'None', walkSeconds: 20,
        monsters: [
          { name: 'Banderling', level: 18, dmgType: 'slash' },
          { name: 'Mosswart', level: 18, dmgType: 'acid' },
          { name: 'Banderling Guard', level: 19, dmgType: 'slash' },
        ],
        boss: { name: 'Banderling Chieftain', level: 23, dmgType: 'slash' },
      },
      {
        id: 'mosswart-horde', name: 'Mosswart Horde', coords: '—', quest: 'None', walkSeconds: 30,
        monsters: [
          { name: 'Mosswart Raider', level: 24, dmgType: 'acid' },
          { name: 'Reedshark', level: 25, dmgType: 'pierce' },
          { name: 'Mosswart Shaman', level: 25, dmgType: 'fire' },
        ],
        boss: { name: 'Mosswart Brood Mother', level: 30, dmgType: 'acid' },
      },
    ],
  },
  {
    id: 'eastham',
    name: 'Eastham',
    walkSeconds: 28800, // 8 hours at rank-0 Run; ~48 min once Run is maxed
    pois: [
      {
        id: 'olthoi-nest', name: 'Olthoi Nest', coords: '—', quest: 'None', walkSeconds: 20,
        monsters: [
          { name: 'Olthoi Nymph', level: 32, dmgType: 'acid' },
          { name: 'Skeleton Lord', level: 33, dmgType: 'void' },
          { name: 'Olthoi Drone', level: 34, dmgType: 'lightning' },
        ],
        boss: { name: 'Olthoi Soldier', level: 40, dmgType: 'acid' },
      },
    ],
  },
  {
    id: 'direlands',
    name: 'Direlands',
    walkSeconds: 86400, // 24 hours at rank-0 Run; ~2.4 hours once Run is maxed
    pois: [
      {
        id: 'golem-caverns', name: 'Golem Caverns', coords: '—', quest: 'None', walkSeconds: 20,
        monsters: [
          { name: 'Sandstone Golem', level: 45, dmgType: 'bludgeon' },
          { name: 'Gromnie', level: 46, dmgType: 'bludgeon' },
          { name: 'Mud Golem', level: 47, dmgType: 'cold' },
        ],
        boss: { name: 'Magma Golem', level: 55, dmgType: 'fire' },
      },
      {
        id: 'virindi-citadel', name: 'Virindi Citadel', coords: '—', quest: 'None', walkSeconds: 40,
        monsters: [
          { name: 'Virindi', level: 58, dmgType: 'lightning' },
          { name: 'Lugian Raider', level: 59, dmgType: 'bludgeon' },
          { name: 'Virindi Consul', level: 60, dmgType: 'lightning' },
        ],
        boss: { name: 'Virindi Executor', level: 68, dmgType: 'void' },
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
