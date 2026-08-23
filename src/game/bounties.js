// The bounty board: a town's rolling list of small jobs.
//
// Unlike the handful of written quests in data/quests.js, these are generated —
// three at a time, rerolled whenever the town's shelves turn over. Each one asks
// for something the region can actually provide, which is the whole design
// constraint: a board that asked Holtburg for Olthoi corpses would be asking you
// to walk two hours for a bounty worth a few pyreals.
//
// Because targets are drawn from the region's own POIs, every bounty can point
// at where to do it — see `poiServesBounty`, which is what puts the marker on a
// location card.

import { getRegion } from '../data/regions.js';
import { getMaterial } from '../data/materials.js';
import { speciesOf, speciesLabel } from '../data/species.js';
import { pick, randInt, chance } from '../engine/rng.js';
import { objectiveHave, grantReputation } from './quests.js';
import { grantXp } from './hero.js';
import { addLog } from './state.js';

export const BOUNTIES_PER_BOARD = 3;

// What a bounty pays, before the Town Hall's cut.
const REP_MIN = 3;
const REP_MAX = 8;

let nextBountyId = 1;

// Everything this region can be asked for: the materials its dungeons yield, the
// species that live in them, and equipment (which anything can drop).
function regionTargets(region) {
  const materials = new Set();
  const species = new Set();
  for (const poi of region.pois) {
    if (poi.gather) materials.add(poi.gather.material);
    for (const m of poi.monsters || []) species.add(speciesOf(m.name));
  }
  return { materials: [...materials], species: [...species] };
}

function rollBounty(region, heroLevel) {
  const { materials, species } = regionTargets(region);
  const scale = 1 + Math.floor(heroLevel / 6);
  const reputation = randInt(REP_MIN, REP_MAX);

  // Kill and gather bounties are the bread of the board; a haul-in of equipment
  // turns up less often because it costs you gear you might have wanted.
  const kind = !materials.length ? 'kill' : !species.length ? 'material' : chance(0.15) ? 'item' : chance(0.5) ? 'material' : 'kill';

  if (kind === 'material') {
    const id = pick(materials);
    return {
      id: nextBountyId++,
      objective: { kind: 'material', id, count: randInt(4, 9) * scale },
      title: `Wanted: ${(getMaterial(id) || {}).name || id}`,
      reputation,
      xp: 40 * scale,
      pyreals: 60 * scale,
    };
  }
  if (kind === 'kill') {
    const id = pick(species);
    return {
      id: nextBountyId++,
      objective: { kind: 'kill', id, count: randInt(6, 14) * scale },
      title: `Cull the ${speciesLabel(id)}`,
      reputation,
      xp: 55 * scale,
      pyreals: 45 * scale,
    };
  }
  const slot = pick(['ring', 'amulet', 'bracelet', 'shield']);
  return {
    id: nextBountyId++,
    objective: { kind: 'item', id: slot, count: randInt(2, 4) },
    title: `Salvage drive: ${slot}s`,
    reputation: reputation + 2,
    xp: 70 * scale,
    pyreals: 120 * scale,
  };
}

export function rollBounties(state, regionId) {
  const region = getRegion(regionId);
  if (!region) return [];
  // No two postings for the same thing. A board asking for Velvet twice looks
  // like a bug even when it isn't, and it halves what the board is for.
  const out = [];
  const taken = new Set();
  for (let attempt = 0; attempt < BOUNTIES_PER_BOARD * 12 && out.length < BOUNTIES_PER_BOARD; attempt++) {
    const bounty = rollBounty(region, state.hero.level);
    const key = `${bounty.objective.kind}:${bounty.objective.id}`;
    if (taken.has(key)) continue;
    taken.add(key);
    out.push(bounty);
  }
  return out;
}

// --- Handing them in ---

export function bountyReady(state, bounty) {
  return !!bounty && objectiveHave(state, bounty.objective) >= bounty.objective.count;
}

export function claimBounty(state, buildingId, bountyId) {
  const entry = state.buildings[buildingId];
  if (!entry || !entry.bounties) return null;
  const at = entry.bounties.findIndex((b) => b.id === bountyId);
  if (at === -1) return null;
  const bounty = entry.bounties[at];
  if (!bountyReady(state, bounty)) return null;

  const o = bounty.objective;
  if (o.kind === 'material') state.materials[o.id] -= o.count;
  else if (o.kind === 'kill') state.progress.kills[o.id] = Math.max(0, (state.progress.kills[o.id] || 0) - o.count);
  else if (o.kind === 'item') {
    let owed = o.count;
    state.inventory = state.inventory.filter((it) => {
      if (owed > 0 && it.slot === o.id) {
        owed -= 1;
        return false;
      }
      return true;
    });
  }

  const regionId = buildingId.split(':')[0];
  grantReputation(state, regionId, bounty.reputation);
  grantXp(state, bounty.xp);
  state.pyreals += bounty.pyreals;
  // Replaced rather than removed: a board with a gap in it looks broken, and a
  // fresh job appearing the moment you finish one is the point of a board.
  entry.bounties[at] = rollBounties(state, regionId)[0];
  addLog(
    state,
    `Bounty claimed: ${bounty.title}. +${bounty.reputation} reputation, ${bounty.xp} XP, ${bounty.pyreals} pyreals.`,
    'good'
  );
  return bounty;
}

// --- Where to do it ---

// Whether this POI is somewhere you could work on this bounty. Materials come
// from the place that yields them; kills from the place those things live;
// equipment from anywhere that drops gear at all.
export function poiServesBounty(poi, bounty) {
  if (!poi || !bounty) return false;
  const o = bounty.objective;
  if (o.kind === 'material') return !!(poi.gather && poi.gather.material === o.id);
  if (o.kind === 'kill') return (poi.monsters || []).some((m) => speciesOf(m.name) === o.id);
  if (o.kind === 'item') return (poi.monsters || []).length > 0;
  return false;
}

// Every open bounty this POI would serve, for the marker on its card.
//
// The region has to be passed in: POIs read straight off `region.pois` are the
// raw data objects and carry no regionId of their own (only the flattened POIS
// list does), so deriving it from the POI silently matched nothing.
export function bountiesAt(state, poi, regionId = poi && poi.regionId) {
  if (!poi || !regionId) return [];
  const found = [];
  for (const [id, entry] of Object.entries(state.buildings)) {
    if (!entry.bounties || !id.startsWith(`${regionId}:`)) continue;
    for (const bounty of entry.bounties) {
      if (poiServesBounty(poi, bounty)) found.push(bounty);
    }
  }
  return found;
}
