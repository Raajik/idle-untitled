// Travel: walking to a region or a POI. Combat is suspended while `state.travel`
// is set; arriving unlocks the region or moves the hero to the POI, resetting that
// POI's difficulty depth. Every region and POI is visible and clickable from the
// very start — distance is expressed purely through `walkSeconds`, not gating.
// Clicking a new destination redirects travel immediately, even mid-walk.

import { getRegion, getPoiById } from '../data/regions.js';
import { TUTORIAL_ROAD, TUTORIAL_JOURNEY_SECONDS } from '../data/tutorial.js';
import { modifiedWalkTime, grantRunXp } from './skills.js';
import { addLog } from './state.js';

function resetPoiProgress(state) {
  state.progress.poiDepth = 0;
  state.progress.timeInPoi = 0;
  state.progress.killsInPoi = 0;
  state.progress.killsSinceBoss = 0;
  state.monster = null;
  state.hero.attackTimer = 0;
}

export function startTravelToRegion(state, regionId) {
  const region = getRegion(regionId);
  if (!region) return false;
  if (!state.travel && state.progress.unlockedRegions.includes(regionId)) return false; // already there, not redirecting

  // Alcott pointed this newbie at Holtburg specifically — the first walk there is
  // the scripted tutorial journey (weak roadside monsters, fixed 3-minute length).
  if (regionId === 'holtburg' && state.onboarding.tutorialPending) {
    state.travel = { kind: 'region', id: regionId, remaining: TUTORIAL_JOURNEY_SECONDS, duration: TUTORIAL_JOURNEY_SECONDS, tutorial: true };
    state.location = { regionId: null, poiId: TUTORIAL_ROAD.id };
    state.monster = null;
    addLog(state, `You set out for Holtburg, alone on the open road...`, 'dim');
    return true;
  }

  const duration = modifiedWalkTime(region.walkSeconds, state.hero.skills.run.rank);
  state.travel = { kind: 'region', id: regionId, remaining: duration, duration };
  state.location = { regionId: null, poiId: null };
  state.monster = null;
  addLog(state, `You set out for ${region.name}...`, 'dim');
  return true;
}

export function startTravelToPoi(state, poiId) {
  const poi = getPoiById(poiId);
  if (!poi) return false;
  if (!state.travel && state.location.poiId === poiId) return false; // already there, not redirecting

  const duration = modifiedWalkTime(poi.walkSeconds, state.hero.skills.run.rank);
  state.travel = { kind: 'poi', id: poiId, remaining: duration, duration };
  state.location = { regionId: poi.regionId, poiId: null };
  state.monster = null;
  addLog(state, `Walking to ${poi.name}...`, 'dim');
  return true;
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
  } else {
    const poi = getPoiById(t.id);
    state.location = { regionId: poi.regionId, poiId: t.id };
    if (!state.progress.visitedPois.includes(t.id)) state.progress.visitedPois.push(t.id);
    resetPoiProgress(state);
    addLog(state, `You arrive at ${poi.name}.`, 'good');
  }
  state.travel = null;
}

// Called every combat tick while travelling.
export function tickTravel(state, dt) {
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
