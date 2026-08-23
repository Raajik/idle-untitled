// Vitae: Asheron's Call's death penalty. Dying leaves you diminished — 5% off
// your body and your gear's worth of it — stacking to a hard floor of 40%, and
// the only way out is to go earn the experience back.
//
// It's carried as a plain percentage rather than as stacks. It arrives in
// 5-point lumps (a death, or an offering at a budding Lifestone) but it LEAVES
// one point at a time, so the bar visibly creeps back the whole time you're
// fighting instead of sitting still and then jumping. Same total work, far
// better feedback.
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
export const MAX_VITAE_PCT = 40;
export const MAX_VITAE_STACKS = MAX_VITAE_PCT / VITAE_PER_STACK; // kept for callers that think in lumps

// Experience needed to shed a single point. Scaled to the level's own XP step so
// clearing stays roughly a fixed number of kills however far along you are,
// rather than becoming trivial the moment you out-level it.
const XP_PER_POINT_FRACTION = 0.05;

export function xpToClearPoint(level) {
  return Math.max(1, Math.round(xpForLevel(level) * XP_PER_POINT_FRACTION));
}

// What a whole 5% lump costs to work off, which is what the UI quotes.
export function xpToClearStack(level) {
  return xpToClearPoint(level) * VITAE_PER_STACK;
}

export function vitaePct(state) {
  return state.hero.vitae.pct;
}

export function vitaeStacks(state) {
  return Math.ceil(vitaePct(state) / VITAE_PER_STACK);
}

// The multiplier vitae puts on the hero's derived stats: 1.0 clean, 0.6 at the
// 40% floor. Applied in game/hero.js derivedStats.
export function vitaeMultiplier(state) {
  return 1 - vitaePct(state) / 100;
}

export function atMaxVitae(state) {
  return vitaePct(state) >= MAX_VITAE_PCT;
}

// Adds a lump. `reason` is the flavor for the log line. Returns false when
// already at the floor — vitae never stacks past 40%, so dying while ruined
// costs you nothing further.
export function gainVitae(state, reason) {
  const v = state.hero.vitae;
  if (v.pct >= MAX_VITAE_PCT) return false;
  v.pct = Math.min(MAX_VITAE_PCT, v.pct + VITAE_PER_STACK);
  // Fresh debt on the current point: piling more vitae on sets back the work of
  // shedding what you already had.
  v.xpRemaining = xpToClearPoint(state.hero.level);
  addLog(state, `${reason} Vitae ${v.pct}% — you feel diminished.`, 'boss');
  if (atMaxVitae(state)) awardAchievement(state, 'vitae-hardened');
  return true;
}

// Called whenever the hero earns experience. Each point costs its own chunk of
// XP; clearing one starts the clock on the next. Only the 5% boundaries get a
// log line — a message every single point would drown the combat log.
export function workOffVitae(state, xpGained) {
  const v = state.hero.vitae;
  if (v.pct <= 0 || xpGained <= 0) return;
  v.xpRemaining -= xpGained;
  while (v.xpRemaining <= 0 && v.pct > 0) {
    const before = v.pct;
    v.pct -= 1;
    v.xpRemaining = v.pct > 0 ? v.xpRemaining + xpToClearPoint(state.hero.level) : 0;
    if (v.pct === 0) {
      addLog(state, 'The last of the vitae burns away. You feel whole.', 'good');
    } else if (before % VITAE_PER_STACK === 0) {
      addLog(state, `Some of the weight lifts. Vitae ${v.pct}%.`, 'good');
    }
  }
}
