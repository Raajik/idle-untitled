// Travel: walking to a region or a POI. Combat is suspended while `state.travel`
// is set; arriving unlocks the region or moves the hero to the POI, restarting its
// waves from wave 1. Every region and POI is visible and clickable from the
// very start — distance is expressed purely through `walkSeconds`, not gating.
// Clicking a new destination redirects travel immediately, even mid-walk.

import { getRegion, getPoiById } from '../data/regions.js';
import { TUTORIAL_ROAD, TUTORIAL_JOURNEY_SECONDS } from '../data/tutorial.js';
import { modifiedWalkTime, grantAthleticsXp } from './skills.js';
import { claimRegionLifestone } from './lifestone.js';
import { openTownQuests } from './buildings.js';
import { addLog } from './state.js';

function resetPoiProgress(state) {
  state.progress.wave = 1;
  state.progress.waveMonstersLeft = 0;
  state.progress.timeInPoi = 0;
  state.progress.killsInPoi = 0;
  state.monsters = [];
  state.hero.attackTimer = 0;
}

export function startTravelToRegion(state, regionId) {
  const region = getRegion(regionId);
  if (!region) return false;
  // Refuse only when you are actually standing in the hub. This used to refuse
  // whenever the region was unlocked at all, which meant that from any POI
  // inside it the "go to Holtburg" button silently did nothing — there was no
  // way back to town short of dying.
  const atHub = state.location.regionId === regionId && !state.location.poiId;
  if (!state.travel && atHub) return false;

  // Alcott pointed you at Holtburg specifically — the first walk there is the
  // scripted tutorial journey (weak roadside monsters, fixed 3-minute length).
  if (regionId === 'holtburg' && state.onboarding.tutorialPending) {
    state.travel = { kind: 'region', id: regionId, remaining: TUTORIAL_JOURNEY_SECONDS, duration: TUTORIAL_JOURNEY_SECONDS, tutorial: true };
    state.location = { regionId: null, poiId: TUTORIAL_ROAD.id };
    state.monsters = [];
      addLog(state, `You set out for Holtburg. The road is yours the whole way.`, 'dim');
    return true;
  }

  // Walking home inside a region you're already in is a shorter trip than
  // crossing to a new one: it's however far the POI you're leaving was.
  const goingHome = state.location.regionId === regionId;
  const currentPoi = state.location.poiId ? getPoiById(state.location.poiId) : null;
  const baseSeconds = goingHome && currentPoi ? currentPoi.walkSeconds : region.walkSeconds;
  const duration = modifiedWalkTime(baseSeconds, state.hero.skills.athletics.rank);
  state.travel = { kind: 'region', id: regionId, remaining: duration, duration };
  // Keep the region when you never left it. Blanking it made the whole POI grid
  // disappear the moment you set off for town, so there was nothing on screen to
  // change your mind with halfway there.
  state.location = { regionId: goingHome ? regionId : null, poiId: null };
  state.monsters = [];
  addLog(state, goingHome ? `You head back to ${region.name}...` : `You set out for ${region.name}...`, 'dim');
  return true;
}

export function startTravelToPoi(state, poiId) {
  const poi = getPoiById(poiId);
  if (!poi) return false;
  if (!state.travel && state.location.poiId === poiId) return false; // already there, not redirecting

  const duration = modifiedWalkTime(poi.walkSeconds, state.hero.skills.athletics.rank);
  state.travel = { kind: 'poi', id: poiId, remaining: duration, duration };
  state.location = { regionId: poi.regionId, poiId: null };
  state.monsters = [];
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
    // Every region keeps a Lifestone in some state of repair. Reaching the region
    // binds you to it immediately, so a death while working the area costs a few
    // seconds rather than the walk back from wherever you were last bound.
    claimRegionLifestone(state, t.id);
    openTownQuests(state, t.id);
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
  grantAthleticsXp(state, dt);
  if (state.travel.remaining <= 0) arrive(state);
  return true;
}

// Used by the offline-progress simulation: if enough elapsed time passed while
// travelling, land the hero immediately and return the leftover seconds to spend
// at the destination. Returns null if travel isn't finished (nothing to simulate).
export function skipTravel(state, elapsedSec) {
  if (!state.travel) return elapsedSec;
  if (elapsedSec < state.travel.remaining) {
    grantAthleticsXp(state, elapsedSec);
    state.travel.remaining -= elapsedSec;
    return null;
  }
  const leftover = elapsedSec - state.travel.remaining;
  grantAthleticsXp(state, state.travel.remaining);
  arrive(state);
  return leftover;
}
