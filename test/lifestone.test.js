import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { tickCombat } from '../src/game/combat.js';
import { derivedStats } from '../src/game/hero.js';
import { isSite, getPoiById } from '../src/data/regions.js';
import {
  sacrificeVitae,
  canSacrificeVitae,
  offeringCost,
  isGrown,
  lifestoneGrowth,
  respawnAtLifestone,
  LIFESTONE_GROWTH_REQUIRED,
  GROWTH_PER_OFFERING,
} from '../src/game/lifestone.js';
import { startMeditating, tickMeditation, isRested } from '../src/game/meditation.js';

const SITE = 'budding-lifestone';

function atSite() {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId: SITE };
  const d = derivedStats(s);
  s.hero.hp = d.maxHp;
  s.hero.stamina = d.maxStamina;
  s.hero.mana = d.maxMana;
  return s;
}

test('the budding Lifestone is a site: no monsters, no combat', () => {
  const poi = getPoiById(SITE);
  assert.ok(isSite(poi));
  const s = atSite();
  for (let i = 0; i < 40; i++) tickCombat(s, 0.25);
  assert.equal(s.monster, null);
  assert.equal(s.progress.totalKills, 0);
});

test('a fresh hero is bound to the roadside stone, a full walk short of Holtburg', () => {
  const s = createInitialState();
  assert.deepEqual(s.progress.boundLifestone, { regionId: null, poiId: null });
});

test('an offering costs a big bite of HP and mana and cannot be repeated on empty', () => {
  const s = atSite();
  const cost = offeringCost(s);
  assert.ok(cost.hp > 0 && cost.mana > 0);

  assert.equal(sacrificeVitae(s, SITE), true);
  assert.equal(lifestoneGrowth(s, SITE), GROWTH_PER_OFFERING);
  assert.ok(s.hero.hp < derivedStats(s).maxHp);

  // 60% of each vital is gone, so a second offering has to wait for a refill.
  assert.equal(canSacrificeVitae(s, SITE), false);
  assert.equal(sacrificeVitae(s, SITE), false);
});

test('meditation refills vitals so the next offering can be made', () => {
  const s = atSite();
  sacrificeVitae(s, SITE);
  assert.ok(!isRested(s));

  assert.equal(startMeditating(s), true);
  for (let i = 0; i < 2000 && s.meditating; i++) tickMeditation(s, 0.25);
  assert.equal(s.meditating, false); // stops itself once rested
  assert.ok(isRested(s));
  assert.equal(canSacrificeVitae(s, SITE), true);
});

test('meditating suspends combat rather than running alongside it', () => {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId: 'drudge-hideout' };
  s.hero.hp = 1;
  startMeditating(s);
  for (let i = 0; i < 10; i++) tickCombat(s, 0.25);
  assert.equal(s.monster, null);
  assert.equal(s.progress.totalKills, 0);
  assert.ok(s.hero.hp > 1);
});

test('fully growing the Lifestone rebinds the hero to the region hub', () => {
  const s = atSite();
  const d = derivedStats(s);
  for (let i = 0; i < LIFESTONE_GROWTH_REQUIRED / GROWTH_PER_OFFERING; i++) {
    s.hero.hp = d.maxHp;
    s.hero.mana = d.maxMana;
    assert.equal(sacrificeVitae(s, SITE), true);
  }
  assert.ok(isGrown(s, SITE));
  assert.deepEqual(s.progress.boundLifestone, { regionId: 'holtburg', poiId: null });
  assert.equal(s.progress.recallUnlocked, true);
  assert.equal(sacrificeVitae(s, SITE), false); // nothing left to grow
});

test('respawning moves the hero to their bound Lifestone and resets the wave', () => {
  const s = createInitialState();
  s.progress.boundLifestone = { regionId: 'holtburg', poiId: null };
  s.location = { regionId: 'holtburg', poiId: 'daiklos' };
  s.progress.wave = 7;
  s.progress.waveMonstersLeft = 2;

  assert.equal(respawnAtLifestone(s), true);
  assert.deepEqual(s.location, { regionId: 'holtburg', poiId: null });
  assert.equal(s.progress.wave, 1);
  assert.equal(s.progress.waveMonstersLeft, 0);
  assert.equal(respawnAtLifestone(s), false); // already standing there
});
