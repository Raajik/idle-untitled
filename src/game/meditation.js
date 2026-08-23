// Meditation: sit and recover. Outside of a fight the hero regenerates nothing
// at all (the passive trickle in game/combat.js only runs while standing at a
// hunting POI), so meditating is how you refill HP, Stamina, and Mana between
// Lifestone offerings — see game/lifestone.js, which spends both in bulk.
//
// It's a channel, not a timed action: you turn it on, it suspends combat exactly
// the way travel does, and it turns itself off once all three vitals are full.
// Later healing/alchemy/magic will offer faster (and costlier) alternatives.

import { derivedStats } from './hero.js';
import { trainAttribute } from './skills.js';
import { addLog } from './state.js';

// Fractions of each vital's maximum restored per second of meditation.
const MEDITATE_HP_PER_SECOND = 0.02;
const MEDITATE_STAMINA_PER_SECOND = 0.04;
const MEDITATE_MANA_PER_SECOND = 0.03;

// Sitting with your own thoughts is how Focus and Self grow outside a fight.
const MEDITATE_ATTR_XP_PER_SECOND = 2;

export function isRested(state) {
  const d = derivedStats(state);
  const h = state.hero;
  return h.hp >= d.maxHp && h.stamina >= d.maxStamina && h.mana >= d.maxMana;
}

export function canMeditate(state) {
  return !state.travel && !state.hero.dead && !isRested(state);
}

export function startMeditating(state) {
  if (!canMeditate(state)) return false;
  state.meditating = true;
  state.monster = null; // break off whatever you were fighting
  addLog(state, 'You sit, steady your breathing, and let the world go quiet.', 'dim');
  return true;
}

export function stopMeditating(state, reason = null) {
  if (!state.meditating) return false;
  state.meditating = false;
  if (reason) addLog(state, reason, 'dim');
  return true;
}

// Called every combat tick. Returns true if meditation consumed the tick (combat
// should not run).
export function tickMeditation(state, dt) {
  if (!state.meditating) return false;
  if (state.travel || state.hero.dead) {
    state.meditating = false;
    return false;
  }

  const d = derivedStats(state);
  const h = state.hero;
  h.hp = Math.min(d.maxHp, h.hp + d.maxHp * MEDITATE_HP_PER_SECOND * dt);
  h.stamina = Math.min(d.maxStamina, h.stamina + d.maxStamina * MEDITATE_STAMINA_PER_SECOND * dt);
  h.mana = Math.min(d.maxMana, h.mana + d.maxMana * MEDITATE_MANA_PER_SECOND * dt);
  trainAttribute(state, 'focus', MEDITATE_ATTR_XP_PER_SECOND * dt);
  trainAttribute(state, 'self', MEDITATE_ATTR_XP_PER_SECOND * dt);

  if (isRested(state)) stopMeditating(state, 'You open your eyes, rested and whole again.');
  return true;
}
