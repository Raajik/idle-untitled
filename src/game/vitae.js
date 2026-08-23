// Vitae: Asheron's Call's death penalty. Dying leaves you diminished — 5% off
// your body and your gear's worth of it — stacking to a hard floor of 40%, and
// the only way out is to go earn the experience back.
//
// Two things hand it to you: dying (see game/combat.js) and deliberately
// spending it at a budding Lifestone (see game/lifestone.js), which trades the
// penalty for growth. Both paths lead to the same place if you keep at them,
// which is why the 40% achievement is reachable either by sacrificing for it or
// by simply dying enough times in a row.

import { xpForLevel } from './hero.js';
import { awardAchievement } from './achievements.js';
import { addLog } from './state.js';

export const VITAE_PER_STACK = 5; // percent, per death or sacrifice
export const MAX_VITAE_STACKS = 8; // 8 x 5% = the 40% floor
export const MAX_VITAE_PCT = VITAE_PER_STACK * MAX_VITAE_STACKS;

// Experience needed to shed one stack. Scaled to the level's own XP step so it
// stays roughly a fixed number of kills however far along you are, rather than
// becoming trivial the moment you out-level it.
const XP_PER_STACK_FRACTION = 0.25;

export function xpToClearStack(level) {
  return Math.max(1, Math.round(xpForLevel(level) * XP_PER_STACK_FRACTION));
}

export function vitaeStacks(state) {
  return state.hero.vitae.stacks;
}

export function vitaePct(state) {
  return vitaeStacks(state) * VITAE_PER_STACK;
}

// The multiplier vitae puts on the hero's derived stats: 1.0 clean, 0.6 at the
// 40% floor. Applied in game/hero.js derivedStats.
export function vitaeMultiplier(state) {
  return 1 - vitaePct(state) / 100;
}

export function atMaxVitae(state) {
  return vitaeStacks(state) >= MAX_VITAE_STACKS;
}

// Adds a stack. `reason` is the flavor for the log line. Returns false when
// already at the floor — vitae never stacks past 40%, so dying while ruined
// costs you nothing further.
export function gainVitae(state, reason) {
  const v = state.hero.vitae;
  if (v.stacks >= MAX_VITAE_STACKS) return false;
  v.stacks += 1;
  // Fresh debt on the current stack: piling more vitae on sets back the work of
  // shedding what you already had.
  v.xpRemaining = xpToClearStack(state.hero.level);
  addLog(state, `${reason} Vitae ${vitaePct(state)}% — you feel diminished.`, 'boss');
  if (atMaxVitae(state)) awardAchievement(state, 'vitae-hardened');
  return true;
}

// Called whenever the hero earns experience. Each stack costs its own chunk of
// XP; clearing one starts the clock on the next.
export function workOffVitae(state, xpGained) {
  const v = state.hero.vitae;
  if (v.stacks <= 0 || xpGained <= 0) return;
  v.xpRemaining -= xpGained;
  while (v.xpRemaining <= 0 && v.stacks > 0) {
    v.stacks -= 1;
    v.xpRemaining = v.stacks > 0 ? v.xpRemaining + xpToClearStack(state.hero.level) : 0;
    addLog(
      state,
      v.stacks > 0
        ? `Some of the weight lifts. Vitae ${vitaePct(state)}%.`
        : `The last of the vitae burns away. You feel whole.`,
      'good'
    );
  }
}
