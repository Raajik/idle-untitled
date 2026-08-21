// Skills: Run is trained by walking, and shrinks travel time. More skills (Healing,
// Life Magic, etc.) will slot in here the same way once combat needs them.

import { addLog } from './state.js';

export const RUN_XP_PER_SECOND = 4;

export function xpToNextRunRank(rank) {
  return Math.ceil(18 * Math.pow(rank + 1, 1.55));
}

// Base walk time shrinks toward ~20% of base as Run approaches rank 100.
export function modifiedWalkTime(baseSeconds, runRank) {
  return Math.max(3, (baseSeconds * 100) / (100 + runRank * 4));
}

export function grantRunXp(state, seconds) {
  const run = state.hero.skills.run;
  run.xp += seconds * RUN_XP_PER_SECOND;
  let leveled = false;
  while (run.xp >= xpToNextRunRank(run.rank)) {
    run.xp -= xpToNextRunRank(run.rank);
    run.rank += 1;
    leveled = true;
  }
  if (leveled) addLog(state, `Run increased to ${run.rank}.`, 'good');
}
