// Lifestones: where you respawn, and where Recall can take you.
//
// Two halves:
//   - Recall — instant travel to any region whose Lifestone you've bonded with
//     (i.e. arrived at), gated by a cooldown that shrinks as the skill ranks up.
//   - Binding — the stone you wake up at when you die. You start bound to the one
//     you woke up beside on the road, a full walk short of Holtburg, so every
//     death costs that walk back. A budding Lifestone site (see data/regions.js)
//     can be grown into a real one to move the bind point somewhere convenient.
//     It creeps upward on its own once started, slowly enough that waiting it out
//     is a real option but a dull one; Sacrificing Vitae is how you hurry it.
//
//     A sacrifice costs vitae and nothing else. It used to drain most of your
//     health and mana as well, which made the site a stop-start affair: offer,
//     then stand about waiting to refill, then offer again. The vitae IS the
//     price — you walk away weaker for as long as it takes to earn back, and you
//     can keep giving until there's nothing left to give.

import { getRegion, getPoiById } from '../data/regions.js';

import { recallCooldownSeconds, RECALL_XP_ON_USE, trainSkill, trainAttribute } from './skills.js';
import { gainVitae, atMaxVitae, MAX_VITAE_STACKS, VITAE_PER_STACK } from './vitae.js';
import { addLog } from './state.js';

// Growth needed to finish a budding Lifestone, and what one offering gives —
// ten offerings, each of them a real bite out of the hero.
export const LIFESTONE_GROWTH_REQUIRED = 100;
// Derived from the vitae ceiling on purpose: spending every drop of vitae a body
// can hold is exactly enough to finish the stone, and not a sacrifice more. Any
// other number either strands the stone half-grown behind a cap you can't
// exceed, or leaves sacrifices you're not allowed to make.
export const GROWTH_PER_OFFERING = LIFESTONE_GROWTH_REQUIRED / MAX_VITAE_STACKS;
const OFFERING_ATTR_XP = 20; // Self/Focus, for giving so much of yourself away

// A budding stone knits itself together on its own, just slowly — about fifty
// minutes from first sacrifice to full if you never touch it again. That keeps
// the site from being a hard wall behind a regen loop while leaving
// Sacrificing Vitae clearly the faster road.
const PASSIVE_GROWTH_PER_SECOND = LIFESTONE_GROWTH_REQUIRED / (50 * 60);

export function canRecall(state) {
  return state.progress.recallUnlocked && state.progress.recallCooldown <= 0;
}

export function recallTo(state, regionId) {
  if (!canRecall(state)) return false;
  if (!state.progress.unlockedRegions.includes(regionId)) return false;
  const region = getRegion(regionId);
  if (!region) return false;

  state.travel = null;
  state.monsters = [];
  state.location = { regionId, poiId: null };
  state.progress.recallCooldown = recallCooldownSeconds(state.hero.skills.lifestone.recall.rank);
  trainSkill(state, state.hero.skills.lifestone.recall, 'Lifestone Recall', RECALL_XP_ON_USE);
  addLog(state, `The Lifestone's light folds around you — you arrive at ${region.name}.`, 'good');
  return true;
}

export function tickRecallCooldown(state, dt) {
  if (state.progress.recallCooldown > 0) {
    state.progress.recallCooldown = Math.max(0, state.progress.recallCooldown - dt);
  }
}

// --- Binding / respawn ---

// Moves the hero to whatever Lifestone they're currently bound to. Called once a
// death's respawn timer runs out; a no-op if they're already standing there.
export function respawnAtLifestone(state) {
  const bind = state.progress.boundLifestone;
  const already = state.location.regionId === bind.regionId && state.location.poiId === bind.poiId;
  if (already) return false;

  state.location = { regionId: bind.regionId, poiId: bind.poiId };
  state.monsters = [];
  state.progress.wave = 1;
  state.progress.waveMonstersLeft = 0;
  state.progress.timeInPoi = 0;
  state.progress.killsInPoi = 0;
  state.hero.attackTimer = 0;
  const where = bind.regionId ? getRegion(bind.regionId).name : 'the roadside stone you first woke beside';
  addLog(state, `You wake at your Lifestone — ${where}. The walk back is yours to make.`, 'dim');
  return true;
}

// The stone a region keeps, if it has one.
export function lifestoneSiteIn(regionId) {
  const region = getRegion(regionId);
  if (!region) return null;
  return region.pois.find((p) => p.site === 'lifestone') || null;
}

// Called on first arrival in a region. Binds you to its stone straight away —
// even a dead one will catch you — so dying while working a region drops you
// beside it rather than a region away, and opens the standing job of restoring
// it. Binding to the SITE rather than the hub is the point: it sits among the
// dungeons, which is where you'll be dying.
export function claimRegionLifestone(state, regionId) {
  const site = lifestoneSiteIn(regionId);
  if (!site) return false;
  const already = state.progress.quests[site.id];
  state.progress.boundLifestone = { regionId, poiId: site.id };
  if (already) return false;
  state.progress.quests[site.id] = isGrown(state, site.id) ? 'done' : 'active';
  addLog(
    state,
    `Something here is pulling at you — ${site.name.toLowerCase()}, ${conditionOf(site).blurb}. You'll feel it from anywhere in ${getRegion(regionId).name} now, and you'll wake beside it.`,
    'good'
  );
  return true;
}

// What to call a place right now. A budding/cracked/dead Lifestone that has been
// restored is just a Lifestone — the adjective described a state it is no longer
// in, and leaving it there reads as though the work didn't take.
export function poiDisplayName(state, poi) {
  if (!poi) return '';
  if (poi.site === 'lifestone' && isGrown(state, poi.id)) return 'Lifestone';
  return poi.name;
}

// Whether a POI is currently showing a quest marker.
export function hasOpenQuest(state, poiId) {
  return state.progress.quests[poiId] === 'active';
}

// --- Growing a budding Lifestone ---

// How intact a stone already is when you find it. Every region has one, and how
// far gone it is says something about how far out you've walked: Holtburg's is
// young and merely unfinished, the Direlands' is a dead thing that has to be
// rebuilt from nothing.
export const LIFESTONE_CONDITIONS = {
  budding: { start: 0, label: 'budding', blurb: 'unfinished, and still trying' },
  cracked: { start: 35, label: 'cracked', blurb: 'broken, but most of it is still here' },
  shattered: { start: 15, label: 'shattered', blurb: 'in pieces, and only just holding together' },
  dead: { start: 0, label: 'dead', blurb: 'gone out entirely — there is nothing left in it' },
};

export function conditionOf(poi) {
  return LIFESTONE_CONDITIONS[(poi && poi.condition) || 'budding'] || LIFESTONE_CONDITIONS.budding;
}

export function lifestoneGrowth(state, poiId) {
  const recorded = state.progress.lifestoneGrowth[poiId];
  if (typeof recorded === 'number') return recorded;
  // Never touched: it's however intact its own condition left it.
  return conditionOf(getPoiById(poiId)).start;
}

export function isGrown(state, poiId) {
  return lifestoneGrowth(state, poiId) >= LIFESTONE_GROWTH_REQUIRED;
}

// What one offering costs: vitae, and only vitae.
export function offeringCost(state) {
  return { vitaePct: VITAE_PER_STACK };
}

export function canSacrificeVitae(state, poiId) {
  const poi = getPoiById(poiId);
  if (!poi || poi.site !== 'lifestone') return false;
  if (state.location.poiId !== poiId) return false; // you have to be standing at it
  if (state.hero.dead || state.travel) return false;
  if (isGrown(state, poiId)) return false;
  if (atMaxVitae(state)) return false; // nothing left to give — the stone can't take more
  return true;
}

// Growth the stone makes on its own, once it's been started. Called every tick
// from game/combat.js, wherever the hero happens to be.
export function tickLifestoneGrowth(state, dt) {
  const growth = state.progress.lifestoneGrowth;
  for (const poiId of Object.keys(growth)) {
    if (growth[poiId] <= 0 || growth[poiId] >= LIFESTONE_GROWTH_REQUIRED) continue;
    growth[poiId] = Math.min(LIFESTONE_GROWTH_REQUIRED, growth[poiId] + PASSIVE_GROWTH_PER_SECOND * dt);
    if (growth[poiId] >= LIFESTONE_GROWTH_REQUIRED) completeLifestone(state, poiId);
  }
}

// Binds the hero to a stone that has finished growing. Shared by the sacrifice
// path and the passive one, since either can be the thing that tops it off.
function completeLifestone(state, poiId) {
  const poi = getPoiById(poiId);
  if (!poi) return;
  state.progress.quests[poiId] = 'done';
  // A grown stone sits at a POI you'd rather not respawn inside, so it binds you
  // to the hub town of the region it's in.
  state.progress.boundLifestone = { regionId: poi.regionId, poiId: null };
  state.progress.recallUnlocked = true;
  const region = getRegion(poi.regionId);
  addLog(state, `The Lifestone flares awake, full-grown at last. Its light knows you now — you'll wake at ${region.name} from here on.`, 'good');
}

// Spends a lasting 5% of yourself to hurry the stone along.
export function sacrificeVitae(state, poiId) {
  if (!canSacrificeVitae(state, poiId)) return false;

  trainAttribute(state, 'self', OFFERING_ATTR_XP);
  trainAttribute(state, 'focus', OFFERING_ATTR_XP);
  gainVitae(state, 'The stone drinks deep.');

  const growth = Math.min(LIFESTONE_GROWTH_REQUIRED, lifestoneGrowth(state, poiId) + GROWTH_PER_OFFERING);
  state.progress.lifestoneGrowth[poiId] = growth;

  if (growth < LIFESTONE_GROWTH_REQUIRED) {
    addLog(state, `You press your hands to the stone and let it take. It answers with a slow, deepening glow. (${Math.floor(growth)}%)`, 'dim');
    return true;
  }
  completeLifestone(state, poiId);
  return true;
}
