// Pacing guards. These aren't simulations — they're cheap arithmetic on the
// curves and constants that set how a first session feels, so that tuning one
// number later can't quietly undo the target: a first Enlightenment around the
// one-hour mark, reached with every skill still well short of rank 15.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xpToNextRank, ATHLETICS_XP_PER_SECOND, COMBAT_SKILL_XP, modifiedWalkTime } from '../src/game/skills.js';
import { REGIONS, getRegion } from '../src/data/regions.js';
import { soulsForRun, ENLIGHTENMENT_MIN_REGION } from '../src/data/enlightenment.js';

const HOUR = 3600;

function xpToReachRank(rank) {
  let total = 0;
  for (let r = 0; r < rank; r++) total += xpToNextRank(r);
  return total;
}

test('no skill can reach rank 15 inside the first hour, even training nonstop', () => {
  // Athletics is the fastest-training skill in the game and the only one that
  // trains on pure elapsed time, so it sets the ceiling for everything else.
  const bestCaseXp = ATHLETICS_XP_PER_SECOND * HOUR;
  assert.ok(
    bestCaseXp < xpToReachRank(15),
    `an hour of walking earns ${bestCaseXp} xp but rank 15 needs ${xpToReachRank(15)}`
  );
});

test('walking does not out-train fighting', () => {
  // A weapon skill earns COMBAT_SKILL_XP per swing at roughly one swing a second.
  // Athletics used to earn 4x that for doing nothing, which compounded — it is the
  // skill that shortens the walks it trains on.
  assert.ok(ATHLETICS_XP_PER_SECOND <= COMBAT_SKILL_XP * 2);
});

test('the walk out of Holtburg is minutes, not an hour', () => {
  // Reaching Glenden Wood is what gates the first Enlightenment, so its base walk
  // is most of the pacing budget. A fresh hero should not spend the whole session
  // on the road, and a little Athletics should visibly pay off.
  const glenden = getRegion(ENLIGHTENMENT_MIN_REGION);
  assert.ok(glenden.walkSeconds <= 25 * 60, 'base walk should be at most 25 minutes');
  assert.ok(modifiedWalkTime(glenden.walkSeconds, 8) < 15 * 60, 'rank-8 Athletics should get it under 15 minutes');
});

test('regions get further out in order', () => {
  const walks = REGIONS.map((r) => r.walkSeconds);
  for (let i = 1; i < walks.length; i++) {
    assert.ok(walks[i] > walks[i - 1], `${REGIONS[i].id} should be further out than ${REGIONS[i - 1].id}`);
  }
});

test('the first Enlightenment pays exactly one soul at the level it is reached', () => {
  // The one-hour path lands in Glenden Wood (region index 1) around level 6-8.
  for (const level of [6, 7, 8]) assert.equal(soulsForRun(1, level), 1);
  assert.equal(soulsForRun(0, 50), 0); // Holtburg alone never counts, however long you grind it
  assert.ok(soulsForRun(2, 20) > soulsForRun(1, 8)); // and pushing further out pays more
});
