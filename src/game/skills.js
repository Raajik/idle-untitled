// Skills: every skill (Run, and the defensives) shares one rank/xp shape and one
// xp curve, capped at rank 100. Run is trained by walking and shrinks travel time;
// the defensives are trained through combat and give a chance to fully avoid an
// incoming hit, capped at 95% at rank 100 (see `defensiveChance`).

import { addLog } from './state.js';

export const MAX_SKILL_RANK = 100;
export const RUN_XP_PER_SECOND = 4;
export const COMBAT_SKILL_XP = 1; // xp granted to a defensive skill per attack faced

export function xpToNextRank(rank) {
  return Math.ceil(18 * Math.pow(rank + 1, 1.55));
}

// Base walk time shrinks toward ~20% of base as Run approaches rank 100.
export function modifiedWalkTime(baseSeconds, runRank) {
  return Math.max(3, (baseSeconds * 100) / (100 + runRank * 4));
}

// Chance (%) a defensive skill fully avoids an attack. Concave: fast early gains,
// long tail up to the 95% cap at rank 100.
export function defensiveChance(rank) {
  const r = Math.max(0, Math.min(MAX_SKILL_RANK, rank));
  return 95 * Math.pow(r / MAX_SKILL_RANK, 0.7);
}

// Adds xp to any {rank, xp} skill object, capped at MAX_SKILL_RANK, logging rank-ups.
export function trainSkill(state, skill, name, xp) {
  if (skill.rank >= MAX_SKILL_RANK) return;
  skill.xp += xp;
  let leveled = false;
  while (skill.rank < MAX_SKILL_RANK && skill.xp >= xpToNextRank(skill.rank)) {
    skill.xp -= xpToNextRank(skill.rank);
    skill.rank += 1;
    leveled = true;
  }
  if (skill.rank >= MAX_SKILL_RANK) skill.xp = 0;
  if (leveled) addLog(state, `${name} increased to ${skill.rank}.`, 'good');
}

export function grantRunXp(state, seconds) {
  trainSkill(state, state.hero.skills.run, 'Run', seconds * RUN_XP_PER_SECOND);
}
