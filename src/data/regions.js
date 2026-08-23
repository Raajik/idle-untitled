// Regions & Points of Interest (Asheron's Call theme). Pure data — add regions and
// POIs here, never touch engine code. A Region is a geographic area; a Point of
// Interest (POI) is a specific place where you fight monsters and complete quests.
//
// POIs are endlessly huntable once their region is reached — there is no linear
// unlock order. A POI is fought in waves of 1-3 monsters (see game/waves.js);
// difficulty rises with the wave number, and clearing the last wave is a "full
// clear" that pays out the POI's `gather` material and restarts the waves. That
// material is the reason to farm one POI over another.
//
// `gather` is { skill, material }: which gathering skill a full clear trains and
// which material it yields. The material must be a member of that skill's pool in
// data/materials.js (GATHER_MATERIAL_POOLS) — test/waves.test.js enforces it.
//
// Monsters carry only a `level` (stats are derived — see monsterScaling.js) and a
// `dmgType` (one of DAMAGE_TYPES, used by the Resistance skill). `boss` is data
// only for now: bosses no longer spawn inside a POI's waves and will become their
// own dedicated boss POIs.
//
// `swarmMax` is how many monsters a region will throw at you simultaneously on a
// POI's last wave (see game/waves.js rollSwarmSize). One is the norm everywhere;
// the Direlands is where being surrounded becomes the actual threat.
//
// walkSeconds is the BASE travel time (before Athletics' speed bonus) it takes to
// reach a region from town, or a POI from its region's hub.
//
// The spread within a region is deliberately wide — a few seconds to the nearest
// site, minutes to the far edge. Athletics divides all of it, so the difference
// between rank 0 and rank 100 on a 225-second haul is most of four minutes, and
// the skill is worth levelling rather than a rounding error.

export const DAMAGE_TYPES = ['bludgeon', 'pierce', 'slash', 'acid', 'cold', 'fire', 'lightning', 'void'];

// Elemental/void damage reads as magic-based (what Magic Resistance defends against);
// bludgeon/pierce/slash are physical weapon damage.
export const MAGIC_DAMAGE_TYPES = ['acid', 'cold', 'fire', 'lightning', 'void'];

export function isMagicDamageType(dmgType) {
  return MAGIC_DAMAGE_TYPES.includes(dmgType);
}

export const REGIONS = [
  {
    id: 'holtburg',
    swarmMax: 2, // most this region will put on you at once, on its deepest wave
    name: 'Holtburg',
    walkSeconds: 180, // 3 minutes — matches TUTORIAL_JOURNEY_SECONDS for the "seen a Lifestone" path that skips the scripted journey
    pois: [
      {
        // A "site": no monsters, so no waves and no combat — you go here to work on
        // the Lifestone itself (see game/lifestone.js). Growing it moves your bind
        // point from the far-off starting stone to Holtburg's town hub, which is what
        // turns a death from a three-minute walk back into a few seconds.
        id: 'budding-lifestone', name: 'A Budding Lifestone', coords: '42.9N, 33.4E', quest: 'Grow the Lifestone', walkSeconds: 6,
        site: 'lifestone',
        condition: 'budding',
        monsters: [],
      },
      {
        id: 'drudge-hideout', name: 'Drudge Hideout', coords: '41.4N, 33.3E', quest: "Alfrin's Stolen Supplies", walkSeconds: 8,
        gather: { skill: 'woodcutting', material: 'mahogany' },
        monsters: [
          { name: 'Drudge Skulker', level: 2, dmgType: 'bludgeon' },
          { name: 'Drudge', level: 2, dmgType: 'bludgeon' },
          { name: 'Shreth', level: 3, dmgType: 'pierce' },
        ],
        boss: { name: 'Drudge Warlord', level: 6, dmgType: 'bludgeon' },
      },
      {
        id: 'holtburg-redoubt', name: 'Holtburg Redoubt', coords: '40.4N, 34.4E', quest: "Worcer's Missing Heirlooms", walkSeconds: 12,
        gather: { skill: 'mining', material: 'green-garnet' },
        monsters: [
          { name: 'Banderling', level: 3, dmgType: 'slash' },
          { name: 'Banderling Guard', level: 3, dmgType: 'slash' },
          { name: 'Drudge Ravener', level: 4, dmgType: 'bludgeon' },
        ],
        boss: { name: 'Banderling Warlord', level: 7, dmgType: 'slash' },
      },
      {
        id: 'colier-mine', name: 'Colier Mine', coords: '39.9N, 33.8E', quest: 'None', walkSeconds: 16,
        gather: { skill: 'mining', material: 'opal' },
        monsters: [
          { name: 'Mine Drudge', level: 3, dmgType: 'bludgeon' },
          { name: 'Cave Lurker', level: 3, dmgType: 'pierce' },
          { name: 'Rockslide Golem', level: 4, dmgType: 'bludgeon' },
        ],
        boss: { name: 'The Deep Foreman', level: 8, dmgType: 'bludgeon' },
      },
      {
        id: 'green-mire-grave', name: 'Green Mire Grave', coords: '38.4N, 35.1E', quest: 'None', walkSeconds: 24,
        gather: { skill: 'foraging', material: 'velvet' },
        monsters: [
          { name: 'Grave Mite', level: 3, dmgType: 'acid' },
          { name: 'Shallow Wisp', level: 4, dmgType: 'void' },
          { name: 'Mire Zombie', level: 4, dmgType: 'acid' },
        ],
        boss: { name: 'The Mire Warden', level: 9, dmgType: 'void' },
      },
      {
        id: 'rat-nest', name: 'A Rat Nest', coords: '40.2N, 32.5E', quest: 'Rat Tails', walkSeconds: 20,
        gather: { skill: 'mining', material: 'copper' },
        monsters: [
          { name: 'Brown Rat', level: 4, dmgType: 'pierce' },
          { name: 'Grey Rat', level: 4, dmgType: 'pierce' },
          { name: 'Sewer Rat', level: 5, dmgType: 'acid' },
        ],
        boss: { name: 'Rat King', level: 8, dmgType: 'pierce' },
      },
      {
        // Skinning has to be somewhere you go on purpose, not a by-product of a
        // dungeon that happened to have an animal in it.
        id: 'ursuin-run', name: 'The Ursuin Run', coords: '39.1N, 31.7E', quest: 'Hunt Wild Ursuin', walkSeconds: 28,
        gather: { skill: 'skinning', material: 'ursuin-pelt' },
        monsters: [
          { name: 'Ursuin Cub', level: 4, dmgType: 'slash' },
          { name: 'Wild Ursuin', level: 5, dmgType: 'slash' },
          { name: 'Ursuin Matriarch', level: 5, dmgType: 'bludgeon' },
        ],
        boss: { name: 'The Grey Ursuin', level: 9, dmgType: 'slash' },
      },
      {
        id: 'cave-of-alabree', name: 'Cave of Alabree', coords: '41.8N, 32.1E', quest: "Brogord's Demise", walkSeconds: 34,
        gather: { skill: 'mining', material: 'iron' },
        monsters: [
          { name: 'Drudge Skulker', level: 5, dmgType: 'bludgeon' },
          { name: 'Drudge Mystic', level: 5, dmgType: 'lightning' },
          { name: 'Shreth Cub', level: 6, dmgType: 'cold' },
        ],
        boss: { name: 'Brogord the Axe', level: 9, dmgType: 'bludgeon' },
      },
      {
        id: 'holtburg-dungeon', name: 'Holtburg Dungeon', coords: '43.6N, 33.0E', quest: 'Sword of Lost Light Quest', walkSeconds: 45,
        gather: { skill: 'mining', material: 'granite' },
        monsters: [
          { name: 'Dungeon Drudge', level: 6, dmgType: 'bludgeon' },
          { name: 'Skeleton Lord', level: 6, dmgType: 'void' },
          { name: 'Undead Minion', level: 7, dmgType: 'void' },
        ],
        boss: { name: 'The Lost Light', level: 10, dmgType: 'void' },
      },
      {
        id: 'asuger-temple', name: 'Asuger Temple', coords: '45.1N, 30.4E', quest: "Elysa's Favor", walkSeconds: 58,
        gather: { skill: 'foraging', material: 'linen' },
        monsters: [
          { name: 'Temple Drudge', level: 7, dmgType: 'bludgeon' },
          { name: 'Skeleton', level: 7, dmgType: 'void' },
          { name: 'Lesser Lich', level: 8, dmgType: 'void' },
        ],
        boss: { name: 'Asuger', level: 11, dmgType: 'void' },
      },
      {
        id: 'banderling-ruin', name: 'Banderling Ruin', coords: '36.1N, 39.6E', quest: 'Runed Chest', walkSeconds: 75,
        gather: { skill: 'mining', material: 'gold' },
        monsters: [
          { name: 'Banderling Scout', level: 8, dmgType: 'slash' },
          { name: 'Banderling Warrior', level: 8, dmgType: 'slash' },
          { name: 'Banderling Savage', level: 9, dmgType: 'slash' },
        ],
        boss: { name: 'Banderling Chieftain', level: 12, dmgType: 'slash' },
      },
      {
        id: 'dungeon-fern', name: 'Dungeon Fern', coords: '43.3N, 37.2E', quest: 'Runed Chest', walkSeconds: 95,
        gather: { skill: 'woodcutting', material: 'oak' },
        monsters: [
          { name: 'Shreth', level: 9, dmgType: 'pierce' },
          { name: 'Shreth Elder', level: 9, dmgType: 'pierce' },
          { name: 'Fern Gromnie', level: 10, dmgType: 'acid' },
        ],
        boss: { name: 'Fern Guardian', level: 13, dmgType: 'acid' },
      },
      {
        id: 'mukkir-nest', name: 'Small Fledgling Mukkir Nest', coords: '43.5N, 36.1E', quest: 'Small Fledgling Mukkir Kill Task', walkSeconds: 120,
        gather: { skill: 'mining', material: 'silver' },
        monsters: [
          { name: 'Fledgling Mukkir', level: 10, dmgType: 'acid' },
          { name: 'Mukkir Drone', level: 10, dmgType: 'acid' },
          { name: 'Mukkir Spawnling', level: 11, dmgType: 'acid' },
        ],
        boss: { name: 'Mukkir Queen', level: 14, dmgType: 'acid' },
      },
      {
        id: 'hunters-leap', name: "Hunter's Leap", coords: '35.7N, 32.6E', quest: "Lilitha's Lost Bow", walkSeconds: 150,
        gather: { skill: 'skinning', material: 'gromnie-hide' },
        monsters: [
          { name: 'Shreth', level: 11, dmgType: 'pierce' },
          { name: 'Shreth Hunter', level: 11, dmgType: 'pierce' },
          { name: 'Ridgeback Shreth', level: 12, dmgType: 'pierce' },
        ],
        boss: { name: 'Shreth Alpha', level: 15, dmgType: 'pierce' },
      },
      {
        id: 'daiklos', name: 'Daiklos', coords: '33.7N, 29.2E', quest: 'Runed Chest', walkSeconds: 185,
        gather: { skill: 'woodcutting', material: 'ebony' },
        monsters: [
          { name: 'Skeleton', level: 12, dmgType: 'void' },
          { name: 'Zombie', level: 12, dmgType: 'acid' },
          { name: 'Wight', level: 13, dmgType: 'void' },
        ],
        boss: { name: 'Daiklos the Fallen', level: 16, dmgType: 'void' },
      },
      {
        id: 'heart-of-innocence', name: 'Heart of Innocence', coords: '34.0N, 39.0E (Approx.)', quest: 'Heart of Innocence Quest', walkSeconds: 225,
        gather: { skill: 'fishing', material: 'moonstone' },
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
    swarmMax: 3, // most this region will put on you at once, on its deepest wave
    name: 'Glenden Wood',
    walkSeconds: 1200, // 20 min at rank-0 Athletics; ~2 min once Athletics is maxed
    pois: [
      {
        id: 'glenden-lifestone', name: 'A Cracked Lifestone', coords: '—', quest: 'Restore the Lifestone', walkSeconds: 8,
        site: 'lifestone',
        condition: 'cracked',
        monsters: [],
      },
      {
        id: 'banderling-plains', name: 'Banderling Plains', coords: '—', quest: 'None', walkSeconds: 30,
        gather: { skill: 'woodcutting', material: 'pine' },
        monsters: [
          { name: 'Banderling', level: 18, dmgType: 'slash' },
          { name: 'Mosswart', level: 18, dmgType: 'acid' },
          { name: 'Banderling Guard', level: 19, dmgType: 'slash' },
        ],
        boss: { name: 'Banderling Chieftain', level: 23, dmgType: 'slash' },
      },
      {
        id: 'armoredillo-warren', name: 'Armoredillo Warren', coords: '—', quest: 'Hunt Armoredillos', walkSeconds: 70,
        gather: { skill: 'skinning', material: 'armoredillo-hide' },
        monsters: [
          { name: 'Armoredillo', level: 19, dmgType: 'bludgeon' },
          { name: 'Banded Armoredillo', level: 20, dmgType: 'bludgeon' },
          { name: 'Elder Armoredillo', level: 21, dmgType: 'pierce' },
        ],
        boss: { name: 'The Ironback', level: 25, dmgType: 'bludgeon' },
      },
      {
        id: 'mosswart-horde', name: 'Mosswart Horde', coords: '—', quest: 'None', walkSeconds: 140,
        gather: { skill: 'fishing', material: 'amber' },
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
    swarmMax: 5, // most this region will put on you at once, on its deepest wave
    name: 'Eastham',
    walkSeconds: 7200, // 2 hours at rank-0 Athletics; ~12 min once Athletics is maxed
    pois: [
      {
        id: 'eastham-lifestone', name: 'A Shattered Lifestone', coords: '—', quest: 'Restore the Lifestone', walkSeconds: 10,
        site: 'lifestone',
        condition: 'shattered',
        monsters: [],
      },
      {
        id: 'olthoi-nest', name: 'Olthoi Nest', coords: '—', quest: 'None', walkSeconds: 60,
        gather: { skill: 'fishing', material: 'amber' },
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
    swarmMax: 8, // most this region will put on you at once, on its deepest wave
    name: 'Direlands',
    walkSeconds: 21600, // 6 hours at rank-0 Athletics; ~36 min once Athletics is maxed
    pois: [
      {
        id: 'direlands-lifestone', name: 'A Dead Lifestone', coords: '—', quest: 'Restore the Lifestone', walkSeconds: 12,
        site: 'lifestone',
        condition: 'dead',
        monsters: [],
      },
      {
        id: 'golem-caverns', name: 'Golem Caverns', coords: '—', quest: 'None', walkSeconds: 90,
        gather: { skill: 'mining', material: 'brass' },
        monsters: [
          { name: 'Sandstone Golem', level: 45, dmgType: 'bludgeon' },
          { name: 'Gromnie', level: 46, dmgType: 'bludgeon' },
          { name: 'Mud Golem', level: 47, dmgType: 'cold' },
        ],
        boss: { name: 'Magma Golem', level: 55, dmgType: 'fire' },
      },
      {
        id: 'virindi-citadel', name: 'Virindi Citadel', coords: '—', quest: 'None', walkSeconds: 240,
        gather: { skill: 'woodcutting', material: 'teak' },
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

// A site is a POI you visit to do something other than fight — no monsters, no
// waves, no loot. Combat skips them entirely (see game/combat.js).
export function isSite(poi) {
  return !!poi && (!!poi.site || !poi.monsters || poi.monsters.length === 0);
}

export function regionIndex(regionId) {
  return REGIONS.findIndex((r) => r.id === regionId);
}

// --- Level tiers ---
// Hunting grounds are grouped into ten-level bands. Two reasons: it sorts a long
// undifferentiated list into somewhere you belong now and somewhere you're
// working toward, and it gives the UI a single number to key a tile's look off
// so a band reads as a place before you've read a word of it.
//
// The bands run past anything currently in the game on purpose. Empty ones are
// never rendered (see ui/tabs.js), so the ceiling costs nothing and the shape of
// the progression is visible from the first region.

export const TIER_SIZE = 10;
export const MAX_TIER_LEVEL = 100;

// `tone` keys the band's colour in the UI and is deliberately absolute: Lv 1-10
// is the same colour in the first region as in the last, so the accent means a
// level rather than a position in whatever list you happen to be looking at.
export const LEVEL_TIERS = Array.from({ length: MAX_TIER_LEVEL / TIER_SIZE }, (_, i) => ({
  id: `t${i + 1}`,
  min: i * TIER_SIZE + 1,
  max: (i + 1) * TIER_SIZE,
  label: `Lv ${i * TIER_SIZE + 1}–${(i + 1) * TIER_SIZE}`,
  tone: i,
}));

// The span of monster levels you'll actually meet here, or null for a site.
// Bosses are deliberately excluded — they're being split out into POIs of their
// own, and a level-6 warlord shouldn't advertise a level 2-3 hideout as harder
// than it is.
export function poiLevelRange(poi) {
  if (!poi || !poi.monsters || !poi.monsters.length) return null;
  const levels = poi.monsters.map((m) => m.level).filter((l) => typeof l === 'number');
  if (!levels.length) return null;
  return { min: Math.min(...levels), max: Math.max(...levels) };
}

// "Lv 2-3", or "Lv 4" when everything here is the same level.
export function poiLevelLabel(poi) {
  const range = poiLevelRange(poi);
  if (!range) return '';
  return range.min === range.max ? `Lv ${range.min}` : `Lv ${range.min}–${range.max}`;
}

// Which band a POI belongs to, keyed on the weakest thing in it — the level you
// can turn up at, not the level you leave at. Null for sites, which have no
// levels and get a band of their own in the UI.
export function tierForPoi(poi) {
  const range = poiLevelRange(poi);
  if (!range) return null;
  const index = Math.min(LEVEL_TIERS.length - 1, Math.floor((range.min - 1) / TIER_SIZE));
  return LEVEL_TIERS[index];
}

// Every band a region actually has ground in, in order. Sites come first under
// their own heading: they're not harder or easier, they're a different errand.
export function tiersForRegion(region) {
  if (!region) return [];
  const used = new Set(region.pois.map((p) => (tierForPoi(p) || {}).id).filter(Boolean));
  const tiers = LEVEL_TIERS.filter((t) => used.has(t.id));
  const sites = region.pois.filter((p) => isSite(p));
  return sites.length ? [{ id: 'sites', label: 'Sites', min: 0, max: 0, tone: 'site' }, ...tiers] : tiers;
}

// The POIs shown under one band.
export function poisInTier(region, tierId) {
  if (!region) return [];
  if (tierId === 'sites') return region.pois.filter((p) => isSite(p));
  return region.pois.filter((p) => !isSite(p) && (tierForPoi(p) || {}).id === tierId);
}
