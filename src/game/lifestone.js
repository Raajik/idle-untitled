// Lifestones: where you respawn, and where Recall can take you.
//
// Two halves:
//   - Recall — instant travel to any region whose Lifestone you've bonded with
//     (i.e. arrived at), gated by a cooldown that shrinks as the skill ranks up.
//   - Binding — the stone you wake up at when you die. You start bound to the one
//     you woke up beside on the road, a full walk short of Holtburg, so every
//     death costs that walk back. A budding Lifestone site (see data/regions.js)
//     can be grown into a real one to move the bind point somewhere convenient:
//     growing it means repeatedly pouring your own blood and mana into the stone,
//     which is what meditation (game/meditation.js) exists to refill.

import { getRegion, getPoiById } from '../data/regions.js';
import { derivedStats } from './hero.js';
import { recallCooldownSeconds, RECALL_XP_ON_USE, trainSkill, trainAttribute } from './skills.js';
import { addLog } from './state.js';

// Growth needed to finish a budding Lifestone, and what one offering gives —
// ten offerings, each of them a real bite out of the hero.
export const LIFESTONE_GROWTH_REQUIRED = 100;
export const GROWTH_PER_OFFERING = 10;
export const OFFERING_HP_PCT = 0.6;
export const OFFERING_MANA_PCT = 0.6;
const OFFERING_ATTR_XP = 20; // Self/Focus, for giving so much of yourself away

export function canRecall(state) {
  return state.progress.recallUnlocked && state.progress.recallCooldown <= 0;
}

export function recallTo(state, regionId) {
  if (!canRecall(state)) return false;
  if (!state.progress.unlockedRegions.includes(regionId)) return false;
  const region = getRegion(regionId);
  if (!region) return false;

  state.travel = null;
  state.monster = null;
  state.meditating = false;
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
  state.monster = null;
  state.progress.wave = 1;
  state.progress.waveMonstersLeft = 0;
  state.progress.timeInPoi = 0;
  state.progress.killsInPoi = 0;
  state.hero.attackTimer = 0;
  const where = bind.regionId ? getRegion(bind.regionId).name : 'the roadside stone you first woke beside';
  addLog(state, `You wake at your Lifestone — ${where}. The walk back is yours to make.`, 'dim');
  return true;
}

// --- Growing a budding Lifestone ---

export function lifestoneGrowth(state, poiId) {
  return state.progress.lifestoneGrowth[poiId] || 0;
}

export function isGrown(state, poiId) {
  return lifestoneGrowth(state, poiId) >= LIFESTONE_GROWTH_REQUIRED;
}

// What one offering costs right now, in absolute HP/Mana.
export function offeringCost(state) {
  const d = derivedStats(state);
  return {
    hp: Math.ceil(d.maxHp * OFFERING_HP_PCT),
    mana: Math.ceil(d.maxMana * OFFERING_MANA_PCT),
  };
}

export function canFeedLifestone(state, poiId) {
  const poi = getPoiById(poiId);
  if (!poi || poi.site !== 'lifestone') return false;
  if (state.location.poiId !== poiId) return false; // you have to be standing at it
  if (state.hero.dead || state.travel || state.meditating) return false;
  if (isGrown(state, poiId)) return false;
  const cost = offeringCost(state);
  return state.hero.hp >= cost.hp && state.hero.mana >= cost.mana;
}

// Pours one offering into the stone. Fully growing it re-binds the hero here —
// or, since a grown stone sits at a POI you'd rather not respawn inside, to the
// hub town of the region it's in.
export function feedLifestone(state, poiId) {
  if (!canFeedLifestone(state, poiId)) return false;
  const poi = getPoiById(poiId);
  const cost = offeringCost(state);

  state.hero.hp -= cost.hp;
  state.hero.mana -= cost.mana;
  trainAttribute(state, 'self', OFFERING_ATTR_XP);
  trainAttribute(state, 'focus', OFFERING_ATTR_XP);

  const growth = Math.min(LIFESTONE_GROWTH_REQUIRED, lifestoneGrowth(state, poiId) + GROWTH_PER_OFFERING);
  state.progress.lifestoneGrowth[poiId] = growth;

  if (growth < LIFESTONE_GROWTH_REQUIRED) {
    addLog(state, `You press your hands to the stone and let it drink. It answers with a slow, deepening glow. (${growth}%)`, 'dim');
    return true;
  }

  state.progress.boundLifestone = { regionId: poi.regionId, poiId: null };
  state.progress.recallUnlocked = true;
  const region = getRegion(poi.regionId);
  addLog(state, `The Lifestone flares awake, full-grown at last. Its light knows you now — you'll wake at ${region.name} from here on.`, 'good');
  return true;
}
