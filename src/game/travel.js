// Travel: walking to a region or a POI. Combat is suspended while `state.travel`
// is set; arriving unlocks the region (and staggers in the next hidden one) or
// moves the hero to the POI, resetting that POI's difficulty depth.

import { REGIONS, getRegion, getPoiById, regionIndex } from '../data/regions.js';
import { modifiedWalkTime, grantRunXp } from './skills.js';
import { addLog } from './state.js';

const REGION_REVEAL_DELAY = 10; // seconds between each newly-visible region fading in

function resetPoiProgress(state) {
  state.progress.poiDepth = 0;
  state.progress.timeInPoi = 0;
  state.progress.killsInPoi = 0;
  state.progress.killsSinceBoss = 0;
  state.monster = null;
  state.hero.attackTimer = 0;
}

export function startTravelToRegion(state, regionId) {
  if (state.travel) return false;
  const region = getRegion(regionId);
  if (!region) return false;
  if (!state.progress.visibleRegions.includes(regionId)) return false;
  if (state.progress.unlockedRegions.includes(regionId)) return false; // already there

  const duration = modifiedWalkTime(region.walkSeconds, state.hero.skills.run.rank);
  state.travel = { kind: 'region', id: regionId, remaining: duration, duration };
  state.location = { regionId: null, poiId: null };
  state.monster = null;
  addLog(state, `You set out for ${region.name}...`, 'dim');
  return true;
}

export function startTravelToPoi(state, poiId) {
  if (state.travel) return false;
  const poi = getPoiById(poiId);
  if (!poi) return false;
  if (!state.progress.unlockedRegions.includes(poi.regionId)) return false;

  const duration = modifiedWalkTime(poi.walkSeconds, state.hero.skills.run.rank);
  state.travel = { kind: 'poi', id: poiId, remaining: duration, duration };
  state.location = { regionId: poi.regionId, poiId: null };
  state.monster = null;
  addLog(state, `Walking to ${poi.name}...`, 'dim');
  return true;
}

function revealNextRegion(state) {
  const hidden = REGIONS.find((r) => !state.progress.visibleRegions.includes(r.id));
  if (!hidden) {
    state.progress.revealTimer = 0;
    return;
  }
  state.progress.visibleRegions.push(hidden.id);
  const stillHidden = REGIONS.some((r) => !state.progress.visibleRegions.includes(r.id));
  state.progress.revealTimer = stillHidden ? REGION_REVEAL_DELAY : 0;
}

export function arrive(state) {
  const t = state.travel;
  if (t.kind === 'region') {
    const region = getRegion(t.id);
    if (!state.progress.unlockedRegions.includes(t.id)) {
      state.progress.unlockedRegions.push(t.id);
    }
    state.location = { regionId: t.id, poiId: null };
    addLog(state, `You arrive at ${region.name}.`, 'good');
    if (regionIndex(t.id) === 0) {
      // First arrival at Holtburg starts staggering in the rest of the map.
      state.progress.revealTimer = REGION_REVEAL_DELAY;
    }
  } else {
    const poi = getPoiById(t.id);
    state.location = { regionId: poi.regionId, poiId: t.id };
    if (!state.progress.visitedPois.includes(t.id)) state.progress.visitedPois.push(t.id);
    resetPoiProgress(state);
    addLog(state, `You arrive at ${poi.name}.`, 'good');
  }
  state.travel = null;
}

// Called every combat tick. Handles both active travel and the staggered region reveal.
export function tickTravel(state, dt) {
  if (state.progress.revealTimer > 0) {
    state.progress.revealTimer -= dt;
    if (state.progress.revealTimer <= 0) revealNextRegion(state);
  }

  if (!state.travel) return false;
  state.travel.remaining -= dt;
  grantRunXp(state, dt);
  if (state.travel.remaining <= 0) arrive(state);
  return true;
}

// Used by the offline-progress simulation: if enough elapsed time passed while
// travelling, land the hero immediately and return the leftover seconds to spend
// at the destination. Returns null if travel isn't finished (nothing to simulate).
export function skipTravel(state, elapsedSec) {
  if (!state.travel) return elapsedSec;
  if (elapsedSec < state.travel.remaining) {
    grantRunXp(state, elapsedSec);
    state.travel.remaining -= elapsedSec;
    return null;
  }
  const leftover = elapsedSec - state.travel.remaining;
  grantRunXp(state, state.travel.remaining);
  arrive(state);
  return leftover;
}
