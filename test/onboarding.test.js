import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { setHeroName, answerSeenLifestone, acknowledgeAlcottIntro } from '../src/game/onboarding.js';
import { startTravelToRegion } from '../src/game/travel.js';
import { tickCombat, fleeTutorialEncounter } from '../src/game/combat.js';
import { recallTo, canRecall } from '../src/game/lifestone.js';

test('naming the hero advances to the Lifestone question', () => {
  const s = createInitialState();
  assert.equal(s.onboarding.step, 'name');
  assert.equal(setHeroName(s, '  '), false); // blank name rejected
  assert.equal(setHeroName(s, 'Theron'), true);
  assert.equal(s.hero.name, 'Theron');
  assert.equal(s.onboarding.step, 'seen-lifestone');
});

test('answering "yes" skips straight to the ordinary game', () => {
  const s = createInitialState();
  setHeroName(s, 'Theron');
  answerSeenLifestone(s, true);
  assert.equal(s.onboarding.step, 'done');
  assert.equal(s.onboarding.tutorialPending, false);
});

test('answering "no" leads through Alcott\'s explanation into the tutorial journey', () => {
  const s = createInitialState();
  setHeroName(s, 'Theron');
  answerSeenLifestone(s, false);
  assert.equal(s.onboarding.step, 'alcott-explains');
  acknowledgeAlcottIntro(s);
  assert.equal(s.onboarding.step, 'done');
  assert.equal(s.onboarding.tutorialPending, true);

  assert.equal(startTravelToRegion(s, 'holtburg'), true);
  assert.ok(s.travel.tutorial);
  assert.equal(s.travel.duration, 180);
  assert.equal(s.location.poiId, 'tutorial-road');
});

test('the tutorial journey runs combat in parallel with the countdown and can be fled', () => {
  const s = createInitialState();
  setHeroName(s, 'Theron');
  answerSeenLifestone(s, false);
  acknowledgeAlcottIntro(s);
  startTravelToRegion(s, 'holtburg');

  for (let i = 0; i < 20; i++) tickCombat(s, 0.25);
  assert.ok(s.travel); // still walking
  assert.ok(s.travel.remaining < 180); // countdown is moving
  if (s.monster) assert.equal(fleeTutorialEncounter(s), true);

  let ticks = 0;
  while (s.travel && ticks < 5000) {
    tickCombat(s, 0.25);
    ticks++;
  }
  assert.equal(s.travel, null);
  assert.equal(s.location.regionId, 'holtburg');
  assert.equal(s.onboarding.tutorialPending, false);
});

test('dying for the first time unlocks Lifestone Recall', () => {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId: 'holtburg-meeting-hall' };
  s.hero.end = 1; // squishy, dies fast
  assert.equal(s.progress.recallUnlocked, false);
  let ticks = 0;
  while (!s.progress.recallUnlocked && ticks < 2000) {
    tickCombat(s, 0.25);
    ticks++;
  }
  assert.equal(s.progress.recallUnlocked, true);
  assert.equal(s.progress.firstDeathHandled, true);
});

test('recall instantly moves the hero to an unlocked region and starts its cooldown', () => {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg', 'glenden-wood'];
  s.progress.recallUnlocked = true;
  s.location = { regionId: 'holtburg', poiId: 'holtburg-meeting-hall' };
  assert.equal(canRecall(s), true);

  assert.equal(recallTo(s, 'glenden-wood'), true);
  assert.equal(s.location.regionId, 'glenden-wood');
  assert.equal(s.location.poiId, null);
  assert.ok(s.progress.recallCooldown > 0);
  assert.equal(canRecall(s), false); // on cooldown now

  // Can't recall to a region never unlocked.
  s.progress.recallCooldown = 0;
  assert.equal(recallTo(s, 'direlands'), false);
});
